import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ApolloDriver } from '@nestjs/apollo';
import { GqlExecutionContext, GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
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
    it('uses the copied SMTP mail implementation and escapes reset content without sending mail', async () => {
        const sendMail = jest.fn().mockResolvedValue({});
        const transport = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as any);
        try {
            await new MailService().sendPasswordResetCode('owner@example.test', '<img>&"', '012345', 3);
            expect(sendMail).toHaveBeenCalledTimes(1);
            const [message] = sendMail.mock.calls[0];
            expect(message.to).toBe('owner@example.test');
            expect(message.html).toContain('&lt;img&gt;&amp;&quot;');
            expect(message.html).not.toContain('<img>');
            expect(message.html).toContain('012345');
            expect(message.html).toContain('3 minutes');
            expect(message.subject).toContain('Password reset code');
        } finally { transport.mockRestore(); }
    });
    it('returns the same response for an unknown account without sending mail', async () => {
        const query = { select: () => query, exec: async () => null };
        const mail = { sendPasswordResetCode: jest.fn() };
        const service = new MemberService({ findOne: () => query } as any, {} as any, {} as any,
            {} as any, {} as any, {} as any, mail as any);
        expect(await service.requestPasswordReset({ memberNick: 'missing', memberEmail: 'missing@example.test' })).toBe(true);
        expect(mail.sendPasswordResetCode).not.toHaveBeenCalled();
    });

    it('uses exact-case username and matching optional email without requiring a separate verification feature', async () => {
        const member = { _id: 'member', memberNick: 'PlayerOne', memberEmail: 'owner@example.test', memberEmailVerified: false, memberPassword: 'stored-bcrypt-hash' };
        const query = { select: jest.fn().mockReturnThis(), exec: async () => member };
        const members = { findOne: jest.fn(() => query) };
        const resets = { deleteMany: jest.fn(() => ({ exec: async () => ({}) })), create: jest.fn(async (input) => input) };
        const mail = { sendPasswordResetCode: jest.fn().mockResolvedValue(undefined) };
        const service = new MemberService(members as any, {} as any, { hashPassword: async (code) => `hashed:${code}` } as any,
            {} as any, {} as any, resets as any, mail as any);
        expect(await service.requestPasswordReset({ memberNick: 'PlayerOne', memberEmail: ' Owner@Example.test ' })).toBe(true);
        expect(members.findOne).toHaveBeenCalledWith(expect.objectContaining({ memberNick: 'PlayerOne' }));
        expect(resets.create).toHaveBeenCalledWith(expect.objectContaining({ memberId: 'member', codeHash: expect.stringMatching(/^hashed:\d{6}$/), expiresAt: expect.any(Date) }));
        expect(mail.sendPasswordResetCode).toHaveBeenCalledWith('owner@example.test', 'PlayerOne', expect.stringMatching(/^\d{6}$/), 3);
        await service.requestPasswordReset({ memberNick: 'PlayerOne', memberEmail: 'other@example.test' });
        expect(mail.sendPasswordResetCode).toHaveBeenCalledTimes(1);
    });

    it('keeps the public reset response unchanged when SMTP fails and invalidates that code', async () => {
        const member = { _id: 'member', memberNick: 'PlayerOne', memberEmail: 'owner@example.test', memberPassword: 'stored-bcrypt-hash' };
        const query = { select: jest.fn().mockReturnThis(), exec: async () => member };
        const resets = { deleteMany: jest.fn(() => ({ exec: async () => ({}) })),
            create: jest.fn(async () => ({ _id: 'reset-id' })), deleteOne: jest.fn(() => ({ exec: async () => ({}) })) };
        const service = new MemberService({ findOne: () => query } as any, {} as any, { hashPassword: async () => 'hashed-code' } as any,
            {} as any, {} as any, resets as any, { sendPasswordResetCode: async () => { throw new Error('provider-secret'); } } as any);
        expect(await service.requestPasswordReset({ memberNick: 'PlayerOne', memberEmail: 'owner@example.test' })).toBe(true);
        expect(resets.deleteOne).toHaveBeenCalledWith({ _id: 'reset-id' });
    });

    it('claims a token atomically before updating the password so repeated uses fail', async () => {
        let consumed = false;
        const resets = { findOneAndUpdate: jest.fn((search, update) => ({ select: jest.fn().mockReturnThis(), exec: async () => {
            expect(search).toMatchObject({ consumedAt: null, expiresAt: { $gt: expect.any(Date) } });
            expect(update.consumedAt).toBeInstanceOf(Date);
            if (consumed) return null;
            consumed = true;
            return { memberId: 'member', emailSnapshot: 'owner@example.test', passwordSnapshot: 'stored-bcrypt-hash' };
        } })) };
        const members = { updateOne: jest.fn(() => ({ exec: async () => ({ matchedCount: 1 }) })) };
        const service = new MemberService(members as any, {} as any, { hashPassword: async () => 'hashed-password' } as any,
            {} as any, {} as any, resets as any, {} as any);
        const input = { resetToken: token, memberPassword: 'newpass123' };
        expect(await service.resetPassword(input)).toBe(true);
        await expect(service.resetPassword(input)).rejects.toThrow('reset session has expired');
        expect(members.updateOne).toHaveBeenCalledTimes(1);
        expect(members.updateOne).toHaveBeenCalledWith(expect.objectContaining({
            memberEmail: 'owner@example.test', memberPassword: 'stored-bcrypt-hash',
        }), { memberPassword: 'hashed-password' });
        expect(resets.findOneAndUpdate.mock.calls[0][0].resetTokenHash).not.toBe(token);
    });
    it.each([false, true])('invalidates old reset rows on email and password updates, admin = %s', async (admin) => {
        const member = { _id: 'member' };
        const query = { exec: async () => member };
        const members = { findOneAndUpdate: jest.fn(() => query) };
        const resets = { deleteMany: jest.fn(() => ({ exec: async () => ({}) })) };
        const service = new MemberService(members as any, {} as any,
            { hashPassword: async () => 'hashed-password', createToken: async () => 'jwt' } as any,
            {} as any, {} as any, resets as any, {} as any);
        for (const input of [{ memberEmail: 'new@example.test' }, { memberPassword: 'newpass123' }]) {
            if (admin) await service.updateMemberByAdmin({ _id: 'member', ...input } as any);
            else await service.updateMember('member' as any, input as any);
        }
        expect(resets.deleteMany).toHaveBeenCalledTimes(2);
        expect(resets.deleteMany).toHaveBeenCalledWith({ memberId: 'member', consumedAt: null });
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
        expect(service[operation as string]).toHaveBeenCalledWith(input);
    });
    it('rejects client member/role overrides before entering the service', async () => {
        const result = await run('mutation($input: PasswordResetInput!) { resetPassword(input: $input) }',
            { resetToken: 'b'.repeat(64), memberPassword: 'newpass123', memberId: 'other', memberType: 'ADMIN' });
        expect(result.errors).toHaveLength(2);
        expect(service.resetPassword).not.toHaveBeenCalled();
    });
});
