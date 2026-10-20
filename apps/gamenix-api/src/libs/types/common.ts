import { ObjectId, Types } from "mongoose";

export interface T {
    [key: string]: any
}

export interface StatisticModifier {
    _id: ObjectId;
    targetKey: string;
    modifier: number;
}

export interface PasswordReset {
    _id: Types.ObjectId;
    memberId: Types.ObjectId;
    emailSnapshot: string;
    passwordSnapshot: string;
    codeHash: string;
    resetTokenHash?: string;
    attempts: number;
    consumedAt?: Date;
    expiresAt: Date;
}
