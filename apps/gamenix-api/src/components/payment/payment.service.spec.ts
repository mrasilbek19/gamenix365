import { BadRequestException, INestApplication, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApolloDriver } from '@nestjs/apollo';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { graphql, GraphQLObjectType, GraphQLSchema } from 'graphql';
import { Types } from 'mongoose';
import { PaymentEnvironment, PaymentReconciliationStatus, PaymentStatus } from '../../libs/enums/payment.enum';
import { AuthService } from '../auth/auth.service';
import { PaymentResolver } from './payment.resolver';
import { PaymentService } from './payment.service';
import { paymentFixture } from './payment.fixture';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum',
    () => jest.requireActual('../../libs/enums/common.enum'), { virtual: true });

describe('PaymentService owner-only local status', () => {
    const ownerId = new Types.ObjectId();
    const otherId = new Types.ObjectId();
    const paymentId = new Types.ObjectId();
    const record = { ...paymentFixture({ memberId: ownerId }), _id: paymentId, status: PaymentStatus.PENDING,
        reconciliationStatus: PaymentReconciliationStatus.NONE, createdAt: new Date(), updatedAt: new Date() };
    let model: any;
    let query: any;
    let service: PaymentService;

    beforeEach(() => {
        query = { select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(record) };
        model = { findOne: jest.fn(() => query) };
        service = new PaymentService(model);
    });

    it.each([ownerId, ownerId.toHexString()])('uses the authenticated identity in the database predicate (%s)', async (identity) => {
        await expect(service.getPaymentStatus(identity, String(paymentId))).resolves.toMatchObject({ status: PaymentStatus.PENDING });
        expect(model.findOne).toHaveBeenCalledWith({ _id: paymentId, memberId: ownerId, environment: PaymentEnvironment.SANDBOX });
        expect(query.select).toHaveBeenCalledWith({
            _id: 1, orderId: 1, shopId: 1, status: 1, environment: 1, currency: 1, amountMinor: 1,
            reconciliationStatus: 1, verifiedAt: 1, expiresAt: 1, createdAt: 1, updatedAt: 1,
        });
    });

    it.each(['unknown', 'another member'])('returns the same not-found error for %s payments', async (kind) => {
        query.exec.mockResolvedValue(null);
        await expect(service.getPaymentStatus(kind === 'unknown' ? ownerId : otherId, String(paymentId)))
            .rejects.toThrow(new NotFoundException('Payment not found'));
        expect(model.findOne.mock.calls[0][0].memberId).toEqual(kind === 'unknown' ? ownerId : otherId);
    });

    it.each(['not-an-id', '', 'a'.repeat(23), 'a'.repeat(25)])('rejects malformed payment IDs before querying (%s)', async (id) => {
        await expect(service.getPaymentStatus(ownerId, id)).rejects.toBeInstanceOf(BadRequestException);
        expect(model.findOne).not.toHaveBeenCalled();
    });

    it('rejects a missing authenticated identity before querying', async () => {
        await expect(service.getPaymentStatus(undefined, String(paymentId))).rejects.toBeInstanceOf(UnauthorizedException);
        expect(model.findOne).not.toHaveBeenCalled();
    });

    it('propagates a database read outage without inventing a payment outcome', async () => {
        query.exec.mockRejectedValue(new Error('database unavailable'));
        await expect(service.getPaymentStatus(ownerId, String(paymentId))).rejects.toThrow('database unavailable');
    });
});

describe('Payment GraphQL authentication and privacy', () => {
    let app: INestApplication;
    let schema: GraphQLSchema;
    let service: PaymentService;
    let read: jest.SpyInstance;
    const ownerId = new Types.ObjectId();
    const otherId = new Types.ObjectId();
    const paymentId = new Types.ObjectId();
    const now = new Date('2026-10-17T00:00:00Z');
    const record = { ...paymentFixture({ memberId: ownerId }), _id: paymentId, status: PaymentStatus.PENDING,
        reconciliationStatus: PaymentReconciliationStatus.NONE, createdAt: now, updatedAt: now };
    const source = 'query Payment($id: String!) { getPaymentStatus(paymentId: $id) { _id orderId status environment currency amountMinor reconciliationStatus verifiedAt } }';
    const run = (token?: string, query = source) => graphql({
        schema, source: query, variableValues: { id: String(paymentId) },
        contextValue: { req: { headers: token ? { authorization: `Bearer ${token}` } : {}, body: {} } },
    });

    beforeAll(async () => {
        const model = { findOne: jest.fn((filter) => ({ select: () => ({ lean: () => ({
            exec: async () => String(filter.memberId) === String(ownerId) ? record : null,
        }) }) })) };
        service = new PaymentService(model as any);
        read = jest.spyOn(service, 'getPaymentStatus');
        const module = await Test.createTestingModule({
            imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
            providers: [PaymentResolver, { provide: PaymentService, useValue: service }, { provide: AuthService, useValue: {
                verifyToken: async (token: string) => token === 'owner' ? { _id: String(ownerId) }
                    : token === 'other' ? { _id: String(otherId) } : null,
            } }],
        }).compile();
        app = module.createNestApplication();
        await app.init();
        schema = app.get(GraphQLSchemaHost).schema;
    });
    beforeEach(() => read.mockClear());
    afterAll(async () => { await app?.close(); });

    it.each([undefined, 'invalid'])('denies missing/invalid authentication (%s)', async (token) => {
        expect((await run(token)).errors).toHaveLength(1);
        expect(read).not.toHaveBeenCalled();
    });

    it('returns only owner-visible local facts for the authenticated owner', async () => {
        const result = await run('owner');
        expect(result.errors).toBeUndefined();
        expect(result.data.getPaymentStatus).toMatchObject({
            _id: String(paymentId), status: 'PENDING', environment: 'SANDBOX', currency: 'USD',
            amountMinor: 5500, reconciliationStatus: 'NONE', verifiedAt: null,
        });
        expect(read).toHaveBeenCalledWith(String(ownerId), String(paymentId));
    });

    it('denies another authenticated member', async () => {
        const result = await run('other');
        expect(result.errors?.[0].message).toBe('Payment not found');
        expect(result.data).toBeNull();
    });

    it('exposes no payment write operation, owner override or private payment fields', () => {
        const queryFields = schema.getQueryType().getFields();
        expect(Object.keys(queryFields)).toEqual(['getPaymentStatus']);
        expect(queryFields.getPaymentStatus.args.map((arg) => arg.name)).toEqual(['paymentId']);
        expect(schema.getMutationType()).toBeUndefined();
        expect(Object.keys((schema.getType('Payment') as GraphQLObjectType).getFields())).toEqual([
            '_id', 'orderId', 'shopId', 'status', 'environment', 'currency', 'amountMinor',
            'reconciliationStatus', 'verifiedAt', 'expiresAt', 'createdAt', 'updatedAt',
        ]);
    });

    it('rejects attempts to request provider secrets or snapshots through GraphQL', async () => {
        const result = await run('owner', 'query Payment($id: String!) { getPaymentStatus(paymentId: $id) { merchantId snapshot idempotencyKey providerPaymentId failureDetail } }');
        expect(result.errors).toHaveLength(5);
        expect(read).not.toHaveBeenCalled();
    });
});
