import { Schema, Types } from 'mongoose';
import { ReviewGroup, ReviewStatus } from '../libs/enums/review.enum';

const ReviewSchema = new Schema(
	{
		reviewStatus: {
			type: String,
			enum: ReviewStatus,
			default: ReviewStatus.ACTIVE,
		},

		reviewGroup: {
			type: String,
			enum: ReviewGroup,
			required: true,
		},

		reviewImages: {
			type: [String],
			default: [],
		},

		reviewMessage: {
			type: String,
		},

		reviewRating: {
			type: Number,
			min: 1,
			max: 5,
			validate: Number.isInteger,
			required: true,
		},

		memberId: {
			type: Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		reviewRefId: {
			type: Types.ObjectId,
			required: true,
		},
	},
	{ timestamps: true, collection: 'reviews' },
);

ReviewSchema.index({ memberId: 1, reviewGroup: 1, reviewRefId: 1 }, { unique: true });
ReviewSchema.index({ reviewGroup: 1, reviewRefId: 1, reviewStatus: 1, createdAt: -1 });

export default ReviewSchema;
