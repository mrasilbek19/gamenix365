import { Field, ObjectType } from '@nestjs/graphql';
import { PaymentCurrency, PaymentEnvironment, PaymentStatus } from '../../enums/payment.enum';

@ObjectType()
export class TestCheckoutAvailability {
    @Field(() => Boolean)
    enabled: boolean;

    @Field(() => String, { nullable: true })
    reason?: string;

    @Field(() => [String])
    buyerCountries: string[];
}

@ObjectType()
export class TestCheckoutSession {
    @Field(() => String)
    paymentId: string;

    @Field(() => PaymentStatus)
    status: PaymentStatus;

    @Field(() => PaymentEnvironment)
    environment: PaymentEnvironment;

    @Field(() => PaymentCurrency)
    currency: PaymentCurrency;

    @Field(() => String, { nullable: true })
    checkoutUrl?: string;

    @Field(() => Date, { nullable: true })
    expiresAt?: Date;
}
