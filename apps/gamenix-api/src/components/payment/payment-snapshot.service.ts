import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Member } from '../../libs/dto/member/member';
import { Order } from '../../libs/dto/order/order';
import { OrderItem } from '../../libs/dto/order-item/order-item';
import { Product } from '../../libs/dto/product/product';
import { PaymentOrderSnapshot } from '../../libs/dto/payment/payment-record';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { OrderDeliveryType, OrderStatus } from '../../libs/enums/order.enum';
import { ProductStatus } from '../../libs/enums/product.enum';

/** Convert stored decimal USD exactly; never silently round fractional cents. */
export function usdCents(value: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || !/^\d+(\.\d{1,2})?$/.test(String(value))) {
        throw new BadRequestException('Order contains an invalid USD amount');
    }
    const [whole, fraction = ''] = String(value).split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents)) throw new BadRequestException('Order amount exceeds supported precision');
    return cents;
}

@Injectable()
export class PaymentSnapshotService {
    constructor(
        @InjectModel('Order') private readonly orders: Model<Order>,
        @InjectModel('OrderItem') private readonly items: Model<OrderItem>,
        @InjectModel('Product') private readonly products: Model<Product>,
        @InjectModel('Member') private readonly members: Model<Member>,
    ) {}

    public async ownedOrder(memberId: Types.ObjectId, orderId: Types.ObjectId): Promise<Order> {
        const order = await this.orders.findOne({ _id: orderId, memberId }).lean().exec();
        if (!order) throw new NotFoundException('Order not found');
        return order as unknown as Order;
    }

    public async build(memberId: Types.ObjectId, orderId: Types.ObjectId): Promise<{ shopId: Types.ObjectId; snapshot: PaymentOrderSnapshot }> {
        const order = await this.ownedOrder(memberId, orderId);
        if (order.orderStatus !== OrderStatus.PAUSE) throw new ConflictException('Only an awaiting-confirmation order can start checkout');
        if (!await this.members.exists({ _id: memberId, memberStatus: MemberStatus.ACTIVE }).exec()) {
            throw new ForbiddenException('An active member is required');
        }
        if (!order.shopId || !await this.members.exists({ _id: order.shopId, memberType: MemberType.SHOP, memberStatus: MemberStatus.ACTIVE }).exec()) {
            throw new ForbiddenException('An active shop is required');
        }
        const items = await this.items.find({ orderId }).sort({ _id: 1 }).lean().exec();
        if (!items.length) throw new ConflictException('Order contains no items');
        const products = await this.products.find({ _id: { $in: items.map((item) => item.productId) } }).lean().exec();
        const quantities = new Map<string, number>();
        let subtotalMinor = 0;
        const lines = items.map((item) => {
            if (String(item.orderId) !== String(orderId) || !Number.isSafeInteger(item.itemQuantity) || item.itemQuantity < 1) {
                throw new ConflictException('Order contains invalid items');
            }
            const product = products.find((entry) => String(entry._id) === String(item.productId));
            if (!product || String(product.memberId) !== String(order.shopId)) throw new ConflictException('All products must belong to the order shop');
            if (product.productStatus !== ProductStatus.PROCESS || product.deletedAt) throw new ConflictException('Product is unavailable');
            const quantity = (quantities.get(String(item.productId)) ?? 0) + item.itemQuantity;
            if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(product.productLeftCount)
                || quantity > product.productLeftCount) throw new ConflictException('Insufficient product stock');
            quantities.set(String(item.productId), quantity);
            const unitAmountMinor = usdCents(item.itemPrice);
            const lineTotal = unitAmountMinor * item.itemQuantity;
            subtotalMinor += lineTotal;
            if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotalMinor)) throw new ConflictException('Order amount exceeds supported precision');
            return { productId: new Types.ObjectId(String(item.productId)), name: product.productName, quantity: item.itemQuantity, unitAmountMinor };
        });
        const shippingMinor = usdCents(order.orderDelivery);
        const totalMinor = usdCents(order.orderTotal);
        if (!Object.values(OrderDeliveryType).includes(order.orderDeliveryType) ||
            (order.orderDeliveryType === OrderDeliveryType.PICKUP && shippingMinor !== 0) ||
            (order.orderDeliveryType === OrderDeliveryType.DELIVERY && !order.orderAddress?.trim()) ||
            !Number.isSafeInteger(subtotalMinor + shippingMinor) || subtotalMinor + shippingMinor !== totalMinor || totalMinor <= 0) {
            throw new ConflictException('Persisted order totals or fulfillment details are inconsistent');
        }
        return { shopId: new Types.ObjectId(String(order.shopId)), snapshot: {
            reference: String(orderId), status: order.orderStatus, deliveryType: order.orderDeliveryType,
            sourceCurrency: 'USD', lines, subtotalMinor, shippingMinor, totalMinor,
        } };
    }
}
