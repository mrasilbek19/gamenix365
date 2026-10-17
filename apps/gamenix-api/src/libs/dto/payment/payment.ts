import { Field, Float, ObjectType } from '@nestjs/graphql';
import { Types } from 'mongoose';
import {
    PaymentCurrency, PaymentEnvironment, PaymentReconciliationStatus, PaymentStatus,
} from '../../enums/payment.enum';

/** Owner-visible status only. Provider identifiers, snapshots and keys stay private. */
@ObjectType()
export class Payment {
    @Field(() => String)
    _id: Types.ObjectId;

    @Field(() => String)
    orderId: Types.ObjectId;

    @Field(() => String)
    shopId: Types.ObjectId;

    @Field(() => PaymentStatus)
    status: PaymentStatus;

    @Field(() => PaymentEnvironment)
    environment: PaymentEnvironment;

    @Field(() => PaymentCurrency)
    currency: PaymentCurrency;

    // Float avoids GraphQL Int's 32-bit ceiling; persistence requires a safe integer.
    @Field(() => Float, { description: 'Integer minor-unit amount: cents for USD, whole won for KRW.' })
    amountMinor: number;

    @Field(() => PaymentReconciliationStatus)
    reconciliationStatus: PaymentReconciliationStatus;

    @Field(() => Date, { nullable: true })
    verifiedAt?: Date;

    @Field(() => Date, { nullable: true })
    expiresAt?: Date;

    @Field(() => Date)
    createdAt: Date;

    @Field(() => Date)
    updatedAt: Date;
}
