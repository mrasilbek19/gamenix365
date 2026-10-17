import { registerEnumType } from '@nestjs/graphql';

/** Payment facts are independent of the order's processing state. */
export enum PaymentStatus {
    PENDING = 'PENDING',
    SUCCEEDED = 'SUCCEEDED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
    EXPIRED = 'EXPIRED',
    UNKNOWN = 'UNKNOWN',
}

/** There is deliberately no live payment environment in this foundation. */
export enum PaymentEnvironment {
    SANDBOX = 'SANDBOX',
}

export enum PaymentCurrency {
    USD = 'USD',
    KRW = 'KRW',
}

export enum PaymentReconciliationStatus {
    NONE = 'NONE',
    REQUIRED = 'REQUIRED',
    RESOLVED = 'RESOLVED',
}

/** Private event ledger state, not a provider result. */
export enum PaymentEventState {
    RECEIVED = 'RECEIVED',
    PROCESSED = 'PROCESSED',
    FAILED = 'FAILED',
}

registerEnumType(PaymentStatus, { name: 'PaymentStatus' });
registerEnumType(PaymentEnvironment, { name: 'PaymentEnvironment' });
registerEnumType(PaymentCurrency, { name: 'PaymentCurrency' });
registerEnumType(PaymentReconciliationStatus, { name: 'PaymentReconciliationStatus' });
