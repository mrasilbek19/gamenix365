import { registerEnumType } from '@nestjs/graphql';

// Copied from Petora's order.enum.ts; fulfillment keeps Gamenix's existing enum.
export enum PaymentMethod {
    CARD = 'CARD',
    EASY_PAY = 'EASY_PAY',
    TRANSFER = 'TRANSFER',
    VIRTUAL_ACCOUNT = 'VIRTUAL_ACCOUNT',
    MOBILE = 'MOBILE',
    CASH_TO_DELIVERY = 'CASH_TO_DELIVERY',
}
registerEnumType(PaymentMethod, { name: 'PaymentMethod' });

// Local verification state, separate from OrderStatus. Existing record values are retained.
export enum PaymentStatus {
    READY = 'READY',
    PENDING = 'PENDING',
    PAID = 'PAID',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
}
