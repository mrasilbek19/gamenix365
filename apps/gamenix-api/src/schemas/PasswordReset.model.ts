import { Schema, Types } from 'mongoose';

const PasswordResetSchema = new Schema(
	{
		memberId: {
			type: Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		emailSnapshot: {
			type: String,
			required: true,
		},

		passwordSnapshot: {
			type: String,
			required: true,
			select: false,
		},

		codeHash: {
			type: String,
			required: true,
		},

		resetTokenHash: {
			type: String,
		},

		attempts: {
			type: Number,
			default: 0,
		},

		consumedAt: {
			type: Date,
		},

		expiresAt: {
			type: Date,
			required: true,
		},
	},
	{ timestamps: true, collection: 'passwordResets' },
);

PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

PasswordResetSchema.index({ memberId: 1, consumedAt: 1 });
PasswordResetSchema.index({ resetTokenHash: 1 });

export default PasswordResetSchema;
