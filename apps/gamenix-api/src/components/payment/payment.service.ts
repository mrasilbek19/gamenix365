import {
    BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { Order } from '../../libs/dto/order/order';
import { OrderItem } from '../../libs/dto/order-item/order-item';
import { Product } from '../../libs/dto/product/product';
import { Member } from '../../libs/dto/member/member';
import { KakaoPayPaymentStatus } from '../../libs/dto/payment/kakao-checkout';
import { KakaoPayPaymentRecord } from '../../libs/schemas/KakaoPayPayment.model';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { OrderStatus } from '../../libs/enums/order.enum';
import { PaymentStatus } from '../../libs/enums/payment.enum';

/** Shared saved-order validation and owner-only payment projection. Provider calls stay in the direct service. */
@Injectable()
export class PaymentService {
    constructor(
        @InjectModel('KakaoPayPayment') private readonly paymentModel: Model<KakaoPayPaymentRecord>,
        @InjectModel('Order') private readonly orderModel: Model<Order>,
        @InjectModel('OrderItem') private readonly orderItemModel: Model<OrderItem>,
        @InjectModel('Member') private readonly memberModel: Model<Member>,
        @InjectModel('Product') private readonly productModel: Model<Product>,
    ) {}

    public async getPayableOrder(memberId: ObjectId, orderId: string): Promise<Order> {
        const order = await this.getOwnedOrder(memberId, orderId);
        if (order.orderStatus !== OrderStatus.PAUSE) throw new ConflictException('Only a saved awaiting-confirmation order can start payment');
        await this.requireActiveMembers(order);
        order.orderItems = await this.assertOrderAmounts(order);
        const legacy = await this.paymentModel.db.collection('payments').findOne(
            { orderId: { $in: [order._id, String(order._id)] } }, { projection: { _id: 1 } },
        );
        if (legacy) throw new ConflictException('This order has historical payment records; manual review is required');
        return order;
    }

    public async getKakaoPayPaymentStatus(memberId: ObjectId, orderId: string): Promise<KakaoPayPaymentStatus> {
        const order = await this.getOwnedOrder(memberId, orderId);
        const result = await this.findPayment(order);
        if (result) this.assertAttempt(result, order);
        return this.paymentStatus(order, result);
    }

    public async getOwnedOrder(memberId: ObjectId, orderId: string): Promise<Order> {
        if (!/^[a-f\d]{24}$/i.test(String(memberId)) || !/^[a-f\d]{24}$/i.test(orderId)) {
            throw new BadRequestException('Invalid order reference');
        }
        const order = await this.orderModel.findOne({
            _id: new Types.ObjectId(orderId), memberId: new Types.ObjectId(String(memberId)),
        }).lean().exec();
        if (!order) throw new NotFoundException('Order not found');
        return order;
    }

    public async requireActiveMembers(order: Order): Promise<void> {
        const buyer = await this.memberModel.exists({ _id: order.memberId, memberStatus: MemberStatus.ACTIVE }).exec();
        const shop = await this.memberModel.exists({ _id: order.shopId, memberType: MemberType.SHOP, memberStatus: MemberStatus.ACTIVE }).exec();
        if (!buyer || !shop) throw new ForbiddenException('An active buyer and shop are required');
    }

    private async assertOrderAmounts(order: Order): Promise<OrderItem[]> {
        if (order.currency !== 'KRW' || !Number.isSafeInteger(order.orderTotal) || order.orderTotal <= 0 ||
            !Number.isSafeInteger(order.orderDelivery) || order.orderDelivery < 0) {
            throw new BadRequestException('Only valid saved KRW orders can start payment');
        }
        const items = await this.orderItemModel.find({ orderId: order._id }).lean().exec();
        if (!items.length || items.some((item) => item.currency !== 'KRW' ||
            !Number.isSafeInteger(item.itemPrice) || item.itemPrice < 0 ||
            !Number.isSafeInteger(item.itemQuantity) || item.itemQuantity < 1 ||
            !Number.isSafeInteger(item.itemPrice * item.itemQuantity))) {
            throw new BadRequestException('Order item snapshots are incomplete');
        }
        const subtotal = items.reduce((total, item) => total + item.itemPrice * item.itemQuantity, 0);
        if (!Number.isSafeInteger(subtotal) || subtotal + order.orderDelivery !== order.orderTotal ||
            (order.orderSubtotal != null && order.orderSubtotal !== subtotal)) {
            throw new BadRequestException('Order total does not match its saved item snapshots');
        }
        const ids = [...new Set(items.map((item) => String(item.productId)))];
        const products = await this.productModel.find({ _id: { $in: ids } }).lean().exec();
        if (products.length !== ids.length || products.some((product) => String(product.memberId) !== String(order.shopId))) {
            throw new BadRequestException('All order products must belong to the saved shop');
        }
        return items;
    }

    private findPayment(order: Order) {
        return this.paymentModel.findOne({ orderId: order._id, memberId: order.memberId }).lean().exec();
    }

    public assertAttempt(attempt: KakaoPayPaymentRecord, order: Order): void {
        if (!attempt || String(attempt.orderId) !== String(order._id) || String(attempt.memberId) !== String(order.memberId) ||
            String(attempt.shopId) !== String(order.shopId) || attempt.totalAmount !== order.orderTotal ||
            attempt.currency !== order.currency || !attempt.paymentId) {
            throw new ConflictException('Saved payment does not match this order; manual review is required');
        }
    }

    public canRetryPreparation(attempt: KakaoPayPaymentRecord): boolean {
        // Ready creates no charge. Without a saved TID no checkout URL was returned and approval cannot run.
        return attempt?.provider === 'DIRECT' && ['UNCERTAIN', 'REJECTED'].includes(attempt.readyState) &&
            [PaymentStatus.PENDING, PaymentStatus.FAILED].includes(attempt.status) && attempt.verifiedSuccess === false &&
            attempt.approvalState === 'WAITING' && !attempt.tid && !attempt.transactionId && !attempt.paidAt &&
            !attempt.approvalClaimId && !attempt.cancellationRequestedAt && !attempt.cancelledAt &&
            !attempt.nextRedirectPcUrl && !attempt.nextRedirectMobileUrl;
    }

    private paymentStatus(order: Order, attempt?: KakaoPayPaymentRecord): KakaoPayPaymentStatus {
        return {
            provider: attempt ? attempt.provider ?? 'PORTONE' : 'DIRECT', orderId: String(order._id), paymentId: attempt?.paymentId,
            status: attempt?.status ?? 'NOT_STARTED', order,
            verifiedSuccess: attempt?.status === PaymentStatus.PAID && attempt.verifiedSuccess === true &&
                Boolean(attempt.transactionId && attempt.paidAt && Number.isFinite(new Date(attempt.paidAt).getTime())),
            paidAt: attempt?.paidAt, paymentMethod: attempt?.paymentMethod,
            cancellationPending: Boolean(attempt?.cancellationRequestedAt && attempt.status !== PaymentStatus.CANCELLED),
            preparationRetryable: this.canRetryPreparation(attempt),
            preparationError: attempt?.preparationError || (this.canRetryPreparation(attempt)
                ? 'Checkout was not opened. Retry payment for this saved order.' : undefined),
        };
    }

    public async requireUniqueIndexes(): Promise<void> {
        let indexes;
        try { indexes = await this.paymentModel.collection.listIndexes().toArray(); }
        catch { throw new ServiceUnavailableException('Payment unique indexes are unavailable; checkout was not started'); }
        for (const key of ['orderId', 'paymentId']) {
            if (!indexes.some((index) => index.unique === true && !index.sparse && !index.partialFilterExpression &&
                Object.keys(index.key).length === 1 && index.key[key] === 1)) {
                throw new ServiceUnavailableException('Payment unique indexes are unavailable; checkout was not started');
            }
        }
    }
}
