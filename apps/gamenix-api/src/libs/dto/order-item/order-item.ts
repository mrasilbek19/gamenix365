import { Field, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';

@ObjectType()
export class OrderItem {
    @Field(() => String)
    currency?: string;

    @Field(() => String)
    _id: ObjectId;

    @Field(() => Int)
    itemQuantity: number;

    @Field(() => Number)
    itemPrice: number;

    @Field(() => String)
    orderId: ObjectId;

    @Field(() => String)
    productId: ObjectId;

    @Field(() => Date)
    createdAt: Date;

    @Field(() => Date)
    updatedAt: Date;
}
