import { Schema } from 'mongoose';
import { ProductStatus, ProductType } from '../libs/enums/product.enum';

const ProductSchema = new Schema(
	{
		// No default: missing currency on existing records remains legacy USD.
		currency: { type: String, enum: ['KRW', 'USD'], required: true, immutable: true },

		productType: {
			type: String,
			enum: ProductType,
			required: true,
		},

		productStatus: {
			type: String,
			enum: ProductStatus,
			default: ProductStatus.PROCESS,
		},

		productName: {
			type: String,
			required: true,
		},

		productPrice: {
			type: Number,
			min: 0,
			required: true,
			validate: { validator: Number.isSafeInteger, message: 'KRW amounts must be safe integers' },
		},

		productLeftCount: {
			type: Number,
			required: true,
			default: 0,
			min: 0,
			validate: { validator: Number.isInteger, message: 'Stock must be an integer' },
		},

		productViews: {
			type: Number,
			default: 0,
		},

		productLikes: {
			type: Number,
			default: 0,
		},

		productComments: {
			type: Number,
			default: 0,
		},

		productRank: {
			type: Number,
			default: 0,
		},

		productImages: {
			type: [String],
			required: true,
		},

		productDesc: {
			type: String,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		soldAt: {
			type: Date,
		},

		deletedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'products' },
);


export default ProductSchema;
