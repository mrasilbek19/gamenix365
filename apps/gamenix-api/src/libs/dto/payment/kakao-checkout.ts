import { Field, ObjectType } from '@nestjs/graphql';
import { Order } from '../order/order';
import { PaymentMethod } from '../../enums/payment.enum';

@ObjectType()
export class KakaoPayTestAvailability {
	@Field(() => Boolean)
	enabled: boolean;

	@Field(() => String)
	currency: string;

	@Field(() => String)
	requiredCurrency: string;

	@Field(() => [String])
	blockers: string[];
}

@ObjectType()
export class KakaoPayCheckoutSession {
    @Field(() => String)
    orderId: string;

    @Field(() => String)
    paymentId: string;

    @Field(() => String)
    nextRedirectPcUrl: string;

    @Field(() => String)
    nextRedirectMobileUrl: string;
}

@ObjectType()
export class KakaoPayPaymentStatus {
    @Field(() => String)
    provider: string;
    @Field(() => String)
    orderId: string;

    @Field(() => String, { nullable: true })
    paymentId?: string;

    @Field(() => String)
    status: string;

    @Field(() => Boolean)
    verifiedSuccess: boolean;

    @Field(() => Date, { nullable: true })
    paidAt?: Date;

    @Field(() => PaymentMethod, { nullable: true })
    paymentMethod?: PaymentMethod;

    @Field(() => Boolean)
    cancellationPending: boolean;

    @Field(() => Boolean)
    preparationRetryable: boolean;

    @Field(() => String, { nullable: true })
    preparationError?: string;

    @Field(() => Order)
    order: Order;
}
