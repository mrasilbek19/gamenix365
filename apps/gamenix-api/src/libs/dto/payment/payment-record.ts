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

export interface PaymentVerification {
    version: 1;
    providerPaymentId: string;
    transactionId: string;
    amountMinor: number;
    currency: string;
    merchantId: string;
    storeId: string;
    channelId: string;
    pgMerchantId: string;
    environment: 'SANDBOX';
    bindingKey: string;
    capturedAt: Date;
}

/** Internal storage only. Verification evidence is never a GraphQL input. */
export interface PaymentRecord extends Omit<Payment, 'verifiedSuccess'> {
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
    buyerCountry?: string;
    storeId?: string;
    channelId?: string;
    pgMerchantId?: string;
    checkoutUrl?: string;
    active?: boolean;
    verification?: PaymentVerification;
    checkAttempts?: number;
    checkRevision?: number;
    nextCheckAt?: Date;
    leaseToken?: string;
    lockedUntil?: Date;
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
    providerPaymentId?: string;
    lockedUntil?: Date;
    leaseToken?: string;
    createdAt: Date;
    updatedAt: Date;
}
