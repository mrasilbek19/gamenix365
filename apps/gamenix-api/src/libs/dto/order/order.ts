import { Field, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { OrderDeliveryType, OrderStatus } from '../../enums/order.enum';
import { OrderItem } from '../order-item/order-item';
import { Product } from '../product/product';

@ObjectType()
export class Order {
    @Field(() => String)
    currency?: string;

    @Field(() => String)
    _id: ObjectId;

    @Field(() => Number)
    orderSubtotal?: number;

    @Field(() => Number)
    orderTotal: number;

    @Field(() => Number)
    orderDelivery: number;

    @Field(() => String, { nullable: true })
    orderAddress?: string;

    @Field(() => OrderDeliveryType)
    orderDeliveryType: OrderDeliveryType;

    @Field(() => OrderStatus)
    orderStatus: OrderStatus;

    @Field(() => String)
    memberId: ObjectId;

    @Field(() => String)
    shopId: ObjectId;

    @Field(() => Date)
    createdAt: Date;

    @Field(() => Date)
    updatedAt: Date;

    /** From aggregation **/
    @Field(() => [OrderItem], { nullable: true })
    orderItems?: OrderItem[];

    @Field(() => [Product], { nullable: true })
    productData?: Product[];
}
