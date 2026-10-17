import { Schema } from 'mongoose';
import { OrderDeliveryType, OrderStatus } from '../libs/enums/order.enum';
import {
    PaymentCurrency, PaymentEnvironment, PaymentReconciliationStatus, PaymentStatus,
} from '../libs/enums/payment.enum';

const sourceAmount = { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true };
const LineSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, immutable: true },
    name: { type: String, required: true, maxlength: 200, immutable: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
    unitAmountMinor: sourceAmount,
}, { _id: false, strict: 'throw' });

const SnapshotSchema = new Schema({
    reference: { type: String, required: true, immutable: true },
    status: { type: String, enum: OrderStatus, required: true, immutable: true },
    deliveryType: { type: String, enum: OrderDeliveryType, required: true, immutable: true },
    sourceCurrency: { type: String, enum: ['USD'], required: true, immutable: true },
    lines: {
        type: [LineSchema], required: true, immutable: true,
        validate: (lines: unknown[]) => Array.isArray(lines) && lines.length > 0,
    },
    subtotalMinor: sourceAmount,
    shippingMinor: sourceAmount,
    totalMinor: sourceAmount,
}, { _id: false, strict: 'throw' });

SnapshotSchema.pre('validate', function () {
    const lines: { quantity: number; unitAmountMinor: number }[] = Array.isArray(this.lines) ? this.lines : [];
    const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitAmountMinor, 0);
    if (!Number.isSafeInteger(subtotal) || subtotal !== this.subtotalMinor) {
        this.invalidate('subtotalMinor', 'Source subtotal must equal the stored item amounts');
    }
    const total = subtotal + this.shippingMinor;
    if (!Number.isSafeInteger(total) || total !== this.totalMinor) {
        this.invalidate('totalMinor', 'Source total must equal items plus shipping');
    }
});

// Only the verification service writes this allowlisted evidence. No raw provider/card payloads.
const VerificationSchema = new Schema({
    version: { type: Number, enum: [1], required: true },
    providerPaymentId: { type: String, required: true, maxlength: 200 },
    transactionId: { type: String, required: true, maxlength: 200 },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency: { type: String, enum: ['USD'], required: true },
    merchantId: { type: String, required: true, maxlength: 200 },
    storeId: { type: String, required: true, maxlength: 200 },
    channelId: { type: String, required: true, maxlength: 200 },
    pgMerchantId: { type: String, required: true, maxlength: 200 },
    environment: { type: String, enum: ['SANDBOX'], required: true },
    bindingKey: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    capturedAt: { type: Date, required: true },
}, { _id: false, strict: 'throw' });

const PaymentSchema = new Schema({
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, immutable: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    shopId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, immutable: true },
    provider: { type: String, required: true, maxlength: 80, immutable: true, select: false },
    merchantId: { type: String, required: true, maxlength: 200, immutable: true, select: false },
    environment: { type: String, enum: PaymentEnvironment, required: true, default: PaymentEnvironment.SANDBOX, immutable: true },
    currency: { type: String, enum: PaymentCurrency, required: true, immutable: true },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
    status: { type: String, enum: PaymentStatus, required: true, default: PaymentStatus.PENDING },
    idempotencyKey: { type: String, required: true, maxlength: 200, immutable: true, select: false },
    requestFingerprint: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true, select: false },
    // Immutable version of the server's trusted source-pricing policy.
    pricingPolicyVersion: { type: String, required: true, maxlength: 100, immutable: true, select: false },
    snapshot: { type: SnapshotSchema, required: true, immutable: true, select: false },
    providerPaymentId: { type: String, maxlength: 200, select: false },
    providerSessionId: { type: String, maxlength: 200, select: false },
    buyerCountry: { type: String, match: /^[A-Z]{2}$/, immutable: true, select: false },
    storeId: { type: String, maxlength: 200, immutable: true, select: false },
    channelId: { type: String, maxlength: 200, immutable: true, select: false },
    pgMerchantId: { type: String, maxlength: 200, immutable: true, select: false },
    checkoutUrl: { type: String, maxlength: 2048, select: false },
    verification: { type: VerificationSchema, select: false },
    // No default: historical foundation rows must not acquire an active claim on deployment.
    active: { type: Boolean, select: false },
    checkAttempts: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0, select: false },
    checkRevision: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0, select: false },
    nextCheckAt: { type: Date, select: false },
    leaseToken: { type: String, select: false },
    lockedUntil: { type: Date, select: false },
    verifiedAt: Date,
    expiresAt: Date,
    succeededAt: Date,
    failedAt: Date,
    cancelledAt: Date,
    lastCheckedAt: Date,
    failureCode: { type: String, maxlength: 80, select: false },
    failureDetail: { type: String, maxlength: 200, select: false },
    reconciliationStatus: {
        type: String, enum: PaymentReconciliationStatus, required: true, default: PaymentReconciliationStatus.NONE,
    },
    reconciliationReason: { type: String, maxlength: 200, select: false },
    reconciledAt: Date,
}, { timestamps: true, collection: 'payments', strict: 'throw' });

PaymentSchema.pre('validate', function () {
    if (this.currency === PaymentCurrency.USD && this.snapshot && this.amountMinor !== this.snapshot.totalMinor) {
        this.invalidate('amountMinor', 'USD payment amount must equal the stored source order total');
    }
});

PaymentSchema.index({ environment: 1, memberId: 1, idempotencyKey: 1 }, { unique: true });
PaymentSchema.index(
    { provider: 1, environment: 1, merchantId: 1, providerPaymentId: 1 },
    { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } },
);
PaymentSchema.index({ memberId: 1, createdAt: -1 });
PaymentSchema.index({ orderId: 1, createdAt: -1 });
PaymentSchema.index({ environment: 1, orderId: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true } });
PaymentSchema.index({ environment: 1, nextCheckAt: 1, lockedUntil: 1 });
PaymentSchema.index({ reconciliationStatus: 1, updatedAt: 1 });

export default PaymentSchema;
