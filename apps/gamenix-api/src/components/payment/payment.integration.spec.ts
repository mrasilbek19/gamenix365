import { randomBytes } from 'crypto';
import { Connection, createConnection, Model, Types } from 'mongoose';
import { PaymentRecord, PaymentEventRecord } from '../../libs/dto/payment/payment-record';
import PaymentSchema from '../../schemas/Payment.model';
import PaymentEventSchema from '../../schemas/PaymentEvent.model';
import { PaymentService } from './payment.service';
import { paymentEventFixture, paymentFixture } from './payment.fixture';

// Opt in with a test server; override its database and guard exact-name cleanup.
// Only synthetic MongoDB records are used. No provider, SMTP or marketplace writes.
const testUri = process.env.PAYMENT_TEST_MONGO_URI;
const describeMongo = testUri ? describe : describe.skip;

describeMongo('Payment foundation MongoDB ownership and unique identities', () => {
    const databaseName = `gx_payment_test_${randomBytes(8).toString('hex')}`;
    let connection: Connection;
    let payments: Model<PaymentRecord>;
    let events: Model<PaymentEventRecord>;
    let service: PaymentService;

    beforeAll(async () => {
        connection = await createConnection(testUri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 }).asPromise();
        payments = connection.model<PaymentRecord>('Payment', PaymentSchema);
        events = connection.model<PaymentEventRecord>('PaymentEvent', PaymentEventSchema);
        await Promise.all([payments.init(), events.init()]);
        service = new PaymentService(payments);
    }, 20000);
    beforeEach(async () => { await Promise.all([payments.deleteMany({}), events.deleteMany({})]); });
    afterAll(async () => {
        if (!connection) return;
        try {
            if (connection.name !== databaseName || !connection.name.startsWith('gx_payment_test_')) {
                throw new Error('Refusing non-test database cleanup');
            }
            await connection.dropDatabase();
        } finally { await connection.close(); }
    });

    it('returns only the owner projection and treats foreign/nonexistent payments identically', async () => {
        const fixture = paymentFixture();
        const doc = await payments.create(fixture);
        const result = await service.getPaymentStatus(fixture.memberId, String(doc._id));
        expect(result).toMatchObject({ _id: doc._id, orderId: fixture.orderId, status: 'PENDING', amountMinor: 5500 });
        expect(result).not.toHaveProperty('memberId');
        expect(result).not.toHaveProperty('merchantId');
        expect(result).not.toHaveProperty('snapshot');
        expect(result).not.toHaveProperty('requestFingerprint');
        await expect(service.getPaymentStatus(new Types.ObjectId(), String(doc._id))).rejects.toThrow('Payment not found');
        await expect(service.getPaymentStatus(fixture.memberId, String(new Types.ObjectId()))).rejects.toThrow('Payment not found');
    });

    it('permits only one intent for concurrent repeated member/idempotency keys', async () => {
        const fixture = paymentFixture();
        const writes = await Promise.allSettled(Array.from({ length: 10 }, () => payments.create(fixture)));
        expect(writes.filter((write) => write.status === 'fulfilled')).toHaveLength(1);
        for (const write of writes) if (write.status === 'rejected') expect(write.reason.code).toBe(11000);
        expect(await payments.countDocuments()).toBe(1);
    });

    it('scopes request keys to the authenticated member', async () => {
        const fixture = paymentFixture();
        await payments.create(fixture);
        await payments.create({ ...fixture, memberId: new Types.ObjectId() });
        expect(await payments.countDocuments()).toBe(2);
    });

    it('allows unassigned provider IDs but rejects duplicate assigned provider/merchant/payment identities', async () => {
        await payments.create(paymentFixture());
        await payments.create(paymentFixture());
        await payments.create(paymentFixture({ providerPaymentId: 'fixture-payment' }));
        await expect(payments.create(paymentFixture({ providerPaymentId: 'fixture-payment' }))).rejects.toMatchObject({ code: 11000 });
        expect(await payments.countDocuments()).toBe(3);
    });

    it('does not allow ownership, currency, amount or snapshot mutation through Mongoose updates', async () => {
        const fixture = paymentFixture();
        const doc = await payments.create(fixture);
        await payments.updateOne({ _id: doc._id }, { $set: {
            memberId: new Types.ObjectId(), currency: 'KRW', amountMinor: 1, 'snapshot.totalMinor': 1,
            'snapshot.lines.0.name': 'Altered', pricingPolicyVersion: 'changed', environment: 'LIVE',
        } });
        const after = await payments.findById(doc._id).select('+snapshot +pricingPolicyVersion').lean();
        expect(String(after.memberId)).toBe(String(fixture.memberId));
        expect(after).toMatchObject({ currency: 'USD', amountMinor: 5500, environment: 'SANDBOX',
            pricingPolicyVersion: 'synthetic-fixture-only', snapshot: { totalMinor: 5500, lines: [{ name: 'Gaming mouse' }] } });
    });

    it('deduplicates concurrent repeated event identities without storing raw payloads', async () => {
        const fixture = paymentEventFixture();
        const writes = await Promise.allSettled(Array.from({ length: 10 }, () => events.create(fixture)));
        expect(writes.filter((write) => write.status === 'fulfilled')).toHaveLength(1);
        for (const write of writes) if (write.status === 'rejected') expect(write.reason.code).toBe(11000);
        expect(await events.countDocuments()).toBe(1);
        expect(await events.findOne().lean()).toMatchObject({ state: 'RECEIVED', attempts: 0, payloadHash: 'b'.repeat(64) });
    });

    it('keeps payment success when separate reconciliation is required', async () => {
        const doc = await payments.create(paymentFixture({ status: 'SUCCEEDED' as any, verifiedAt: new Date(), succeededAt: new Date() }));
        await payments.updateOne({ _id: doc._id }, { $set: { reconciliationStatus: 'REQUIRED', reconciliationReason: 'ORDER_REQUIRES_REVIEW' } });
        expect(await service.getPaymentStatus(doc.memberId, String(doc._id))).toMatchObject({ status: 'SUCCEEDED', reconciliationStatus: 'REQUIRED' });
    });
});
