/** Private mail queue values; intentionally absent from GraphQL. */
export enum EmailDeliveryTemplate {
    ORDER_CREATED = 'ORDER_CREATED',
    ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
}

export enum EmailDeliveryState {
    PENDING = 'PENDING',
    SENDING = 'SENDING',
    SENT = 'SENT',
    FAILED = 'FAILED',
    SKIPPED = 'SKIPPED',
}
