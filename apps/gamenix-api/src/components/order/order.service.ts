import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, ObjectId, Types } from 'mongoose';
import { Order } from '../../libs/dto/order/order';
import { OrderInput, OrdersInquiry } from '../../libs/dto/order/order.input';
import { OrderUpdate } from '../../libs/dto/order/order.update';
import { OrderItem } from '../../libs/dto/order-item/order-item';
import { Product } from '../../libs/dto/product/product';
import { Member } from '../../libs/dto/member/member';
import { OrderDeliveryType, OrderStatus } from '../../libs/enums/order.enum';
import { ProductStatus, ProductType } from '../../libs/enums/product.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { MemberService } from '../member/member.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class OrderService {
    constructor(
        @InjectModel('Order')
        private readonly orderModel: Model<Order>,
        @InjectModel('OrderItem')
        private readonly orderItemModel: Model<OrderItem>,
        @InjectModel('Product')
        private readonly productModel: Model<Product>,
        @InjectModel('Member')
        private readonly memberModel: Model<Member>,
        private readonly memberService: MemberService,
        @Optional() private readonly notificationService?: NotificationService,
    ) { }

    public async createOrder(
        memberId: ObjectId,
        input: OrderInput,
    ): Promise<Order> {
        memberId = shapeIntoMongoObjectId(memberId);
        const member = await this.memberModel
            .exists({ _id: memberId, memberStatus: MemberStatus.ACTIVE })
            .exec();
        if (!member) throw new ForbiddenException('An active member is required');

        const productIds = input.orderItems.map((item) => shapeIntoMongoObjectId(item.productId));
        const search: FilterQuery<Product> = {
            _id: { $in: productIds },
            productStatus: ProductStatus.PROCESS,
            deletedAt: null,
        };

        const products: Product[] = await this.productModel.find(search).exec();

        const orderItems = input.orderItems.map((item) => {
            const product = products.find((product) => String(product._id) === String(item.productId));
            if (!product) throw new NotFoundException('Product not found');
            if (product.productLeftCount < item.itemQuantity) throw new ConflictException('Insufficient product stock');

            return {
                productId: product._id,
                itemQuantity: item.itemQuantity,
                itemPrice: product.productPrice,
            };
        });

        const shopId = products[0].memberId;
        if (products.some((product) => String(product.memberId) !== String(shopId))) {
            throw new BadRequestException('All products must belong to the same shop');
        }
        const shop = await this.memberModel
            .exists({
                _id: shopId,
                memberType: MemberType.SHOP,
                memberStatus: MemberStatus.ACTIVE,
            })
            .exec();
        if (!shop) throw new ForbiddenException('An active shop is required');

        const subtotal = orderItems.reduce((total, item) => total + item.itemPrice * item.itemQuantity, 0);
        const orderDeliveryType = input.orderDeliveryType ?? OrderDeliveryType.DELIVERY;
        const hasFurniture = products.some((product) =>
            product.productType === ProductType.CHAIR || product.productType === ProductType.DESK
        );
        let orderDelivery = 0;
        if (orderDeliveryType === OrderDeliveryType.DELIVERY) {
            if (hasFurniture) orderDelivery = 15;
            else if (subtotal < 100) orderDelivery = 5;
        }

        const result: Order = await this.orderModel.create({
            memberId: memberId,
            shopId: shopId,
            orderTotal: Math.round((subtotal + orderDelivery) * 100) / 100,
            orderDelivery: orderDelivery,
            orderAddress: input.orderAddress?.trim(),
            orderDeliveryType: orderDeliveryType,
        });

        await this.recordOrderItem(result._id, orderItems);
        await this.notificationService?.notifyOrderCreated(
            new Types.ObjectId(String(result._id)), new Types.ObjectId(String(memberId)), new Types.ObjectId(String(shopId)),
        );
        return result;
    }

    private async recordOrderItem(
        orderId: ObjectId,
        input: { productId: ObjectId; itemQuantity: number; itemPrice: number }[],
    ): Promise<void> {
        await Promise.all(
            input.map((item) => this.orderItemModel.create({ ...item, orderId: orderId })),
        );
    }

    public async getMyOrders(
        memberId: ObjectId,
        input: OrdersInquiry,
    ): Promise<Order[]> {
        const { page, limit, orderStatus } = input;
        const match: FilterQuery<Order> = {
            memberId: shapeIntoMongoObjectId(memberId),
        };
        if (orderStatus) match.orderStatus = orderStatus;

        const result: Order[] = await this.orderModel
            .aggregate<Order>([
                { $match: match },
                { $sort: { updatedAt: -1, _id: -1 } },
                { $skip: (page - 1) * limit },
                { $limit: limit },
                {
                    $lookup: {
                        from: 'orderItems',
                        localField: '_id',
                        foreignField: 'orderId',
                        as: 'orderItems',
                    },
                },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'orderItems.productId',
                        foreignField: '_id',
                        as: 'productData',
                    },
                },
            ])
            .exec();

        return result;
    }

    public async updateOrder(
        memberId: ObjectId,
        input: OrderUpdate,
    ): Promise<Order> {
        const { _id, orderStatus } = input;
        memberId = shapeIntoMongoObjectId(memberId);
        const orderId = shapeIntoMongoObjectId(_id);

        const member = await this.memberModel
            .exists({ _id: memberId, memberStatus: MemberStatus.ACTIVE })
            .exec();
        if (!member) throw new ForbiddenException('An active member is required');

        const search: FilterQuery<Order> = {
            memberId: memberId,
            _id: orderId,
        };
        const targetOrder: Order = await this.orderModel
            .findOne(search)
            .exec();
        if (!targetOrder) throw new NotFoundException('Order not found');
        if (targetOrder.orderStatus === orderStatus) return targetOrder;

        // PAUSE → PROCESS → FINISHED. A finished order has no next status.
        const nextStatus = {
            [OrderStatus.PAUSE]: OrderStatus.PROCESS,
            [OrderStatus.PROCESS]: OrderStatus.FINISHED,
            [OrderStatus.FINISHED]: null,
        }[targetOrder.orderStatus];
        if (orderStatus !== nextStatus) throw new BadRequestException('Invalid order status transition');

        if (orderStatus === OrderStatus.PROCESS) {
            const shop = await this.memberModel
                .exists({
                    _id: targetOrder.shopId,
                    memberType: MemberType.SHOP,
                    memberStatus: MemberStatus.ACTIVE,
                })
                .exec();
            if (!shop) throw new ForbiddenException('An active shop is required');
        }

        // Claim the transition before changing stock or points, so it cannot run twice.
        const result: Order = await this.orderModel
            .findOneAndUpdate(
                { memberId: memberId, _id: orderId, orderStatus: targetOrder.orderStatus },
                { orderStatus: orderStatus },
                { new: true },
            )
            .exec();
        if (!result) throw new ConflictException('Order status changed; retry the request');

        // Finishing an order only changes its status.
        if (orderStatus === OrderStatus.FINISHED) {
            await this.notificationService?.notifyOrderStatusChanged(
                new Types.ObjectId(String(orderId)), new Types.ObjectId(String(memberId)), new Types.ObjectId(String(targetOrder.shopId)), orderStatus,
            );
            return result;
        }

        // Processing an order deducts stock and gives the buyer one point.
        const orderItems: OrderItem[] = await this.orderItemModel
            .find({ orderId: orderId })
            .exec();
        if (!orderItems.length) throw new ConflictException('Order contains no items');

        for (const item of orderItems) {
            const product: Product = await this.productModel
                .findOneAndUpdate(
                    {
                        _id: item.productId,
                        memberId: targetOrder.shopId,
                        productStatus: ProductStatus.PROCESS,
                        deletedAt: null,
                        productLeftCount: { $gte: item.itemQuantity },
                    },
                    { $inc: { productLeftCount: -item.itemQuantity } },
                    { new: true },
                )
                .exec();
            if (!product) throw new ConflictException('Product unavailable or insufficient stock');
        }

        const updatedMember: Member = await this.memberService.memberStatsEditor({
            _id: memberId,
            targetKey: 'memberPoints',
            modifier: 1,
        });
        if (!updatedMember) throw new ForbiddenException('An active member is required');

        await this.notificationService?.notifyOrderStatusChanged(
            new Types.ObjectId(String(orderId)), new Types.ObjectId(String(memberId)), new Types.ObjectId(String(targetOrder.shopId)), orderStatus,
        );

        return result;
    }
}
