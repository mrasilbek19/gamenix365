import { Global, INestApplication, Logger, Module, ValidationPipe } from '@nestjs/common';
import { ApolloDriver } from '@nestjs/apollo';
import { ConfigService } from '@nestjs/config';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { graphql, GraphQLInputObjectType, GraphQLObjectType, GraphQLSchema } from 'graphql';
import { Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { MemberResolver } from '../member/member.resolver';
import { MemberService } from '../member/member.service';
import { MailService } from '../mail/mail.service';
import { MemberType } from '../../libs/enums/member.enum';
import { LoggingInterceptor } from '../../libs/interceptor/Logging.interceptor';
import AuthTokenSchema from '../../schemas/AuthToken.model';
import { EmailVerificationResolver } from './email-verification.resolver';
import { EmailVerificationModule } from './email-verification.module';
import { EmailVerificationService } from './email-verification.service';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum', () =>
    jest.requireActual('../../libs/enums/common.enum'), { virtual: true });

const ownerId = new Types.ObjectId();
const config = (changes = {}) => {
    const values = { NODE_ENV: 'test', FRONTEND_ORIGIN: 'https://frontend.example.test', ...changes };
    return { get: (key: string) => values[key] } as ConfigService;
};

@Global()
@Module({
    providers: [{ provide: getConnectionToken(), useValue: {
        models: { Member: {}, AuthToken: { init: async () => {} }, Notification: {} },
        model: () => ({}),
        db: { admin: () => ({ command: async () => ({ setName: 'fixture', maxWireVersion: 25, logicalSessionTimeoutMinutes: 30 }) }) },
    } }],
    exports: [getConnectionToken()],
})
class VerificationConnectionTestModule { }

describe('Email verification configuration, topology and abuse limits', () => {
    it('resolves the real verification/mail modules and checks topology without connecting MongoDB', async () => {
        const module = await Test.createTestingModule({ imports: [VerificationConnectionTestModule, EmailVerificationModule] })
            .overrideProvider(ConfigService).useValue(config()).compile();
        try {
            await module.init();
            expect(module.get(EmailVerificationService)).toBeDefined();
            expect(module.get(MailService).getCapturedMessages()).toEqual([]);
        } finally { await module.close(); }
    });

    it.each(['https://frontend.example.test', 'http://localhost:3000', 'http://127.0.0.1:3000'])('allows configured trusted origin %s', (origin) => {
        expect(() => new EmailVerificationService({} as any, {} as any, {} as any, {} as any, config({ FRONTEND_ORIGIN: origin })))
            .not.toThrow();
    });

    it.each(['javascript:alert(1)', 'http://untrusted.example.test', 'https://user:pass@example.test',
        'https://example.test/redirect', 'https://example.test/?next=evil', 'https://example.test/#fragment'])
        ('rejects unsafe frontend origin %s', (origin) => {
            expect(() => new EmailVerificationService({} as any, {} as any, {} as any, {} as any, config({ FRONTEND_ORIGIN: origin })))
                .toThrow('FRONTEND_ORIGIN');
        });

    it('requires HTTPS in production', () => {
        expect(() => new EmailVerificationService({} as any, {} as any, {} as any, {} as any,
            config({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'http://localhost:3000' }))).toThrow('FRONTEND_ORIGIN');
    });

    it.each([
        { maxWireVersion: 25, logicalSessionTimeoutMinutes: 30 },
        { setName: 'fixture', maxWireVersion: 6, logicalSessionTimeoutMinutes: 30 },
        { msg: 'isdbgrid', maxWireVersion: 7, logicalSessionTimeoutMinutes: 30 },
    ])('rejects topology without transaction support: %j', async (hello) => {
        const connection = { db: { admin: () => ({ command: async () => hello }) } };
        const service = new EmailVerificationService({} as any, {} as any, connection as any, {} as any, config());
        await expect(service.onModuleInit()).rejects.toThrow('requires MongoDB transactions');
    });

    it('limits malformed verification attempts before opening sessions', async () => {
        const connection = { startSession: jest.fn() };
        const service = new EmailVerificationService({} as any, {} as any, connection as any, {} as any, config());
        for (let index = 0; index < 60; index++) await expect(service.verifyEmail('invalid', '127.0.0.1')).rejects.toThrow('Invalid or expired');
        await expect(service.verifyEmail('invalid', '127.0.0.1')).rejects.toThrow('Too many verification attempts');
        expect(connection.startSession).not.toHaveBeenCalled();
    });

    it('limits request attempts independently for each source IP', async () => {
        const connection = { startSession: jest.fn().mockRejectedValue(new Error('Fixture session failure')) };
        const service = new EmailVerificationService({} as any, {} as any, connection as any, {} as any, config());
        for (let index = 0; index < 20; index++) {
            await expect(service.requestEmailVerification(ownerId as any, '127.0.0.1')).rejects.toThrow('Fixture session failure');
        }
        await expect(service.requestEmailVerification(ownerId as any, '127.0.0.1')).rejects.toThrow('Too many verification attempts');
        await expect(service.requestEmailVerification(ownerId as any, '127.0.0.2')).rejects.toThrow('Fixture session failure');
        expect(connection.startSession).toHaveBeenCalledTimes(21);
    });

    it('expires the IP abuse window', async () => {
        const time = jest.spyOn(Date, 'now').mockReturnValue(2000000);
        const service = new EmailVerificationService({} as any, {} as any, {} as any, {} as any, config());
        try {
            for (let index = 0; index < 60; index++) await expect(service.verifyEmail('invalid', '127.0.0.1')).rejects.toThrow('Invalid or expired');
            await expect(service.verifyEmail('invalid', '127.0.0.1')).rejects.toThrow('Too many verification attempts');
            time.mockReturnValue(2000000 + 16 * 60000);
            await expect(service.verifyEmail('invalid', '127.0.0.1')).rejects.toThrow('Invalid or expired');
        } finally { time.mockRestore(); }
    });

    it('defines unique hashes and TTL cleanup only on the token collection', () => {
        expect(AuthTokenSchema.indexes()).toContainEqual([{ tokenHash: 1 }, expect.objectContaining({ unique: true })]);
        expect(AuthTokenSchema.indexes()).toContainEqual([{ expiresAt: 1 }, expect.objectContaining({ expireAfterSeconds: 0 })]);
        expect(AuthTokenSchema.path('token')).toBeUndefined();
    });

    it('keeps all private verification state out of JWT payloads', async () => {
        const auth = new AuthService(new JwtService({ secret: 'email-verification-test-secret' }));
        const token = await auth.createToken({ _id: ownerId, memberType: MemberType.SHOP, memberEmailVersion: 2,
            emailVerificationRequestedAt: new Date(), emailVerificationWindowStart: new Date(), emailVerificationRequests: 1 } as any);
        const payload = await auth.verifyToken(token);
        for (const field of ['memberEmailVersion', 'emailVerificationRequestedAt', 'emailVerificationWindowStart', 'emailVerificationRequests']) {
            expect(payload).not.toHaveProperty(field);
        }
    });
});

describe('Email verification GraphQL ownership, validation and privacy', () => {
    let app: INestApplication;
    let schema: GraphQLSchema;
    let auth: AuthService;
    let log: jest.SpyInstance;
    const service = { requestEmailVerification: jest.fn(async () => true), verifyEmail: jest.fn(async () => true) };
    const requestMutation = 'mutation { requestEmailVerification }';
    const verifyMutation = 'mutation($input: VerifyEmailInput!) { verifyEmail(input: $input) }';
    const execute = async (source: string, input?: unknown, authenticated = false) => {
        const token = authenticated ? await auth.createToken({ _id: ownerId, memberType: MemberType.USER } as any) : null;
        return graphql({ schema, source, variableValues: { input }, contextValue: { req: {
            headers: token ? { authorization: `Bearer ${token}` } : {}, body: { variables: { input } }, ip: '127.0.0.1',
        } } });
    };

    beforeAll(async () => {
        log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
        auth = new AuthService(new JwtService({ secret: 'email-verification-test-secret' }));
        const module = await Test.createTestingModule({
            imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
            providers: [EmailVerificationResolver, MemberResolver,
                { provide: EmailVerificationService, useValue: service }, { provide: MemberService, useValue: {} },
                { provide: AuthService, useValue: auth }],
        }).compile();
        app = module.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        app.useGlobalInterceptors(new LoggingInterceptor());
        await app.init();
        schema = app.get(GraphQLSchemaHost).schema;
    });
    beforeEach(() => jest.clearAllMocks());
    afterAll(async () => { await app?.close(); log?.mockRestore(); });

    it('rejects an unauthenticated verification request', async () => {
        expect((await execute(requestMutation)).errors).toBeDefined();
        expect(service.requestEmailVerification).not.toHaveBeenCalled();
    });

    it('takes the owner ID only from authentication', async () => {
        expect((await execute(requestMutation, undefined, true)).errors).toBeUndefined();
        expect(service.requestEmailVerification).toHaveBeenCalledWith(ownerId, '127.0.0.1');
        const fields = schema.getMutationType().getFields();
        expect(fields.requestEmailVerification.args).toHaveLength(0);
        expect((await execute('mutation { requestEmailVerification(memberId: "someone-else") }', undefined, true)).errors).toBeDefined();
    });

    it('accepts possession of a valid token without login and does not log it', async () => {
        const token = 'a'.repeat(64);
        const result = await execute(verifyMutation, { token });
        expect(result.errors).toBeUndefined();
        expect(result.data.verifyEmail).toBe(true);
        expect(service.verifyEmail).toHaveBeenCalledWith(token, '127.0.0.1');
        expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    });

    it.each([null, '', 'invalid', 'a'.repeat(65)])('rejects malformed token %j before the service', async (token) => {
        expect((await execute(verifyMutation, { token })).errors).toBeDefined();
        expect(service.verifyEmail).not.toHaveBeenCalled();
    });

    it('exposes no token records, internal member fields or client verification status', () => {
        expect(schema.getType('AuthToken')).toBeUndefined();
        const memberFields = (schema.getType('Member') as GraphQLObjectType).getFields();
        const inputFields = (schema.getType('MemberUpdate') as GraphQLInputObjectType).getFields();
        for (const name of ['memberEmailVersion', 'emailVerificationRequestedAt', 'emailVerificationWindowStart', 'emailVerificationRequests']) {
            expect(memberFields[name]).toBeUndefined();
            expect(inputFields[name]).toBeUndefined();
        }
        expect(inputFields.memberEmailVerified).toBeUndefined();
    });
});
