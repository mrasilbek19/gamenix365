import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { Connection, createConnection, Model, Types } from 'mongoose';
import { AuthToken } from '../../libs/dto/auth/auth-token';
import { Member } from '../../libs/dto/member/member';
import { AuthTokenPurpose } from '../../libs/enums/auth-token.enum';
import MemberSchema from '../../schemas/Member.model';
import AuthTokenSchema from '../../schemas/AuthToken.model';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { MemberService } from './member.service';

const uri = process.env.PASSWORD_RESET_TEST_MONGO_URI;
const describeMongo = uri ? describe : describe.skip;

describeMongo('Copied password recovery with isolated MongoDB transactions', () => {
    const databaseName = `gx_reset_test_${randomBytes(8).toString('hex')}`;
    let connection: Connection, members: Model<Member>, tokens: Model<AuthToken>, mail: MailService, service: MemberService;
    let memberId: Types.ObjectId, originalHash: string;
    const auth = new AuthService(new JwtService({ secret: 'password-reset-integration-test' }));
    const input = { memberNick: 'PlayerOne', memberEmail: 'owner@example.test' };
    const code = () => mail.getCapturedMessages().at(-1).text.match(/code is: (\d{6})/)[1];
    const readMember = () => members.findById(memberId).select('+memberPassword +memberEmail +memberEmailVerified +passwordResetRequests').lean().exec();
    const request = () => service.requestPasswordReset(input, '127.0.0.1');
    const grant = async () => { await request(); return service.verifyPasswordResetCode({ memberNick: input.memberNick, code: code() }, '127.0.0.1'); };

    beforeAll(async () => {
        connection = await createConnection(uri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 }).asPromise();
        members = connection.model<Member>('Member', MemberSchema); tokens = connection.model<AuthToken>('AuthToken', AuthTokenSchema);
        await Promise.all([members.init(), tokens.init()]);
        originalHash = await auth.hashPassword('oldpass123');
    }, 20000);
    beforeEach(async () => {
        jest.restoreAllMocks(); await Promise.all([members.deleteMany({}), tokens.deleteMany({})]);
        const member = await members.create({ ...input, memberPhone: '01000000000', memberPassword: originalHash,
            memberEmailVerified: true, memberType: 'USER', memberStatus: 'ACTIVE' });
        memberId = member._id as any;
        mail = new MailService(new ConfigService({ NODE_ENV: 'test', MAIL_TRANSPORT: 'capture' }));
        service = new MemberService(members, {} as any, auth, {} as any, {} as any, tokens, mail);
    });
    afterEach(() => { mail?.onModuleDestroy(); jest.restoreAllMocks(); });
    afterAll(async () => {
        if (!connection) return;
        try {
            if (connection.name !== databaseName || !connection.name.startsWith('gx_reset_test_')) throw new Error('Refusing non-test cleanup');
            await connection.dropDatabase();
        } finally { await connection.close(); }
    });

    it('copies the three-step flow while storing only hashes and preserving username/role/status', async () => {
        await request();
        const rawCode = code();
        let stored = await tokens.findOne().select('+codeHash +passwordSnapshot').lean();
        expect(stored.codeHash).not.toBe(rawCode); expect(await auth.comparePassword(rawCode, stored.codeHash)).toBe(true);
        expect(stored.passwordSnapshot).toBe(createHash('sha256').update(originalHash).digest('hex'));
        const resetToken = await service.verifyPasswordResetCode({ memberNick: input.memberNick, code: rawCode });
        stored = await tokens.findOne().select('+codeHash').lean();
        expect(stored.tokenHash).toBe(createHash('sha256').update(resetToken).digest('hex'));
        expect(stored.purpose).toBe(AuthTokenPurpose.PASSWORD_RESET); expect(stored.codeHash).toBeUndefined();
        expect(JSON.stringify(stored)).not.toContain(resetToken);
        await expect(service.verifyPasswordResetCode({ memberNick: input.memberNick, code: rawCode })).rejects.toThrow('Invalid or expired');
        await service.resetPassword({ resetToken, memberPassword: 'newpass456' });
        const saved = await readMember();
        expect(saved).toMatchObject({ memberNick: 'PlayerOne', memberType: 'USER', memberStatus: 'ACTIVE', memberEmailVerified: true });
        expect(await auth.comparePassword('newpass456', saved.memberPassword)).toBe(true);
        await expect(service.login({ memberNick: input.memberNick, memberPassword: 'oldpass123' })).rejects.toThrow('Wrong password');
        expect((await service.login({ memberNick: input.memberNick, memberPassword: 'newpass456' })).accessToken).toBeTruthy();
        await expect(service.resetPassword({ resetToken, memberPassword: 'thirdpass' })).rejects.toThrow('Invalid or expired');
    });
    it.each(['missing account', 'missing email', 'wrong email', 'unverified email', 'blocked', 'deleted'])('returns true without email/code for %s', async (kind) => {
        if (kind === 'missing account') await members.deleteMany({});
        if (kind === 'missing email') await members.updateOne({ _id: memberId }, { $unset: { memberEmail: 1 } });
        if (kind === 'unverified email') await members.updateOne({ _id: memberId }, { $set: { memberEmailVerified: false } });
        if (kind === 'blocked' || kind === 'deleted') await members.updateOne({ _id: memberId }, { $set: { memberStatus: kind === 'blocked' ? 'BLOCK' : 'DELETE' } });
        expect(await service.requestPasswordReset({ ...input, memberEmail: kind === 'wrong email' ? 'wrong@example.test' : input.memberEmail })).toBe(true);
        expect(mail.getCapturedMessages()).toHaveLength(0); expect(await tokens.countDocuments()).toBe(0);
    });
    it('permits a verified pending SHOP to recover without approving the shop', async () => {
        await members.updateOne({ _id: memberId }, { $set: { memberType: 'SHOP', memberStatus: 'PENDING', shopName: 'Test Shop' } });
        const resetToken = await grant(); await service.resetPassword({ resetToken, memberPassword: 'newpass123' });
        expect(await readMember()).toMatchObject({ memberType: 'SHOP', memberStatus: 'PENDING', shopName: 'Test Shop' });
    });
    it('limits concurrent resends to one email and one usable code', async () => {
        await Promise.all(Array.from({ length: 5 }, request));
        expect(mail.getCapturedMessages()).toHaveLength(1);
        expect(await tokens.countDocuments({ consumedAt: null })).toBe(1);
        expect((await readMember()).passwordResetRequests).toBe(1);
    });
    it('caps wrong concurrent guesses at five and does not lock the member account', async () => {
        await request(); const wrong = code() === '000000' ? '000001' : '000000';
        const outcomes = await Promise.allSettled(Array.from({ length: 10 }, () => service.verifyPasswordResetCode({ memberNick: input.memberNick, code: wrong })));
        expect(outcomes.every((result) => result.status === 'rejected')).toBe(true);
        expect(await tokens.findOne().lean()).toMatchObject({ attempts: 5 });
        await expect(service.verifyPasswordResetCode({ memberNick: input.memberNick, code: code() })).rejects.toThrow('Invalid or expired');
        expect((await readMember()).memberStatus).toBe('ACTIVE');
    });
    it('allows a correct code to mint only one token under concurrency', async () => {
        await request(); const raw = code();
        const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.verifyPasswordResetCode({ memberNick: input.memberNick, code: raw })));
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    });
    it('accepts a reset token once under simultaneous password updates', async () => {
        const resetToken = await grant();
        const results = await Promise.allSettled(['firstpass1', 'secondpass2', 'thirdpass3'].map((memberPassword) => service.resetPassword({ resetToken, memberPassword })));
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(await tokens.findOne().lean()).toMatchObject({ consumedAt: expect.any(Date) });
    });
    it.each(['code', 'token'])('enforces %s expiry before MongoDB TTL cleanup', async (kind) => {
        let resetToken: string;
        if (kind === 'token') resetToken = await grant(); else await request();
        await tokens.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
        if (kind === 'token') await expect(service.resetPassword({ resetToken, memberPassword: 'newpass123' })).rejects.toThrow('Invalid or expired');
        else await expect(service.verifyPasswordResetCode({ memberNick: input.memberNick, code: code() })).rejects.toThrow('Invalid or expired');
        expect((await readMember()).memberPassword).toBe(originalHash);
    });
    it.each(['email', 'email version', 'password', 'status'])('invalidates issued recovery after an account %s change', async (kind) => {
        const resetToken = await grant();
        const update = kind === 'email' ? { memberEmail: 'new@example.test' } : kind === 'email version'
            ? { memberEmailVersion: 1 } : kind === 'password' ? { memberPassword: await auth.hashPassword('ownerpass') } : { memberStatus: 'BLOCK' };
        await members.updateOne({ _id: memberId }, { $set: update });
        await expect(service.resetPassword({ resetToken, memberPassword: 'newpass123' })).rejects.toThrow('Invalid or expired');
    });
    it('invalidates previous tokens on resend and enforces the five-per-hour account budget', async () => {
        const oldToken = await grant();
        for (let i = 1; i <= 5; i++) {
            await members.updateOne({ _id: memberId }, { $set: { passwordResetRequestedAt: new Date(Date.now() - 61000) } });
            await request();
        }
        expect(mail.getCapturedMessages()).toHaveLength(5);
        expect((await readMember()).passwordResetRequests).toBe(5);
        expect(await tokens.countDocuments({ consumedAt: null })).toBe(1);
        await expect(service.resetPassword({ resetToken: oldToken, memberPassword: 'newpass123' })).rejects.toThrow('Invalid or expired');
    });
    it('does not accept an email-verification token as password recovery', async () => {
        const resetToken = await grant();
        await tokens.updateOne({}, { $set: { purpose: AuthTokenPurpose.EMAIL_VERIFICATION } });
        await expect(service.resetPassword({ resetToken, memberPassword: 'newpass123' })).rejects.toThrow('Invalid or expired');
    });
    it('invalidates codes on SMTP failure without exposing account existence or changing the password', async () => {
        jest.spyOn(mail, 'sendPasswordResetCode').mockRejectedValue(new Error('Synthetic SMTP failure'));
        expect(await request()).toBe(true);
        expect(await tokens.countDocuments({ consumedAt: null })).toBe(0);
        expect((await readMember()).memberPassword).toBe(originalHash);
    });
    it('rolls back password and token consumption together after a database failure', async () => {
        const resetToken = await grant();
        jest.spyOn(tokens, 'updateMany').mockImplementationOnce(() => ({ exec: async () => { throw new Error('Synthetic database failure'); } } as any));
        await expect(service.resetPassword({ resetToken, memberPassword: 'newpass123' })).rejects.toThrow('Synthetic database failure');
        expect((await readMember()).memberPassword).toBe(originalHash);
        expect(await tokens.findOne().lean()).toMatchObject({ consumedAt: null });
        jest.restoreAllMocks(); await expect(service.resetPassword({ resetToken, memberPassword: 'newpass123' })).resolves.toBe(true);
    });
});
