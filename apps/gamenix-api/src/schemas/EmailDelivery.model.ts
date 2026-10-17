import { Schema } from 'mongoose';
import { isEmail } from 'class-validator';
import { EmailDeliveryState, EmailDeliveryTemplate } from '../libs/enums/email-delivery.enum';
import { OrderDeliveryType, OrderStatus } from '../libs/enums/order.enum';
import { ORDER_EMAIL_MAX_ATTEMPTS } from '../libs/order-email.config';

const LineSchema = new Schema({
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    price: { type: Number, required: true, min: 0 },
}, { _id: false });

const SnapshotSchema = new Schema({
    reference: { type: String, required: true },
    status: { type: String, required: true, enum: OrderStatus },
    deliveryType: { type: String, required: true, enum: OrderDeliveryType },
    address: String,
    lines: { type: [LineSchema], required: true },
    shippingFee: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
}, { _id: false });

const EmailDeliverySchema = new Schema({
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, immutable: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    recipient: { type: String, required: true, immutable: true, validate: isEmail },
    emailVersion: { type: Number, required: true, min: 0, immutable: true },
    template: { type: String, enum: EmailDeliveryTemplate, required: true, immutable: true },
    orderStatus: { type: String, enum: OrderStatus, required: true, immutable: true },
    eventKey: { type: String, required: true, immutable: true },
    state: { type: String, enum: EmailDeliveryState, default: EmailDeliveryState.PENDING, required: true },
    attempts: { type: Number, min: 0, max: ORDER_EMAIL_MAX_ATTEMPTS, default: 0, validate: Number.isInteger },
    nextAttemptAt: { type: Date, default: Date.now },
    lockedUntil: Date,
    lockToken: String,
    snapshot: SnapshotSchema,
    sentAt: Date,
    lastError: { type: String, enum: ['DELIVERY_FAILED', 'RECIPIENT_CHANGED', 'ATTEMPTS_EXHAUSTED', null] },
}, { timestamps: true, collection: 'emailDeliveries' });

EmailDeliverySchema.index({ eventKey: 1 }, { unique: true });
EmailDeliverySchema.index({ state: 1, nextAttemptAt: 1 });
EmailDeliverySchema.index({ state: 1, lockedUntil: 1 });
EmailDeliverySchema.index({ orderId: 1, createdAt: -1 });

export default EmailDeliverySchema;
