import { Schema } from 'mongoose';
import { OrderDeliveryType, OrderStatus } from '../libs/enums/order.enum';

const OrderSchema = new Schema(
    {
        // No default: missing currency on existing records remains legacy USD.
        currency: { type: String, enum: ['KRW', 'USD'], required: true, immutable: true },

        orderSubtotal: { type: Number, min: 0, validate: Number.isSafeInteger },

        orderTotal: {
            type: Number,
            required: true,
            min: 0,
            validate: { validator: Number.isSafeInteger, message: 'KRW amounts must be safe integers' },
        },

        orderDelivery: {
            type: Number,
            required: true,
            min: 0,
            validate: { validator: Number.isSafeInteger, message: 'KRW amounts must be safe integers' },
        },

        orderAddress: {
            type: String,
            required: function () {
                return this.orderDeliveryType === OrderDeliveryType.DELIVERY;
            },
        },

        orderDeliveryType: {
            type: String,
            enum: OrderDeliveryType,
            required: true,
            default: OrderDeliveryType.DELIVERY,
        },

        orderStatus: {
            type: String,
            enum: OrderStatus,
            required: true,
            default: OrderStatus.PAUSE,
        },

        memberId: {
            type: Schema.Types.ObjectId,
            ref: 'Member',
            required: true,
        },

        shopId: {
            type: Schema.Types.ObjectId,
            ref: 'Member',
            required: true,
        },

    },
    { timestamps: true, collection: 'order' },
);

export default OrderSchema;
