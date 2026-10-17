import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../../app.module';
import { BatchModule } from '../../../../gamenix-batch/src/batch.module';
import { SocketGateway } from '../../socket/socket.gateway';
import { NotificationService } from '../notification/notification.service';
import { Types } from 'mongoose';
import * as request from 'supertest';
import { PaymentWorkflowService } from './payment-workflow.service';
import { PortoneService, providerDeadline } from './portone.service';
import { PaymentWebhookController } from './payment-webhook.controller';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum',
    () => jest.requireActual('../../libs/enums/common.enum'), { virtual: true });
jest.mock('apps/gamenix-api/src/libs/enums/member.enum',
    () => jest.requireActual('../../libs/enums/member.enum'), { virtual: true });
jest.mock('apps/gamenix-api/src/libs/enums/product.enum',
    () => jest.requireActual('../../libs/enums/product.enum'), { virtual: true });
jest.mock('apps/gamenix-api/src/schemas/Product.model',
    () => jest.requireActual('../../schemas/Product.model'), { virtual: true });
jest.mock('apps/gamenix-api/src/schemas/Member.model',
    () => jest.requireActual('../../schemas/Member.model'), { virtual: true });

describe('Unconfigured sandbox fails closed', () => {
    it('bounds a hung provider call without cancelling or accepting its late result', async () => {
        jest.useFakeTimers();
        try {
            let finish: (value: string) => void;
            const pending = new Promise<string>((resolve) => { finish = resolve; });
            const result = providerDeadline(() => pending).catch((error) => error.message);
            jest.advanceTimersByTime(65000);
            expect(await result).toBe('Provider deadline exceeded');
            finish('late-provider-success');
            expect(await result).toBe('Provider deadline exceeded');
            expect(jest.getTimerCount()).toBe(0);
        } finally { jest.useRealTimers(); }
    });
    const member = new Types.ObjectId();
    const input = { orderId: String(new Types.ObjectId()), buyerCountry: 'US', idempotencyKey: 'synthetic-key-0001' };
    const make = (settings: Record<string, string>, provider: any = new PortoneService({} as any, new ConfigService(settings))) => {
        const model = { create: jest.fn(), findOne: jest.fn(), updateMany: jest.fn() };
        const service = new PaymentWorkflowService(model as any, model as any, {} as any, provider, new ConfigService(settings));
        return { model, service };
    };
    it.each([{}, { PAYMENTS_ENABLED: 'true' }, { PAYMENTS_ENABLED: 'true', NODE_ENV: 'production' }])
    ('cannot enable checkout with environment flags alone (%j)', async (settings) => {
        const { model, service } = make(settings);
        expect(await service.availability()).toEqual({ enabled: false, reason: 'SANDBOX_NOT_VERIFIED', buyerCountries: [] });
        await expect(service.createSession(member, input)).rejects.toThrow('Sandbox checkout is unavailable');
        await expect(service.receiveWebhook(Buffer.from('{}'), {})).rejects.toThrow('Sandbox checkout is unavailable');
        expect(await service.processDueEvents()).toBe(0);
        expect(await service.processDuePayments()).toBe(0);
        expect(model.create).not.toHaveBeenCalled();
        expect(model.findOne).not.toHaveBeenCalled();
        expect(model.updateMany).not.toHaveBeenCalled();
    });
    it('rejects unauthenticated and malformed session inputs', async () => {
        const { service } = make({});
        await expect(service.createSession(undefined, input)).rejects.toThrow('Authentication required');
        await expect(service.createSession(member, { ...input, orderId: 'bad' })).rejects.toThrow('Invalid checkout request');
    });
    it('rejects forged signatures before storing an event', async () => {
        const provider = { verifiedSandbox: async () => ({ provider: 'fixture', merchantId: 'm', storeId: 's',
            channelId: 'c', pgMerchantId: 'pg', environment: 'SANDBOX', currency: 'USD', checkoutHost: 'checkout.example.test', buyerCountries: ['US'] }),
            verifyWebhook: jest.fn(async () => { throw new Error('bad signature'); }) };
        const { model, service } = make({ PAYMENTS_ENABLED: 'true' }, provider);
        await expect(service.receiveWebhook(Buffer.from('{}'), {})).rejects.toThrow('Invalid webhook signature');
        expect(model.create).not.toHaveBeenCalled();
    });
    it('preserves exact raw bytes at the HTTP boundary', async () => {
        const workflow = { receiveWebhook: jest.fn(async (_raw: Buffer, _headers: Record<string, unknown>) => ({ received: true })) };
        const module = await Test.createTestingModule({ controllers: [PaymentWebhookController],
            providers: [{ provide: PaymentWorkflowService, useValue: workflow }] }).compile();
        const app = module.createNestApplication({ rawBody: true });
        await app.init();
        await app.listen(0, '127.0.0.1');
        try {
            const body = '{ "synthetic": true, "spacing" : 1 }';
            await request(app.getHttpServer()).post('/payments/webhook').set('Content-Type', 'application/json')
                .set('webhook-signature', 'fixture-only').send(body).expect(200);
            expect(workflow.receiveWebhook.mock.calls[0][0]).toEqual(Buffer.from(body));
            expect(workflow.receiveWebhook.mock.calls[0][1]['webhook-signature']).toBe('fixture-only');
        } finally { await app.close(); }
    });
});

describe('Petora PortOne lookup adapted to USD sandbox facts', () => {
    const paymentId = `gamenix-test-${new Types.ObjectId()}`;
    const settings = { NODE_ENV: 'test', PORTONE_ENVIRONMENT: 'SANDBOX', PORTONE_V2_API_SECRET: 'fixture-secret',
        PORTONE_MERCHANT_ID: 'fixture-merchant', PORTONE_STORE_ID: 'fixture-store',
        PORTONE_TEST_CHANNEL_ID: 'fixture-channel', PORTONE_TEST_PG_MERCHANT_ID: 'fixture-pg' };
    const data = () => ({ id: paymentId, status: 'PAID', merchantId: settings.PORTONE_MERCHANT_ID,
        storeId: settings.PORTONE_STORE_ID, version: 'V2', transactionId: 'fixture-capture', paidAt: new Date().toISOString(),
        currency: 'USD', amount: { total: 1050, paid: 1050, cancelled: 0 },
        channel: { type: 'TEST', id: settings.PORTONE_TEST_CHANNEL_ID, pgMerchantId: settings.PORTONE_TEST_PG_MERCHANT_ID },
        customData: JSON.stringify({ bindingKey: 'a'.repeat(64) }) });
    const make = (overrides = {}) => {
        const get = jest.fn().mockResolvedValue({ data: data() });
        const values = { ...settings, ...overrides };
        const service = new PortoneService({ axiosRef: { get } } as any, { get: (key) => values[key] } as ConfigService);
        return { service, get };
    };

    it('uses the authenticated REST lookup and returns only allowlisted TEST/USD facts in cents', async () => {
        const { service, get } = make();
        expect(await service.getPaymentFacts(paymentId)).toMatchObject({ providerPaymentId: paymentId,
            status: 'SUCCEEDED', amountMinor: 1050, environment: 'SANDBOX', captured: true, checkoutClosed: false });
        expect(get).toHaveBeenCalledWith(`https://api.portone.io/payments/${paymentId}`,
            expect.objectContaining({ headers: { Authorization: 'PortOne fixture-secret' }, params: { storeId: 'fixture-store' }, maxRedirects: 0 }));
        // Even complete lookup settings are not evidence of merchant/checkout compatibility.
        expect(await service.verifiedSandbox()).toBeNull();
    });

    it('keeps Petora getPayment and verifyPaid return values and verifies the expected USD cents', async () => {
        const { service, get } = make();
        const payment = await service.getPayment(paymentId);
        expect(payment).toMatchObject({ id: paymentId, status: 'PAID', currency: 'USD', amount: { total: 1050 } });
        expect(payment).not.toHaveProperty('verifiedSuccess');
        expect(await service.verifyPaid(paymentId, 1050)).toEqual(payment);
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('rejects unpaid provider results through Petora verifyPaid', async () => {
        const { service, get } = make();
        for (const status of ['READY', 'PENDING', 'FAILED', 'CANCELLED']) {
            get.mockResolvedValueOnce({ data: { ...data(), status } });
            await expect(service.verifyPaid(paymentId, 1050)).rejects.toThrow('Payment is not completed');
        }
    });

    it('rejects wrong totals, absent/wrong currency and invalid expected amounts', async () => {
        const { service, get } = make();
        await expect(service.verifyPaid(paymentId, 1049)).rejects.toThrow('Paid amount does not match');
        for (const currency of [undefined, 'KRW']) {
            get.mockResolvedValueOnce({ data: { ...data(), currency } });
            await expect(service.verifyPaid(paymentId, 1050)).rejects.toThrow('currency mismatch');
        }
        get.mockClear();
        for (const amount of [0, -1, 10.5, NaN, Infinity]) {
            await expect(service.verifyPaid(paymentId, amount)).rejects.toThrow('Invalid expected payment amount');
        }
        expect(get).not.toHaveBeenCalled();
    });

    it.each([{ NODE_ENV: 'production' }, { PORTONE_ENVIRONMENT: 'LIVE' }, { PORTONE_V2_API_SECRET: '' },
        { PORTONE_TEST_CHANNEL_ID: '' }])('rejects unsafe or incomplete lookup configuration %j', async (overrides) => {
        const { service, get } = make(overrides);
        await expect(service.getPaymentFacts(paymentId)).rejects.toThrow('not configured');
        expect(get).not.toHaveBeenCalled();
    });

    it.each([
        { currency: 'KRW' }, { currency: undefined }, { merchantId: 'other' }, { storeId: 'other' }, { id: 'other' }, { version: 'V1' },
        { channel: { ...data().channel, type: 'LIVE' } }, { channel: { ...data().channel, id: 'other' } },
        { channel: { ...data().channel, pgMerchantId: 'other' } }, { amount: { total: 10.5 } },
        { amount: { total: 1050, paid: 1049, cancelled: 0 } }, { amount: { total: 1050, paid: 1050, cancelled: 1 } },
        { customData: 'invalid' }, { customData: '{}' }, { transactionId: '' }, { paidAt: 'invalid' },
    ])('rejects incomplete or conflicting provider facts %j', async (override) => {
        const { service, get } = make();
        get.mockResolvedValueOnce({ data: { ...data(), ...override } });
        await expect(service.getPaymentFacts(paymentId)).rejects.toThrow();
    });

    it('keeps cancellation/partial refund and unknown outcomes uncertain rather than reopening checkout', async () => {
        const { service, get } = make();
        for (const status of ['CANCELLED', 'PARTIAL_CANCELLED', 'UNRECOGNIZED']) {
            get.mockResolvedValueOnce({ data: { ...data(), status } });
            expect(await service.getPaymentFacts(paymentId)).toMatchObject({ status: 'UNKNOWN', captured: false, checkoutClosed: false });
        }
    });

    it('rejects non-server references and sanitizes provider lookup errors', async () => {
        const { service, get } = make();
        await expect(service.getPaymentFacts('browser-provided-id')).rejects.toThrow('Invalid payment reference');
        expect(get).not.toHaveBeenCalled();
        get.mockRejectedValueOnce({ response: { status: 404 } });
        await expect(service.getPaymentFacts(paymentId)).rejects.toThrow('Payment not found');
        get.mockRejectedValueOnce(new Error('Authorization: PortOne fixture-secret'));
        await expect(service.getPaymentFacts(paymentId)).rejects.toThrow('Payment lookup failed');
    });
});


describe('Adapted modules in the real application graph', () => {
    const connection = { readyState: 1, db: { admin: () => ({ command: async () => ({ setName: 'fixture', logicalSessionTimeoutMinutes: 30, maxWireVersion: 17 }) }) }, models: {}, model: jest.fn(() => ({ init: jest.fn().mockResolvedValue(undefined) })), close: jest.fn() };

    it('initializes the API GraphQL schema and shares one socket/provider instance', async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(getConnectionToken()).useValue(connection).compile();
        const app = module.createNestApplication();
        app.useWebSocketAdapter(new WsAdapter(app));
        try {
            await app.init();
            const schema = app.get(GraphQLSchemaHost).schema;
            expect(Object.keys(schema.getQueryType().getFields())).toEqual(expect.arrayContaining([
                'getReviews', 'getNotifications', 'getPaymentStatus', 'getTestCheckoutAvailability',
            ]));
            expect(Object.keys(schema.getMutationType().getFields())).toEqual(expect.arrayContaining([
                'createNewReview', 'updateReview', 'updateReviewByAdmin', 'removeReviewByAdmin', 'createTestCheckoutSession',
            ]));
            expect((app.get(NotificationService) as any).socketGateway).toBe(app.get(SocketGateway));
            expect((app.get(PaymentWorkflowService) as any).provider).toBe(app.get(PortoneService));
            expect(app.get(PaymentWebhookController)).toBeDefined();
        } finally { await app.close(); }
    });

    it('keeps API webhook routes out of the batch application', async () => {
        const module = await Test.createTestingModule({ imports: [BatchModule] })
            .overrideProvider(getConnectionToken()).useValue(connection).compile();
        try {
            expect(module.get(PaymentWorkflowService)).toBeDefined();
            expect(() => module.get(PaymentWebhookController)).toThrow();
        } finally { await module.close(); }
    });
});
