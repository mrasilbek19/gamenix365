import { Types } from 'mongoose';
import { Payment } from './payment';
import { OrderDeliveryType, OrderStatus } from '../../enums/order.enum';
import { PaymentEnvironment, PaymentEventState } from '../../enums/payment.enum';

/** Immutable current source order amounts are USD cents; currency conversion is not implemented. */
export interface PaymentOrderSnapshot {
    reference: string;
    status: OrderStatus;
    deliveryType: OrderDeliveryType;
    sourceCurrency: 'USD';
    lines: {
        productId: Types.ObjectId;
        name: string;
        quantity: number;
        unitAmountMinor: number;
    }[];
    subtotalMinor: number;
    shippingMinor: number;
    totalMinor: number;
}

/** Internal storage only; no client input or payment creation API exists yet. */
export interface PaymentRecord extends Payment {
    memberId: Types.ObjectId;
    provider: string;
    merchantId: string;
    providerPaymentId?: string;
    providerSessionId?: string;
    idempotencyKey: string;
    requestFingerprint: string;
    pricingPolicyVersion: string;
    snapshot: PaymentOrderSnapshot;
    succeededAt?: Date;
    failedAt?: Date;
    cancelledAt?: Date;
    lastCheckedAt?: Date;
    failureCode?: string;
    failureDetail?: string;
    reconciliationReason?: string;
    reconciledAt?: Date;
}

/** Only allowlisted metadata, never raw webhook bodies or payment/card credentials. */
export interface PaymentEventRecord {
    _id: Types.ObjectId;
    provider: string;
    environment: PaymentEnvironment;
    merchantId: string;
    providerEventId: string;
    eventType: string;
    payloadHash: string;
    paymentId?: Types.ObjectId;
    state: PaymentEventState;
    attempts: number;
    nextAttemptAt?: Date;
    processedAt?: Date;
    failureCode?: string;
    createdAt: Date;
    updatedAt: Date;
}
