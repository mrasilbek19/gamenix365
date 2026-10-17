import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isEmail } from 'class-validator';
import { randomUUID } from 'crypto';
import { Model, ObjectId, Types } from 'mongoose';
import { EmailDelivery, OrderEmailSnapshot } from '../../libs/dto/mail/email-delivery';
import { Member } from '../../libs/dto/member/member';
import { Order } from '../../libs/dto/order/order';
import { OrderItem } from '../../libs/dto/order-item/order-item';
import { Product } from '../../libs/dto/product/product';
import { EmailDeliveryState, EmailDeliveryTemplate } from '../../libs/enums/email-delivery.enum';
import { MemberStatus } from '../../libs/enums/member.enum';
import { OrderDeliveryType, OrderStatus } from '../../libs/enums/order.enum';
import { ORDER_EMAIL_BATCH_SIZE, ORDER_EMAIL_LEASE_MS, ORDER_EMAIL_MAX_ATTEMPTS, ORDER_EMAIL_RETRY_DELAYS_MS } from '../../libs/order-email.config';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OrderEmailService implements OnModuleInit {
    private readonly logger = new Logger(OrderEmailService.name);

    constructor(
        @InjectModel('EmailDelivery') private readonly deliveryModel: Model<EmailDelivery>,
        @InjectModel('Member') private readonly memberModel: Model<Member>,
        @InjectModel('Order') private readonly orderModel: Model<Order>,
        @InjectModel('OrderItem') private readonly orderItemModel: Model<OrderItem>,
        @InjectModel('Product') private readonly productModel: Model<Product>,
        private readonly mailService: MailService,
    ) {}

    public async onModuleInit(): Promise<void> {
        // Do not accept work before MongoDB enforces the event-key uniqueness constraint.
        await this.deliveryModel.init();
    }

    /** Called only after a successful order operation. SMTP is never performed in the API request. */
    public async enqueueOrderEmail(memberId: ObjectId, orderId: ObjectId, template: EmailDeliveryTemplate, status: OrderStatus): Promise<boolean> {
        try {
            const member = await this.memberModel.findOne({
                _id: new Types.ObjectId(String(memberId)), memberStatus: MemberStatus.ACTIVE,
                deletedAt: null, memberEmailVerified: true,
            }).select('+memberEmail +memberEmailVersion').lean().exec();
            if (!member?.memberEmail || !isEmail(member.memberEmail)) return false;

            const eventKey = template === EmailDeliveryTemplate.ORDER_CREATED
                ? `order:${orderId}:created`
                : `order:${orderId}:status:${status}`;
            const result = await this.deliveryModel.updateOne({ eventKey }, { $setOnInsert: {
                eventKey,
                memberId: new Types.ObjectId(String(memberId)),
                orderId: new Types.ObjectId(String(orderId)),
                recipient: member.memberEmail,
                emailVersion: member.memberEmailVersion ?? 0,
                template,
                orderStatus: status,
                state: EmailDeliveryState.PENDING,
                attempts: 0,
                nextAttemptAt: new Date(),
            } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true }).exec();
            return result.upsertedCount === 1;
        } catch (error) {
            if (error?.code !== 11000) this.logger.error('Order email could not be queued');
            // Preserve the existing separate-write order policy: email failures never reverse an order.
            return false;
        }
    }

    /** Batch application only. Atomic leases allow multiple batch processes to share the queue. */
    public async processDueEmails(): Promise<number> {
        await this.deliveryModel.updateMany({
            state: EmailDeliveryState.SENDING,
            lockedUntil: { $lte: new Date() },
            attempts: { $gte: ORDER_EMAIL_MAX_ATTEMPTS },
        }, { $set: {
            state: EmailDeliveryState.FAILED, nextAttemptAt: null, lockedUntil: null, lockToken: null,
            lastError: 'ATTEMPTS_EXHAUSTED',
        } }).exec();

        let processed = 0;
        while (processed < ORDER_EMAIL_BATCH_SIZE) {
            const now = new Date();
            const delivery = await this.deliveryModel.findOneAndUpdate({
                attempts: { $lt: ORDER_EMAIL_MAX_ATTEMPTS },
                $or: [
                    { state: EmailDeliveryState.PENDING, nextAttemptAt: { $lte: now } },
                    { state: EmailDeliveryState.SENDING, lockedUntil: { $lte: now } },
                ],
            }, {
                $inc: { attempts: 1 },
                $set: { state: EmailDeliveryState.SENDING, lockedUntil: new Date(now.getTime() + ORDER_EMAIL_LEASE_MS), lockToken: randomUUID() },
            }, { new: true, sort: { nextAttemptAt: 1, _id: 1 } }).lean().exec();
            if (!delivery) break;
            processed++;
            await this.deliverEmail(delivery);
        }
        return processed;
    }

    private async deliverEmail(delivery: EmailDelivery): Promise<void> {
        const search = { _id: delivery._id, state: EmailDeliveryState.SENDING, lockToken: delivery.lockToken };
        let acceptedByTransport = false;
        try {
            let snapshot = delivery.snapshot;
            if (!snapshot) {
                snapshot = await this.loadSnapshot(delivery);
                const stored = await this.deliveryModel.updateOne(search, { $set: { snapshot } }, { runValidators: true }).exec();
                if (!stored.matchedCount) return;
            }

            // Recheck on every attempt; never redirect an old order email to a new/unverified address.
            const recipient = await this.memberModel.exists({
                _id: delivery.memberId, memberStatus: MemberStatus.ACTIVE, deletedAt: null,
                memberEmail: delivery.recipient, memberEmailVerified: true,
                $expr: { $eq: [{ $ifNull: ['$memberEmailVersion', 0] }, delivery.emailVersion] },
            }).exec();
            if (!recipient) {
                await this.deliveryModel.updateOne(search, { $set: {
                    state: EmailDeliveryState.SKIPPED, nextAttemptAt: null, lockedUntil: null, lockToken: null,
                    lastError: 'RECIPIENT_CHANGED',
                } }).exec();
                return;
            }

            const lease = await this.deliveryModel.updateOne({ ...search, lockedUntil: { $gt: new Date() } },
                { $set: { lockedUntil: new Date(Date.now() + ORDER_EMAIL_LEASE_MS) } }).exec();
            if (!lease.matchedCount) return;
            await this.mailService.sendOrderEmail(delivery.recipient, delivery.template, snapshot, String(delivery._id));
            acceptedByTransport = true;
            const saved = await this.deliveryModel.updateOne(search, { $set: {
                state: EmailDeliveryState.SENT, sentAt: new Date(), nextAttemptAt: null,
                lockedUntil: null, lockToken: null, lastError: null,
            } }).exec();
            if (!saved.matchedCount) this.logger.error('Order email acknowledgement lost its lease');
        } catch {
            if (acceptedByTransport) {
                // SMTP acceptance and MongoDB acknowledgement cannot be made atomic.
                this.logger.error('Order email acknowledgement failed; the lease will require recovery');
                return;
            }
            const exhausted = delivery.attempts >= ORDER_EMAIL_MAX_ATTEMPTS;
            await this.deliveryModel.updateOne(search, { $set: {
                state: exhausted ? EmailDeliveryState.FAILED : EmailDeliveryState.PENDING,
                nextAttemptAt: exhausted ? null : new Date(Date.now() + ORDER_EMAIL_RETRY_DELAYS_MS[delivery.attempts - 1]),
                lockedUntil: null, lockToken: null, lastError: 'DELIVERY_FAILED',
            } }).exec();
            this.logger.warn('Order email attempt failed');
        }
    }

    private async loadSnapshot(delivery: EmailDelivery): Promise<OrderEmailSnapshot> {
        const order = await this.orderModel.findOne({ _id: delivery.orderId, memberId: delivery.memberId }).lean().exec();
        if (!order) throw new Error('Order unavailable');
        const items = await this.orderItemModel.find({ orderId: delivery.orderId }).sort({ _id: 1 }).lean().exec();
        if (!items.length || items.some((item) => !Number.isInteger(item.itemQuantity) || item.itemQuantity < 1 ||
            !Number.isFinite(item.itemPrice) || item.itemPrice < 0)) throw new Error('Invalid persisted order items');
        const subtotal = items.reduce((total, item) => total + item.itemPrice * item.itemQuantity, 0);
        if (![order.orderDelivery, order.orderTotal].every((value) => Number.isFinite(value) && value >= 0) ||
            Math.abs(Math.round((subtotal + order.orderDelivery) * 100) / 100 - order.orderTotal) > 0.000001 ||
            !Object.values(OrderDeliveryType).includes(order.orderDeliveryType) ||
            (order.orderDeliveryType === OrderDeliveryType.PICKUP && order.orderDelivery !== 0) ||
            (order.orderDeliveryType === OrderDeliveryType.DELIVERY && !order.orderAddress?.trim())) {
            throw new Error('Invalid persisted order totals or fulfillment');
        }
        const products = await this.productModel.find({ _id: { $in: items.map((item) => item.productId) } })
            .select('productName').lean().exec();
        return {
            reference: String(order._id),
            status: delivery.orderStatus,
            deliveryType: order.orderDeliveryType,
            address: order.orderDeliveryType === OrderDeliveryType.DELIVERY ? order.orderAddress : undefined,
            lines: items.map((item) => ({
                name: products.find((product) => String(product._id) === String(item.productId))?.productName || `Product ${item.productId} (name unavailable)`,
                quantity: item.itemQuantity,
                price: item.itemPrice,
            })),
            shippingFee: order.orderDelivery,
            total: order.orderTotal,
        };
    }
}
