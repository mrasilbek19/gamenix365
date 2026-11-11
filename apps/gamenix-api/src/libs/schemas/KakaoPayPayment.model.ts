import { Schema, Types } from 'mongoose';
import { PaymentMethod, PaymentStatus } from '../enums/payment.enum';

export interface KakaoPayPaymentRecord {
    provider?: 'DIRECT' | 'PORTONE';
    orderId: Types.ObjectId;
    memberId: Types.ObjectId;
    shopId: Types.ObjectId;
    paymentId: string;
    storeId?: string;
    channelKey?: string;
    totalAmount: number;
    currency: string;
    orderName: string;
    customData: string;
    status: PaymentStatus;
    verifiedSuccess: boolean;
    paymentMethod?: PaymentMethod;
    transactionId?: string;
    paidAt?: Date;
    cancelledAt?: Date;
    cancellationRequestedAt?: Date;
    cid?: string;
    tid?: string;
    partnerUserId?: string;
    callbackStateHash?: string;
    callbackExpiresAt?: Date;
    readyClaimId?: string;
    readyState?: string;
    approvalClaimId?: string;
    approvalState?: string;
    nextRedirectPcUrl?: string;
    nextRedirectMobileUrl?: string;
    providerApprovedAt?: string;
    preparationError?: string;
    preparationHttpStatus?: number;
    preparationErrorCode?: number;
    __v?: number;
}

// Retain the existing collection, identities and field names. No startup migration or index write.
const KakaoPayPaymentSchema = new Schema<KakaoPayPaymentRecord>({
    provider: { type: String, enum: ['DIRECT', 'PORTONE'], default: 'PORTONE', immutable: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, immutable: true },
    shopId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, immutable: true },
    paymentId: { type: String, required: true, immutable: true },
    storeId: { type: String, immutable: true },
    channelKey: { type: String, immutable: true },
    totalAmount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
    currency: { type: String, enum: ['KRW'], required: true, immutable: true },
    orderName: { type: String, required: true, immutable: true },
    customData: { type: String, required: true, immutable: true },
    status: { type: String, enum: PaymentStatus, default: PaymentStatus.READY, required: true },
    verifiedSuccess: { type: Boolean, default: false, required: true },
    paymentMethod: { type: String, enum: PaymentMethod },
    transactionId: String,
    paidAt: Date,
    cancelledAt: Date,
    cancellationRequestedAt: Date,
    cid: { type: String, enum: ['TC0ONETIME'], immutable: true },
    tid: String,
    partnerUserId: { type: String, immutable: true },
    // Rotated only when a fenced, unapproved preparation without a saved TID is explicitly retried.
    callbackStateHash: String,
    callbackExpiresAt: Date,
    readyClaimId: String,
    readyState: { type: String, enum: ['CLAIMED', 'READY', 'UNCERTAIN', 'REJECTED'] },
    approvalClaimId: String,
    approvalState: { type: String, enum: ['WAITING', 'CLAIMED', 'UNCERTAIN', 'COMPLETE'] },
    nextRedirectPcUrl: String,
    nextRedirectMobileUrl: String,
    providerApprovedAt: String,
    preparationError: String,
    preparationHttpStatus: Number,
    preparationErrorCode: Number,
}, { timestamps: true, collection: 'kakaoPayPayments', autoCreate: false, autoIndex: false });

KakaoPayPaymentSchema.index({ orderId: 1 }, { unique: true, name: 'kakao_order_unique' });
KakaoPayPaymentSchema.index({ paymentId: 1 }, { unique: true, name: 'kakao_payment_unique' });

export default KakaoPayPaymentSchema;
