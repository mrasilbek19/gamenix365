import { Schema } from 'mongoose';
import { AuthTokenPurpose } from '../libs/enums/auth-token.enum';

const AuthTokenSchema = new Schema({
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    purpose: { type: String, enum: AuthTokenPurpose, required: true },
    emailSnapshot: { type: String, required: true, trim: true, lowercase: true },
    emailVersion: { type: Number, required: true, min: 0 },
    tokenHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    codeHash: { type: String, select: false },
    passwordSnapshot: { type: String, match: /^[a-f0-9]{64}$/, select: false },
    attempts: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'authTokens' });

AuthTokenSchema.index({ tokenHash: 1 }, { unique: true });
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
AuthTokenSchema.index({ memberId: 1, purpose: 1, consumedAt: 1 });

export default AuthTokenSchema;
