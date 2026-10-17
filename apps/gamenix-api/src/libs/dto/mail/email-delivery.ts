import { Types } from 'mongoose';
import { EmailDeliveryState, EmailDeliveryTemplate } from '../../enums/email-delivery.enum';
import { OrderDeliveryType, OrderStatus } from '../../enums/order.enum';

export interface OrderEmailLine {
    name: string;
    quantity: number;
    price: number;
}

/** Explicit fields only: no payment credentials or unrelated member data. */
export interface OrderEmailSnapshot {
    reference: string;
    status: OrderStatus;
    deliveryType: OrderDeliveryType;
    address?: string;
    lines: OrderEmailLine[];
    shippingFee: number;
    total: number;
}

/** Private persistence DTO. Never expose queue recipients or snapshots in GraphQL. */
export interface EmailDelivery {
    _id: Types.ObjectId;
    memberId: Types.ObjectId;
    orderId: Types.ObjectId;
    recipient: string;
    emailVersion: number;
    template: EmailDeliveryTemplate;
    orderStatus: OrderStatus;
    eventKey: string;
    state: EmailDeliveryState;
    attempts: number;
    nextAttemptAt: Date | null;
    lockedUntil?: Date | null;
    lockToken?: string | null;
    snapshot?: OrderEmailSnapshot;
    sentAt?: Date;
    lastError?: string | null;
    createdAt: Date;
    updatedAt: Date;
}
