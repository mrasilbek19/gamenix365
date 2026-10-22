import { Schema } from 'mongoose';

const OrderItemSchema = new Schema(
    {
        // No default: missing currency on existing records remains legacy USD.
        currency: { type: String, enum: ['KRW', 'USD'], required: true, immutable: true },

        itemQuantity: {
            type: Number,
            required: true,
            min: 1,
            validate: { validator: Number.isInteger, message: 'Must be an integer' },
        },

        itemPrice: {
            type: Number,
            required: true,
            min: 0,
            validate: { validator: Number.isSafeInteger, message: 'KRW amounts must be safe integers' },
        },

        orderId: {
            type: Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
        },

        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },

    },
    { timestamps: true, collection: 'orderItems' },
);

export default OrderItemSchema;
