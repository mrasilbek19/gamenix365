import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Connection, createConnection, Model, Types } from 'mongoose';
import { PaymentEventRecord, PaymentRecord } from '../../libs/dto/payment/payment-record';
import { PaymentStatus } from '../../libs/enums/payment.enum';
import PaymentSchema from '../../schemas/Payment.model';
import PaymentEventSchema from '../../schemas/PaymentEvent.model';
import { PaymentWorkflowService } from './payment-workflow.service';
import { PaymentService } from './payment.service';
import { paymentFixture } from './payment.fixture';
import { ProviderPaymentFacts } from './portone.service';

// Synthetic provider protocol ONLY. This is not a PortOne/PayPal signature or sandbox integration test.
const uri = process.env.PAYMENT_TEST_MONGO_URI;
const describeMongo = uri ? describe : describe.skip;
const privateFields = '+provider +merchantId +providerPaymentId +requestFingerprint +storeId +channelId +pgMerchantId '
    + '+snapshot +verification +active +checkAttempts +nextCheckAt +leaseToken +lockedUntil';

describeMongo('Provider-independent payment workflow with isolated MongoDB', () => {
    const databaseName = `gx_payment_test_${randomBytes(8).toString('hex')}`;
    let connection: Connection, payments: Model<PaymentRecord>, events: Model<PaymentEventRecord>;
    let service: PaymentWorkflowService, status: PaymentService, provider: any, snapshots: any;
    let fixture: ReturnType<typeof paymentFixture>, input: any;
    let factsOverride: Partial<ProviderPaymentFacts>;
    const signatureKey = randomBytes(32); // Test-only ephemeral key, unrelated to any provider account.
    const identity = { provider: 'synthetic-only', merchantId: 'test-merchant', storeId: 'test-store',
        channelId: 'test-channel', pgMerchantId: 'test-pg', environment: 'SANDBOX', currency: 'USD',
        checkoutHost: 'checkout.example.test', buyerCountries: ['US', 'CA'] };
    const sign = (body: Buffer) => createHmac('sha256', signatureKey).update(body).digest('hex');
    const due = async (id: string) => payments.updateOne({ _id: id }, { $set: { nextCheckAt: new Date(0) } });
    const load = async (id: string) => payments.findById(id).select(privateFields).lean().exec();
    const checkout = async () => service.createSession(fixture.memberId, input);
    const webhook = async (paymentId: string, eventId = String(new Types.ObjectId()), extra = {}) => {
        const payment = await load(paymentId);
        const body = Buffer.from(JSON.stringify({ eventId, eventType: 'synthetic.changed',
            providerPaymentId: payment.providerPaymentId, storeId: identity.storeId, ...extra }));
        return { body, headers: { signature: sign(body) } };
    };
    const accept = async (event: Awaited<ReturnType<typeof webhook>>) => service.receiveWebhook(event.body, event.headers);

    beforeAll(async () => {
        connection = await createConnection(uri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 }).asPromise();
        payments = connection.model<PaymentRecord>('Payment', PaymentSchema);
        events = connection.model<PaymentEventRecord>('PaymentEvent', PaymentEventSchema);
        await Promise.all([payments.init(), events.init()]);
    }, 20000);
    beforeEach(async () => {
        jest.restoreAllMocks();
        await Promise.all([payments.deleteMany({}), events.deleteMany({})]);
        fixture = paymentFixture();
        fixture.snapshot.reference = String(fixture.orderId);
        input = { orderId: String(fixture.orderId), buyerCountry: 'US', idempotencyKey: 'synthetic-request-0001' };
        snapshots = { ownedOrder: jest.fn(async (member) => {
            if (String(member) !== String(fixture.memberId)) throw new Error('Order not found');
            return { _id: fixture.orderId };
        }), build: jest.fn(async () => ({ snapshot: fixture.snapshot, shopId: fixture.shopId })) };
        factsOverride = {};
        provider = {
            verifiedSandbox: jest.fn(async () => identity),
            createSession: jest.fn(async () => ({ sessionId: 'synthetic-session',
                url: 'https://checkout.example.test/synthetic-session', expiresAt: new Date(Date.now() + 3600000) })),
            getPayment: jest.fn(async (id: string) => {
                const payment = await payments.findOne({ providerPaymentId: id }).select(privateFields).lean();
                return { providerPaymentId: id, status: PaymentStatus.SUCCEEDED, amountMinor: payment.amountMinor,
                    currency: 'USD', merchantId: identity.merchantId, storeId: identity.storeId,
                    channelId: identity.channelId, pgMerchantId: identity.pgMerchantId, environment: 'SANDBOX',
                    bindingKey: payment.requestFingerprint, captured: true, checkoutClosed: true,
                    transactionId: 'synthetic-capture', capturedAt: new Date(), ...factsOverride };
            }),
            verifyWebhook: jest.fn(async (body: Buffer, headers: Record<string, string>) => {
                const supplied = Buffer.from(headers.signature ?? '', 'hex');
                const expected = Buffer.from(sign(body), 'hex');
                if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('signature');
                return JSON.parse(body.toString());
            }),
        };
        service = new PaymentWorkflowService(payments, events, snapshots, provider, new ConfigService({ PAYMENTS_ENABLED: 'true', NODE_ENV: 'test' }));
        status = new PaymentService(payments);
    });
    afterAll(async () => {
        jest.restoreAllMocks();
        if (!connection) return;
        try {
            if (connection.name !== databaseName || !connection.name.startsWith('gx_payment_test_')) throw new Error('Refusing non-test cleanup');
            await connection.dropDatabase();
        } finally { await connection.close(); }
    });

    it('creates a private server-bound attempt and returns only safe session metadata', async () => {
        const result = await checkout();
        expect(result).toMatchObject({ status: 'PENDING', currency: 'USD', environment: 'SANDBOX',
            checkoutUrl: 'https://checkout.example.test/synthetic-session' });
        expect(Object.keys(result).sort()).toEqual(['checkoutUrl', 'currency', 'environment', 'expiresAt', 'paymentId', 'status']);
        const payment = await load(result.paymentId);
        expect(payment).toMatchObject({ memberId: fixture.memberId, orderId: fixture.orderId, shopId: fixture.shopId,
            amountMinor: 5500, active: true, snapshot: { totalMinor: 5500 } });
        expect(provider.createSession).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 5500,
            bindingKey: payment.requestFingerprint, providerPaymentId: `gamenix-test-${result.paymentId}` }));
    });
    it('denies foreign order ownership before persisting an attempt', async () => {
        await expect(service.createSession(new Types.ObjectId(), input)).rejects.toThrow('Order not found');
        expect(await payments.countDocuments()).toBe(0);
        expect(provider.createSession).not.toHaveBeenCalled();
    });
    it('does not persist a payment after order snapshot validation fails', async () => {
        snapshots.build.mockRejectedValue(new Error('Inconsistent order'));
        await expect(checkout()).rejects.toThrow('Inconsistent order');
        expect(await payments.countDocuments()).toBe(0);
    });
    it('refuses checkout if its active-attempt unique index is missing', async () => {
        const index = (await payments.collection.indexes()).find((entry) => entry.key.active === 1);
        await payments.collection.dropIndex(index.name);
        try {
            await expect(checkout()).rejects.toThrow('Required payment indexes are unavailable');
            expect(provider.createSession).not.toHaveBeenCalled();
            expect(await payments.countDocuments()).toBe(0);
        } finally { await payments.createIndexes(); }
    });
    it('deduplicates ten concurrent requests and calls session creation once', async () => {
        const results = await Promise.allSettled(Array.from({ length: 10 }, checkout));
        expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
        expect(await payments.countDocuments()).toBe(1);
        expect(provider.createSession).toHaveBeenCalledTimes(1);
        const original = await checkout();
        expect(original.checkoutUrl).toContain('checkout.example.test');
        expect(provider.createSession).toHaveBeenCalledTimes(1);
    });
    it('allows only one concurrent active attempt across different request keys', async () => {
        await Promise.allSettled(Array.from({ length: 10 }, (_, i) => service.createSession(fixture.memberId,
            { ...input, idempotencyKey: `synthetic-request-${i.toString().padStart(4, '0')}` })));
        expect(await payments.countDocuments()).toBe(1);
        expect(provider.createSession).toHaveBeenCalledTimes(1);
    });
    it.each(['country', 'order'])('rejects conflicting idempotency reuse for %s', async (change) => {
        await checkout();
        await expect(service.createSession(fixture.memberId, { ...input,
            ...(change === 'country' ? { buyerCountry: 'CA' } : { orderId: String(new Types.ObjectId()) }),
        })).rejects.toThrow('Idempotency key belongs');
        expect(provider.createSession).toHaveBeenCalledTimes(1);
    });
    it('preserves a durable uncertain claim after a timeout and never recreates its session', async () => {
        provider.createSession.mockRejectedValue(new Error('timeout'));
        await expect(checkout()).rejects.toThrow('could not be confirmed');
        const row = await payments.findOne().select(privateFields).lean();
        expect(row).toMatchObject({ status: 'UNKNOWN', active: true, reconciliationStatus: 'REQUIRED' });
        expect(await checkout()).not.toHaveProperty('checkoutUrl');
        await expect(service.createSession(fixture.memberId, { ...input, idempotencyKey: 'different-request-0001' })).rejects.toThrow('already has');
        expect(provider.createSession).toHaveBeenCalledTimes(1);
        await service.processDuePayments();
        expect(await status.getPaymentStatus(fixture.memberId, String(row._id))).toMatchObject({ status: 'SUCCEEDED', verifiedSuccess: true });
    });
    it('recovers after the provider accepted checkout but session persistence failed', async () => {
        jest.spyOn(payments, 'findOneAndUpdate').mockImplementationOnce(() => ({
            select: () => ({ lean: () => ({ exec: async () => { throw new Error('database unavailable'); } }) }),
        } as any));
        await expect(checkout()).rejects.toThrow('could not be confirmed');
        const row = await payments.findOne().lean();
        await service.processDuePayments();
        expect(await status.getPaymentStatus(fixture.memberId, String(row._id))).toMatchObject({ status: 'SUCCEEDED', verifiedSuccess: true });
        expect(provider.createSession).toHaveBeenCalledTimes(1);
    });
    it('rejects an unsafe checkout URL while retaining the uncertain attempt', async () => {
        provider.createSession.mockResolvedValue({ sessionId: 'unsafe', url: 'https://attacker.example/checkout', expiresAt: new Date(Date.now() + 3600000) });
        await expect(checkout()).rejects.toThrow('could not be confirmed');
        expect(await payments.findOne().lean()).toMatchObject({ status: 'UNKNOWN', reconciliationStatus: 'REQUIRED' });
    });
    it('persists verified capture, blocks another charge and keeps proof private', async () => {
        const result = await checkout(); await due(result.paymentId);
        await service.processDuePayments();
        const visible = await status.getPaymentStatus(fixture.memberId, result.paymentId);
        expect(visible).toMatchObject({ status: 'SUCCEEDED', verifiedSuccess: true, amountMinor: 5500 });
        expect(visible).not.toHaveProperty('verification');
        expect(visible).not.toHaveProperty('providerPaymentId');
        await expect(service.createSession(fixture.memberId, { ...input, idempotencyKey: 'different-request-0001' })).rejects.toThrow('already has');
        expect(snapshots.build).toHaveBeenCalledTimes(2); // Reads only; no stock/order/points mutation dependency exists.
    });
    it.each(['FAILED', 'CANCELLED', 'EXPIRED'] as const)('accepts trusted terminal %s only when checkout is definitively closed and uncaptured', async (terminal) => {
        factsOverride = { status: PaymentStatus[terminal], captured: false, checkoutClosed: true };
        const result = await checkout(); await due(result.paymentId); await service.processDuePayments();
        expect(await load(result.paymentId)).toMatchObject({ status: terminal, active: false });
        expect((await status.getPaymentStatus(fixture.memberId, result.paymentId)).verifiedSuccess).toBe(false);
    });
    it('keeps an unclosed cancellation uncertain with its active claim', async () => {
        factsOverride = { status: PaymentStatus.CANCELLED, captured: false, checkoutClosed: false };
        const result = await checkout(); await due(result.paymentId); await service.processDuePayments();
        expect(await load(result.paymentId)).toMatchObject({ status: 'UNKNOWN', active: true });
    });
    it.each([
        { amountMinor: 5499 }, { currency: 'KRW' }, { merchantId: 'foreign' }, { storeId: 'foreign' },
        { channelId: 'foreign' }, { pgMerchantId: 'foreign' }, { environment: 'LIVE' },
        { providerPaymentId: 'foreign' }, { bindingKey: 'b'.repeat(64) }, { captured: false },
        { transactionId: undefined }, { capturedAt: undefined },
    ])('fails closed on mismatched/incomplete provider facts %j', async (override) => {
        factsOverride = override;
        const result = await checkout(); await due(result.paymentId); await service.processDuePayments();
        expect(await status.getPaymentStatus(fixture.memberId, result.paymentId)).toMatchObject({ status: 'UNKNOWN',
            verifiedSuccess: false, reconciliationStatus: 'REQUIRED' });
        expect(await load(result.paymentId)).not.toHaveProperty('verification');
    });
    it('deduplicates signed events and retrieves trusted facts through the worker', async () => {
        const result = await checkout(); const event = await webhook(result.paymentId);
        await Promise.all(Array.from({ length: 10 }, () => accept(event)));
        expect(await events.countDocuments()).toBe(1);
        expect((await load(result.paymentId)).status).toBe('PENDING');
        await service.processDueEvents(); await service.processDuePayments();
        expect(await events.findOne().lean()).toMatchObject({ state: 'PROCESSED', paymentId: new Types.ObjectId(result.paymentId) });
        expect((await status.getPaymentStatus(fixture.memberId, result.paymentId)).verifiedSuccess).toBe(true);
        await accept(event); expect(await service.processDueEvents()).toBe(0);
    });
    it('rejects conflicting duplicate event hashes without replacing the original', async () => {
        const result = await checkout(); const event = await webhook(result.paymentId, 'same-event'); await accept(event);
        const conflict = await webhook(result.paymentId, 'same-event', { eventType: 'synthetic.other' });
        await expect(accept(conflict)).rejects.toThrow('Conflicting webhook identity');
        expect(await events.countDocuments()).toBe(1);
        expect(await events.findOne().lean()).toMatchObject({ eventType: 'synthetic.changed' });
        expect(await load(result.paymentId)).toMatchObject({ reconciliationStatus: 'REQUIRED' });
    });
    it('ignores an authenticated event with no bound local payment', async () => {
        const body = Buffer.from(JSON.stringify({ eventId: 'missing', eventType: 'synthetic.changed', providerPaymentId: 'missing', storeId: identity.storeId }));
        await accept({ body, headers: { signature: sign(body) } });
        await service.processDueEvents();
        expect(await events.findOne().lean()).toMatchObject({ state: 'PROCESSED', failureCode: 'NO_LOCAL_PAYMENT' });
        expect(provider.getPayment).not.toHaveBeenCalled();
        expect(await payments.countDocuments()).toBe(0);
    });
    it('never downgrades capture when a later/stale failure event arrives', async () => {
        const result = await checkout(); await due(result.paymentId); await service.processDuePayments();
        factsOverride = { status: PaymentStatus.CANCELLED, captured: false };
        await accept(await webhook(result.paymentId)); await service.processDueEvents(); await service.processDuePayments();
        expect(await status.getPaymentStatus(fixture.memberId, result.paymentId)).toMatchObject({ status: 'SUCCEEDED',
            verifiedSuccess: true, reconciliationStatus: 'REQUIRED' });
    });
    it('keeps original capture evidence if a different capture reference is returned later', async () => {
        const result = await checkout(); await due(result.paymentId); await service.processDuePayments();
        factsOverride = { transactionId: 'unexpected-second-capture' };
        await accept(await webhook(result.paymentId)); await service.processDueEvents(); await service.processDuePayments();
        expect(await load(result.paymentId)).toMatchObject({ status: 'SUCCEEDED', reconciliationStatus: 'REQUIRED',
            verification: { transactionId: 'synthetic-capture' } });
    });
    it('accepts late verified success after a bounded uncertain outcome', async () => {
        const result = await checkout();
        await payments.updateOne({ _id: result.paymentId }, { $set: { status: 'UNKNOWN', checkAttempts: 5,
            nextCheckAt: null, reconciliationStatus: 'REQUIRED' } });
        await accept(await webhook(result.paymentId)); await service.processDueEvents(); await service.processDuePayments();
        expect(await status.getPaymentStatus(fixture.memberId, result.paymentId)).toMatchObject({ status: 'SUCCEEDED', verifiedSuccess: true });
    });
    it('bounds provider retries without turning uncertainty into failure/cancellation', async () => {
        const result = await checkout(); provider.getPayment.mockRejectedValue(new Error('timeout'));
        for (let i = 0; i < 5; i++) { await due(result.paymentId); await service.processDuePayments(); }
        await due(result.paymentId); await service.processDuePayments();
        expect(provider.getPayment).toHaveBeenCalledTimes(5);
        expect(await load(result.paymentId)).toMatchObject({ status: 'UNKNOWN', active: true, checkAttempts: 5,
            reconciliationStatus: 'REQUIRED' });
    });
    it('recovers expired worker leases and prevents simultaneous retrieval', async () => {
        const result = await checkout();
        await payments.updateOne({ _id: result.paymentId }, { $set: { lockedUntil: new Date(0), leaseToken: 'crashed', nextCheckAt: new Date(0) } });
        await Promise.all(Array.from({ length: 5 }, () => service.processDuePayments()));
        expect(provider.getPayment).toHaveBeenCalledTimes(1);
        expect((await status.getPaymentStatus(fixture.memberId, result.paymentId)).verifiedSuccess).toBe(true);
    });
    it('does not infer expiry from elapsed checkout time while the provider reports pending', async () => {
        const result = await checkout();
        factsOverride = { status: PaymentStatus.PENDING, captured: false, checkoutClosed: false };
        await payments.updateOne({ _id: result.paymentId }, { $set: { expiresAt: new Date(0), nextCheckAt: new Date(0) } });
        await service.processDuePayments();
        expect(await load(result.paymentId)).toMatchObject({ status: 'PENDING', active: true });
    });
    it('preserves a newer signed-event schedule when an older retrieval finishes', async () => {
        const result = await checkout(); await due(result.paymentId);
        const original = provider.getPayment.getMockImplementation();
        let release: () => void;
        let started: () => void;
        const ready = new Promise<void>((resolve) => { started = resolve; });
        provider.getPayment.mockImplementationOnce(async (id: string) => {
            const facts = { ...await original(id), status: PaymentStatus.PENDING, captured: false, checkoutClosed: false };
            started(); await new Promise<void>((resolve) => { release = resolve; });
            return facts;
        });
        const older = service.processDuePayments(1); await ready;
        await accept(await webhook(result.paymentId)); await service.processDueEvents();
        release(); await older;
        // No forced due date: the newer event must remain scheduled despite the older pending result.
        await service.processDuePayments();
        expect(await status.getPaymentStatus(fixture.memberId, result.paymentId)).toMatchObject({ status: 'SUCCEEDED', verifiedSuccess: true });
        expect(provider.getPayment).toHaveBeenCalledTimes(2);
    });
    it('moves a final-attempt crashed claim to manual review', async () => {
        const result = await checkout();
        await payments.updateOne({ _id: result.paymentId }, { $set: { checkAttempts: 5, lockedUntil: new Date(0), leaseToken: 'crashed' } });
        await service.processDuePayments();
        expect(await load(result.paymentId)).toMatchObject({ status: 'UNKNOWN', reconciliationStatus: 'REQUIRED', nextCheckAt: null });
        expect(provider.getPayment).not.toHaveBeenCalled();
    });
    it('bounds failed event scheduling and recovers an event worker crash', async () => {
        const result = await checkout(); await accept(await webhook(result.paymentId));
        await events.updateOne({}, { $set: { lockedUntil: new Date(0), leaseToken: 'crashed', attempts: 1 } });
        jest.spyOn(payments, 'findOneAndUpdate').mockImplementationOnce(() => ({
            lean: () => ({ exec: async () => { throw new Error('database unavailable'); } }),
        } as any));
        await service.processDueEvents();
        expect(await events.findOne().lean()).toMatchObject({ state: 'RECEIVED', attempts: 2 });
        await events.updateOne({}, { $set: { nextAttemptAt: new Date(0) } });
        await service.processDueEvents();
        expect(await events.findOne().lean()).toMatchObject({ state: 'PROCESSED', attempts: 3 });
    });
    it('rechecks trusted facts after verification persistence fails', async () => {
        const result = await checkout(); await due(result.paymentId);
        jest.spyOn(payments, 'updateOne').mockImplementationOnce(() => ({
            exec: async () => { throw new Error('database unavailable'); },
        } as any));
        await service.processDuePayments();
        expect((await status.getPaymentStatus(fixture.memberId, result.paymentId)).verifiedSuccess).toBe(false);
        await due(result.paymentId); await service.processDuePayments();
        expect((await status.getPaymentStatus(fixture.memberId, result.paymentId)).verifiedSuccess).toBe(true);
    });
    it('preserves paid capture while reporting an order-processing failure', async () => {
        const result = await checkout(); await due(result.paymentId); await service.processDuePayments();
        await service.reportOrderProcessingFailure(fixture.orderId);
        expect(await status.getPaymentStatus(fixture.memberId, result.paymentId)).toMatchObject({ status: 'SUCCEEDED',
            verifiedSuccess: true, reconciliationStatus: 'REQUIRED' });
    });
});
