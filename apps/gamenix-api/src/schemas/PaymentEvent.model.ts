import { Schema } from 'mongoose';
import { PaymentEnvironment, PaymentEventState } from '../libs/enums/payment.enum';

/** Signed event metadata only; PROCESSED means durably scheduled for provider retrieval. */
const PaymentEventSchema = new Schema({
    provider: { type: String, required: true, maxlength: 80, immutable: true },
    environment: { type: String, enum: PaymentEnvironment, required: true, default: PaymentEnvironment.SANDBOX, immutable: true },
    merchantId: { type: String, required: true, maxlength: 200, immutable: true },
    providerEventId: { type: String, required: true, maxlength: 200, immutable: true },
    eventType: { type: String, required: true, maxlength: 128, immutable: true },
    payloadHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    providerPaymentId: { type: String, maxlength: 200, immutable: true },
    state: { type: String, enum: PaymentEventState, required: true, default: PaymentEventState.RECEIVED },
    attempts: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
    nextAttemptAt: Date,
    processedAt: Date,
    failureCode: { type: String, maxlength: 80 },
    lockedUntil: Date,
    leaseToken: String,
}, { timestamps: true, collection: 'paymentEvents', strict: 'throw' });

PaymentEventSchema.index({ provider: 1, environment: 1, merchantId: 1, providerEventId: 1 }, { unique: true });
PaymentEventSchema.index({ paymentId: 1, createdAt: -1 });
PaymentEventSchema.index({ state: 1, nextAttemptAt: 1 });

export default PaymentEventSchema;
