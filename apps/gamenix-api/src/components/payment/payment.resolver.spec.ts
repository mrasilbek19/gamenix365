import { INestApplication } from '@nestjs/common';
import { ApolloDriver } from '@nestjs/apollo';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { graphql, GraphQLSchema } from 'graphql';
import { AuthService } from '../auth/auth.service';
import { PaymentResolver } from './payment.resolver';
import { PaymentService } from './payment.service';
import { DirectKakaoPayService } from './direct-kakaopay.service';
import { DirectKakaoCheckoutService } from './direct-kakao-checkout.service';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum', () =>
    jest.requireActual('../../libs/enums/common.enum'), { virtual: true });

describe('Payment GraphQL schema and original JWT guard', () => {
    const ownerId = '507f1f77bcf86cd799439011', orderId = '507f1f77bcf86cd799439012';
    const jwt = new JwtService({ secret: 'offline-petora-payment-jwt', signOptions: { algorithm: 'HS256' }, verifyOptions: { algorithms: ['HS256'] } });
    const calls = {
        prepareDirectKakaoPayCheckout: jest.fn(), getKakaoPayPaymentStatus: jest.fn(), approveDirectKakaoPayPayment: jest.fn(),
        verifyDirectKakaoPayPayment: jest.fn(), cancelDirectKakaoPayPayment: jest.fn(),
    };
    const operations = [
        ['prepareDirectKakaoPayCheckout', `mutation { prepareKakaoPayCheckout(orderId:"${orderId}") { paymentId } }`],
        ['approveDirectKakaoPayPayment', `mutation { approveKakaoPayPayment(orderId:"${orderId}",state:"fixture-state",pgToken:"fixture-pg-token") { status verifiedSuccess cancellationPending preparationRetryable preparationError } }`],
        ['getKakaoPayPaymentStatus', `query { getKakaoPayPaymentStatus(orderId:"${orderId}") { status verifiedSuccess cancellationPending preparationRetryable preparationError } }`],
        ['verifyDirectKakaoPayPayment', `mutation { verifyKakaoPayPayment(orderId:"${orderId}") { status verifiedSuccess cancellationPending preparationRetryable preparationError } }`],
        ['cancelDirectKakaoPayPayment', `mutation { cancelKakaoPayPayment(orderId:"${orderId}") { status verifiedSuccess cancellationPending preparationRetryable preparationError } }`],
    ];
    let app: INestApplication, schema: GraphQLSchema;

    beforeAll(async () => {
        const fixture = await Test.createTestingModule({
            imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
            providers: [PaymentResolver,
                { provide: PaymentService, useValue: calls },
                { provide: DirectKakaoCheckoutService, useValue: calls },
                { provide: AuthService, useValue: new AuthService(jwt) },
                { provide: DirectKakaoPayService, useValue: { getAvailability: async () => ({
                    provider: 'DIRECT', enabled: false, currency: 'KRW', requiredCurrency: 'KRW', blockers: ['DIRECT_TEST_NOT_CONFIGURED'],
                }) } },
            ],
        }).compile();
        app = fixture.createNestApplication({ logger: false });
        await app.init(); schema = app.get(GraphQLSchemaHost).schema;
    });
    afterAll(async () => { await app?.close(); });
    beforeEach(() => {
        for (const call of Object.values(calls)) {
            call.mockReset(); call.mockResolvedValue({ paymentId: 'fixture-payment', status: 'PAID', verifiedSuccess: true,
                cancellationPending: false, preparationRetryable: false });
        }
    });

    it.each(operations)('%s rejects missing and malformed JWTs before reaching payment business logic', async (_, source) => {
        for (const headers of [{}, { authorization: 'Bearer malformed-fixture-token' }]) {
            const result = await graphql({ schema, source, contextValue: { req: { headers, body: {} } } });
            expect(result.errors).toBeDefined();
        }
        for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
    });

    it.each(operations)('%s passes only the JWT owner and supplied order reference to the service', async (method, source) => {
        const token = jwt.sign({ _id: ownerId, memberNick: 'offline-owner', memberType: 'USER', memberStatus: 'ACTIVE' });
        const result = await graphql({ schema, source, contextValue: { req: { headers: { authorization: `Bearer ${token}` }, body: {} } } });
        expect(result.errors).toBeUndefined();
        expect(String(calls[method].mock.calls[0][0])).toBe(ownerId);
        expect(calls[method].mock.calls[0][1]).toBe(orderId);
    });

    it('requires explicit callback state/token and passes them after the JWT owner and order', async () => {
        const token = jwt.sign({ _id: ownerId, memberNick: 'offline-owner', memberType: 'USER', memberStatus: 'ACTIVE' });
        const source = `mutation { approveKakaoPayPayment(orderId:"${orderId}",state:"fixture-state",pgToken:"fixture-pg-token") { verifiedSuccess } }`;
        expect((await graphql({ schema, source, contextValue: { req: { headers: { authorization: `Bearer ${token}` }, body: {} } } })).errors).toBeUndefined();
        expect(calls.approveDirectKakaoPayPayment.mock.calls[0].slice(1)).toEqual([orderId, 'fixture-state', 'fixture-pg-token']);
        expect((await graphql({ schema, source: `mutation { approveKakaoPayPayment(orderId:"${orderId}") { verifiedSuccess } }` })).errors).toBeDefined();
    });

    it('projects an actionable preparation failure and explicit retry permission through the authenticated schema', async () => {
        calls.getKakaoPayPaymentStatus.mockResolvedValueOnce({ status: 'FAILED', verifiedSuccess: false, cancellationPending: false,
            preparationRetryable: true, preparationError: 'Register the checkout origin in KakaoPay Developers > Application > Platform > Web > Site domains, then try again' });
        const token = jwt.sign({ _id: ownerId, memberNick: 'offline-owner', memberType: 'USER', memberStatus: 'ACTIVE' });
        const result = await graphql({ schema,
            source: `query { getKakaoPayPaymentStatus(orderId:"${orderId}") { status verifiedSuccess preparationRetryable preparationError } }`,
            contextValue: { req: { headers: { authorization: `Bearer ${token}` }, body: {} } },
        });
        expect(result.errors).toBeUndefined();
        expect(result.data.getKakaoPayPaymentStatus).toMatchObject({ status: 'FAILED', verifiedSuccess: false, preparationRetryable: true });
        expect(result.data.getKakaoPayPaymentStatus).toMatchObject({ preparationError: expect.stringContaining('Platform > Web > Site domains') });
        const fields = (schema.getType('KakaoPayPaymentStatus') as any).getFields();
        expect(String(fields.preparationRetryable.type)).toBe('Boolean!');
        expect(String(fields.preparationError.type)).toBe('String');
        expect(fields.preparationHttpStatus).toBeUndefined();
        expect(fields.preparationErrorCode).toBeUndefined();
    });

    it('does not accept browser-supplied amount, owner, payment status or arbitrary payment ID', async () => {
        const result = await graphql({ schema, source: `mutation { verifyKakaoPayPayment(orderId:"${orderId}",paymentId:"forged",memberId:"other",amount:1,status:"PAID") { verifiedSuccess } }` });
        expect(result.errors).toHaveLength(4);
        for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
    });

    it('offers only the authenticated direct approval contract and public safe readiness', async () => {
        expect(schema.getMutationType().getFields().approveKakaoPayPayment).toBeDefined();
        expect(schema.getMutationType().getFields().approveDirectKakaoPayPayment).toBeUndefined();
        const result = await graphql({ schema, source: '{ getKakaoPayTestAvailability { provider enabled blockers } }' });
        expect(result.errors).toBeUndefined();
        expect(result.data.getKakaoPayTestAvailability).toMatchObject({ provider: 'DIRECT', enabled: false });
    });
});
