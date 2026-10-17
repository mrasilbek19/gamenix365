import { Field, InputType } from '@nestjs/graphql';
import { IsISO31661Alpha2, IsMongoId, Matches } from 'class-validator';

@InputType()
export class TestCheckoutInput {
    @IsMongoId()
    @Field(() => String)
    orderId: string;

    @IsISO31661Alpha2()
    @Field(() => String)
    buyerCountry: string;

    @Matches(/^[A-Za-z0-9_-]{16,100}$/)
    @Field(() => String)
    idempotencyKey: string;
}
