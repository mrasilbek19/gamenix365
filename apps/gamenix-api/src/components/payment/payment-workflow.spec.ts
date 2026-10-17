import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import * as request from 'supertest';
import { PaymentWorkflowService } from './payment-workflow.service';
import { UnconfiguredPaymentProvider, providerDeadline } from './payment-provider';
import { PaymentWebhookController } from './payment-webhook.controller';

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
    const make = (settings: Record<string, string>, provider: any = new UnconfiguredPaymentProvider()) => {
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
