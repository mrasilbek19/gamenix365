import { Types } from 'mongoose';
import { PaymentRecord, PaymentEventRecord } from '../../libs/dto/payment/payment-record';
import { PaymentCurrency, PaymentEnvironment } from '../../libs/enums/payment.enum';
import { OrderDeliveryType, OrderStatus } from '../../libs/enums/order.enum';

/** Synthetic ledger fixtures only: these do not select a provider or an FX policy. */
export const paymentFixture = (overrides: Partial<PaymentRecord> = {}) => ({
    memberId: new Types.ObjectId(),
    orderId: new Types.ObjectId(),
    shopId: new Types.ObjectId(),
    provider: 'fixture-provider',
    merchantId: 'fixture-test-merchant',
    environment: PaymentEnvironment.SANDBOX,
    currency: PaymentCurrency.USD,
    amountMinor: 5500,
    idempotencyKey: new Types.ObjectId().toHexString(),
    requestFingerprint: 'a'.repeat(64),
    pricingPolicyVersion: 'synthetic-fixture-only',
    snapshot: {
        reference: 'fixture-order',
        status: OrderStatus.PAUSE,
        deliveryType: OrderDeliveryType.DELIVERY,
        sourceCurrency: 'USD' as const,
        lines: [{ productId: new Types.ObjectId(), name: 'Gaming mouse', quantity: 2, unitAmountMinor: 2500 }],
        subtotalMinor: 5000,
        shippingMinor: 500,
        totalMinor: 5500,
    },
    ...overrides,
});

export const paymentEventFixture = (overrides: Partial<PaymentEventRecord> = {}) => ({
    provider: 'fixture-provider',
    merchantId: 'fixture-test-merchant',
    providerEventId: new Types.ObjectId().toHexString(),
    environment: PaymentEnvironment.SANDBOX,
    eventType: 'synthetic-event',
    payloadHash: 'b'.repeat(64),
    ...overrides,
});
