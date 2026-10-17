import { model } from 'mongoose';
import PaymentSchema from '../../schemas/Payment.model';
import PaymentEventSchema from '../../schemas/PaymentEvent.model';
import { PaymentEnvironment, PaymentEventState, PaymentStatus } from '../../libs/enums/payment.enum';
import { paymentEventFixture, paymentFixture } from './payment.fixture';

const Payments = model('PaymentFoundationValidation', PaymentSchema);
const Events = model('PaymentEventFoundationValidation', PaymentEventSchema);

describe('Payment persistence validation', () => {
    it('keeps sandbox and payment status separate from order status, preserving current USD amounts', async () => {
        const doc = new Payments(paymentFixture());
        await expect(doc.validate()).resolves.toBeUndefined();
        expect(doc).toMatchObject({ environment: 'SANDBOX', currency: 'USD', amountMinor: 5500, status: 'PENDING',
            snapshot: { sourceCurrency: 'USD', status: 'PAUSE', totalMinor: 5500 } });
        expect(Object.values(PaymentStatus)).not.toEqual(expect.arrayContaining(['PAUSE', 'PROCESS', 'FINISHED']));
        expect(Object.values(PaymentEnvironment)).toEqual(['SANDBOX']);
    });

    it.each(['LIVE', 'PRODUCTION'])('rejects a %s environment', async (environment) => {
        await expect(new Payments(paymentFixture({ environment: environment as any })).validate()).rejects.toThrow('environment');
    });

    it('requires an explicit supported currency', async () => {
        await expect(new Payments(paymentFixture({ currency: 'EUR' as any })).validate()).rejects.toThrow('currency');
        await expect(new Payments(paymentFixture({ currency: undefined })).validate()).rejects.toThrow('currency');
    });

    it('rejects a USD charge that differs from the immutable source order total', async () => {
        await expect(new Payments(paymentFixture({ amountMinor: 1 })).validate()).rejects.toThrow('amountMinor');
    });

    it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])('rejects invalid minor-unit amounts (%s)', async (amountMinor) => {
        await expect(new Payments(paymentFixture({ amountMinor })).validate()).rejects.toThrow('amountMinor');
    });

    it.each(['memberId', 'orderId', 'shopId', 'provider', 'merchantId', 'idempotencyKey', 'requestFingerprint', 'snapshot', 'pricingPolicyVersion'])
    ('requires server-owned %s', async (field) => {
        await expect(new Payments({ ...paymentFixture(), [field]: undefined }).validate()).rejects.toThrow(field);
    });

    it('rejects empty snapshots and fractional item quantities/source amounts', async () => {
        const empty = paymentFixture();
        empty.snapshot.lines = [];
        await expect(new Payments(empty).validate()).rejects.toThrow('lines');
        const fractional = paymentFixture();
        fractional.snapshot.lines[0].quantity = 1.2;
        fractional.snapshot.lines[0].unitAmountMinor = 25.5;
        await expect(new Payments(fractional).validate()).rejects.toThrow('snapshot.lines.0.quantity');
        await expect(new Payments({ ...paymentFixture(), snapshot: { ...paymentFixture().snapshot, lines: null } })
            .validate()).rejects.toThrow('lines');
    });

    it.each(['subtotalMinor', 'totalMinor'])('rejects inconsistent stored source %s', async (field) => {
        const fixture = paymentFixture();
        fixture.snapshot[field] += 1;
        await expect(new Payments(fixture).validate()).rejects.toThrow(field);
    });

    it('accepts an internally consistent pickup snapshot with zero shipping', async () => {
        const fixture = paymentFixture();
        fixture.snapshot.deliveryType = 'PICKUP' as any;
        fixture.snapshot.shippingMinor = 0;
        fixture.snapshot.totalMinor = 5000;
        fixture.amountMinor = 5000;
        await expect(new Payments(fixture).validate()).resolves.toBeUndefined();
    });

    it('refuses unallowlisted card data and raw provider payloads', async () => {
        expect(() => new Payments({ ...paymentFixture(), cardNumber: 'forbidden' })).toThrow('strict');
        await expect(new Payments({ ...paymentFixture(), snapshot: { ...paymentFixture().snapshot, cardNumber: 'forbidden' } })
            .validate()).rejects.toThrow('cardNumber');
        expect(() => new Events({ ...paymentEventFixture(), rawBody: '{}' })).toThrow('strict');
    });

    it('stores reconciliation independently of verified payment success', async () => {
        const doc = new Payments(paymentFixture({ status: PaymentStatus.SUCCEEDED, reconciliationStatus: 'REQUIRED' as any,
            verifiedAt: new Date(), succeededAt: new Date(), reconciliationReason: 'ORDER_REQUIRES_REVIEW' }));
        await expect(doc.validate()).resolves.toBeUndefined();
        expect(doc.status).toBe('SUCCEEDED');
        expect(doc.reconciliationStatus).toBe('REQUIRED');
    });

    it('defines unique intent/provider payment identities and private default projections', () => {
        expect(PaymentSchema.indexes()).toEqual(expect.arrayContaining([
            [{ environment: 1, memberId: 1, idempotencyKey: 1 }, expect.objectContaining({ unique: true })],
            [{ provider: 1, environment: 1, merchantId: 1, providerPaymentId: 1 }, expect.objectContaining({
                unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } },
            })],
        ]));
        for (const field of ['snapshot', 'idempotencyKey', 'requestFingerprint', 'merchantId', 'providerPaymentId', 'failureDetail']) {
            expect(PaymentSchema.path(field).options.select).toBe(false);
        }
    });

    it('stores event identity, payload hash and recovery metadata without claiming verification', async () => {
        const doc = new Events(paymentEventFixture());
        await expect(doc.validate()).resolves.toBeUndefined();
        expect(doc.state).toBe(PaymentEventState.RECEIVED);
        expect(doc.attempts).toBe(0);
        expect(PaymentEventSchema.indexes()).toEqual(expect.arrayContaining([
            [{ provider: 1, environment: 1, merchantId: 1, providerEventId: 1 }, expect.objectContaining({ unique: true })],
        ]));
        await expect(new Events(paymentEventFixture({ environment: 'LIVE' as any })).validate()).rejects.toThrow('environment');
    });
});
