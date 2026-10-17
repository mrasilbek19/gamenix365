import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ApolloDriver } from '@nestjs/apollo';
import { GqlExecutionContext, GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { graphql, GraphQLSchema } from 'graphql';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { PasswordResetInput, PasswordResetRequestInput, PasswordResetVerifyInput } from '../../libs/dto/member/member.input';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';
import { LoggingInterceptor } from '../../libs/interceptor/Logging.interceptor';
import { firstValueFrom, of } from 'rxjs';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum',
    () => jest.requireActual('../../libs/enums/common.enum'), { virtual: true });

describe('Petora password recovery adapted to Gamenix', () => {
    const token = 'a'.repeat(64);
    it('normalizes only the email, preserving the existing case-sensitive username', async () => {
        const input = plainToInstance(PasswordResetRequestInput, { memberNick: 'PlayerOne', memberEmail: ' Owner@EXAMPLE.test ' });
        expect(await validate(input)).toEqual([]);
        expect(input).toMatchObject({ memberNick: 'PlayerOne', memberEmail: 'owner@example.test' });
    });
    it.each(['12345', '1234567', 'abcdef', ' 12345', null])('rejects invalid reset code %s', async (code) => {
        expect((await validate(plainToInstance(PasswordResetVerifyInput, { memberNick: 'player', code }))).length).toBeGreaterThan(0);
    });
    it.each(['tiny', 'too-long-password', '     ', null])('uses the existing password boundaries and rejects blank %s', async (memberPassword) => {
        expect((await validate(plainToInstance(PasswordResetInput, { resetToken: token, memberPassword }))).length).toBeGreaterThan(0);
    });
    it('preserves intentional spaces in an otherwise valid new password', async () => {
        const input = plainToInstance(PasswordResetInput, { resetToken: token, memberPassword: ' pass123 ' });
        expect(await validate(input)).toEqual([]);
        expect(input.memberPassword).toBe(' pass123 ');
    });
    it('reuses the existing mail transport and escapes copied password-reset content', async () => {
        const mail = new MailService(new ConfigService({ NODE_ENV: 'test', MAIL_TRANSPORT: 'capture' }));
        try {
            await mail.sendPasswordResetCode('owner@example.test', '<img>&"', '012345', 3);
            expect(mail.getCapturedMessages()).toHaveLength(1);
            const message = mail.getCapturedMessages()[0];
            expect(message.to).toBe('owner@example.test');
            expect(message.html).toContain('&lt;img&gt;&amp;&quot;');
            expect(message.html).not.toContain('<img>');
            expect(message.text).toContain('012345');
            expect(message.text).toContain('3 minutes');
            expect(message.subject).toBe('Gamenix365 — Password reset code');
        } finally { mail.onModuleDestroy(); }
    });
    it('keeps reset budgets out of JWTs', async () => {
        const auth = new AuthService(new JwtService({ secret: 'reset-private-fields-test' }));
        const result = await auth.verifyToken(await auth.createToken({
            _id: '507f1f77bcf86cd799439011', memberNick: 'player', passwordResetRequestedAt: new Date(),
            passwordResetWindowStart: new Date(), passwordResetRequests: 2,
        } as any));
        for (const field of ['passwordResetRequestedAt', 'passwordResetWindowStart', 'passwordResetRequests']) expect(result).not.toHaveProperty(field);
    });
    it('returns the same response for an unknown account without sending mail', async () => {
        const session = { withTransaction: async (work) => work(), endSession: jest.fn() };
        const query = { select: () => query, session: () => query, lean: () => query, exec: async () => null };
        const members = { db: { startSession: async () => session }, findOne: () => query };
        const mail = { sendPasswordResetCode: jest.fn() };
        const service = new MemberService(members as any, {} as any, { hashPassword: async () => 'test-hash' } as any,
            {} as any, {} as any, {} as any, mail as any);
        expect(await service.requestPasswordReset({ memberNick: 'missing', memberEmail: 'missing@example.test' }, '127.0.0.1')).toBe(true);
        expect(mail.sendPasswordResetCode).not.toHaveBeenCalled();
        expect(session.endSession).toHaveBeenCalledTimes(1);
    });
    it('bounds guesses by IP even for missing accounts', async () => {
        const query = { select: () => query, lean: () => query, exec: async () => null };
        const service = new MemberService({ findOne: () => query } as any, {} as any, {} as any,
            {} as any, {} as any, {} as any, {} as any);
        for (let i = 0; i < 60; i++) await expect(service.verifyPasswordResetCode({ memberNick: 'missing', code: '123456' }, '127.0.0.1')).rejects.toThrow('Invalid or expired');
        await expect(service.verifyPasswordResetCode({ memberNick: 'missing', code: '123456' }, '127.0.0.1')).rejects.toThrow('Too many password reset attempts');
    });
    it.each(['requestPasswordReset', 'verifyPasswordResetCode', 'resetPassword'])('redacts %s request and response secrets, including mixed operations', async (operation) => {
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        const context = jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({ getInfo: () => ({ fieldName: 'login' }),
            getContext: () => ({ req: { body: { variables: { input: { resetToken: token, memberPassword: 'private-pass', code: '012345' } },
                query: `mutation { login(input: {}) { _id } secret: ${operation}(input: {}) }` } } }),
        } as any);
        try {
            await firstValueFrom(new LoggingInterceptor().intercept({ getType: () => 'graphql' } as any, { handle: () => of(token) }));
            const output = JSON.stringify(log.mock.calls);
            for (const secret of [token, 'private-pass', '012345']) expect(output).not.toContain(secret);
        } finally { log.mockRestore(); context.mockRestore(); }
    });
});

describe('Password recovery GraphQL contract', () => {
    let app: INestApplication, schema: GraphQLSchema;
    const service = { requestPasswordReset: jest.fn(async () => true),
        verifyPasswordResetCode: jest.fn(async () => 'b'.repeat(64)), resetPassword: jest.fn(async () => true) };
    const run = (source: string, input: Record<string, unknown>) => graphql({ schema, source, variableValues: { input },
        contextValue: { req: { ip: '127.0.0.1', headers: {}, body: {} } } });
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
            providers: [MemberResolver, { provide: MemberService, useValue: service }, { provide: AuthService, useValue: {} }],
        }).compile();
        app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe()); await app.init();
        schema = app.get(GraphQLSchemaHost).schema;
    });
    beforeEach(() => jest.clearAllMocks());
    afterAll(async () => { await app?.close(); });
    it.each([
        ['requestPasswordReset', 'PasswordResetRequestInput', { memberNick: 'PlayerOne', memberEmail: 'owner@example.test' }, true],
        ['verifyPasswordResetCode', 'PasswordResetVerifyInput', { memberNick: 'PlayerOne', code: '012345' }, 'b'.repeat(64)],
        ['resetPassword', 'PasswordResetInput', { resetToken: 'b'.repeat(64), memberPassword: 'newpass123' }, true],
    ])('exposes public %s through the existing Member resolver', async (operation, type, input, expected) => {
        const result = await run(`mutation($input: ${type}!) { ${operation}(input: $input) }`, input as Record<string, unknown>);
        expect(result.errors).toBeUndefined();
        expect(result.data[operation as string]).toBe(expected);
        expect(service[operation as string]).toHaveBeenCalledWith(input, '127.0.0.1');
    });
    it('rejects client member/role overrides before entering the service', async () => {
        const result = await run('mutation($input: PasswordResetInput!) { resetPassword(input: $input) }',
            { resetToken: 'b'.repeat(64), memberPassword: 'newpass123', memberId: 'other', memberType: 'ADMIN' });
        expect(result.errors).toHaveLength(2);
        expect(service.resetPassword).not.toHaveBeenCalled();
    });
});
