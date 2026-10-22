import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ShippingPolicy {
    @Field(() => String)
    currency: string;

    @Field(() => Number)
    freeDeliveryThreshold: number;

    @Field(() => Number)
    standardDeliveryFee: number;

    @Field(() => Number)
    furnitureDeliveryFee: number;
}
