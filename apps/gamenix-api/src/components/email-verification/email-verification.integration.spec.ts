import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { Connection, createConnection, Model, Types } from 'mongoose';
import { AuthToken } from '../../libs/dto/auth/auth-token';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import AuthTokenSchema from '../../schemas/AuthToken.model';
import MemberSchema from '../../schemas/Member.model';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { MemberService } from '../member/member.service';
import { EmailVerificationService } from './email-verification.service';

// Explicitly opt in. The URI's database is overridden by a fresh test-only database.
const testUri = process.env.EMAIL_VERIFICATION_TEST_MONGO_URI;
const describeMongo = testUri ? describe : describe.skip;

describeMongo('Email verification MongoDB transactions', () => {
    let connection: Connection;
    let members: Model<Member>;
    let tokens: Model<AuthToken>;
    let service: EmailVerificationService;
    let memberService: MemberService;
    let mail: MailService;
    let ownerId: Types.ObjectId;
    let passwordHash: string;
    const databaseName = `gx_email_test_${randomBytes(8).toString('hex')}`;
    const values = { NODE_ENV: 'test', MAIL_TRANSPORT: 'capture', FRONTEND_ORIGIN: 'https://frontend.example.test' };
    const config = { get: (key: string) => values[key] } as ConfigService;
    const auth = new AuthService(new JwtService({ secret: 'email-verification-integration-test-secret' }));
    const rawToken = () => mail.getCapturedMessages().at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
    const privateMember = () => members.findById(ownerId).select('+memberEmail +memberEmailVerified +memberEmailVersion +emailVerificationRequests').lean().exec();

    beforeAll(async () => {
        connection = await createConnection(testUri, {
            dbName: databaseName,
            serverSelectionTimeoutMS: 5000,
        }).asPromise();
        members = connection.model<Member>('Member', MemberSchema);
        tokens = connection.model<AuthToken>('AuthToken', AuthTokenSchema);
        await Promise.all([members.init(), tokens.init()]);
        passwordHash = await auth.hashPassword('secret123');
    }, 20000);

    beforeEach(async () => {
        await Promise.all([members.deleteMany({}).exec(), tokens.deleteMany({}).exec()]);
        const owner = await members.create({ memberNick: 'owner123', memberPhone: '01012345678', memberPassword: passwordHash,
            memberType: MemberType.SHOP, memberStatus: MemberStatus.ACTIVE, shopName: 'Owner Store', memberEmail: 'owner@example.test' });
        ownerId = owner._id as any;
        mail = new MailService(config);
        service = new EmailVerificationService(members, tokens, connection, mail, config);
        memberService = new MemberService(members, {} as any, auth, {} as any, {} as any, tokens, mail);
        await service.onModuleInit();
    });

    afterEach(() => { mail?.onModuleDestroy(); jest.restoreAllMocks(); });
    afterAll(async () => {
        if (!connection) return;
        try {
            if (connection.name !== databaseName || !connection.name.startsWith('gx_email_test_')) throw new Error('Refusing to drop a non-test database');
            await connection.dropDatabase();
        } finally { await connection.close(); }
    });

    it('saves only a token hash, verifies once, and preserves credentials', async () => {
        expect(await service.requestEmailVerification(ownerId as any, '127.0.0.1')).toBe(true);
        const raw = rawToken();
        const grant = await tokens.findOne({}).lean().exec();
        expect(grant.tokenHash).toBe(createHash('sha256').update(raw).digest('hex'));
        expect(JSON.stringify(grant)).not.toContain(raw);
        expect((await privateMember()).memberEmailVerified).toBe(false);
        expect(await service.verifyEmail(raw, '127.0.0.1')).toBe(true);
        expect((await privateMember()).memberEmailVerified).toBe(true);
        expect((await tokens.findOne({}).lean().exec()).consumedAt).toBeInstanceOf(Date);
        await expect(service.verifyEmail(raw, '127.0.0.1')).rejects.toThrow('Invalid or expired');
        expect((await memberService.login({ memberNick: 'owner123', memberPassword: 'secret123' })).memberNick).toBe('owner123');
        expect((await members.findById(ownerId).lean().exec()).memberEmail).toBeUndefined();
    });

    it('rejects an expired token independently of TTL cleanup', async () => {
        await service.requestEmailVerification(ownerId as any);
        const raw = rawToken();
        await tokens.updateOne({}, { expiresAt: new Date(Date.now() - 1000) }).exec();
        await expect(service.verifyEmail(raw)).rejects.toThrow('Invalid or expired');
        expect((await privateMember()).memberEmailVerified).toBe(false);
    });

    it('rejects a token for a different purpose', async () => {
        await service.requestEmailVerification(ownerId as any);
        const raw = rawToken();
        await tokens.collection.updateOne({}, { $set: { purpose: 'OTHER_PURPOSE' } });
        await expect(service.verifyEmail(raw)).rejects.toThrow('Invalid or expired');
        expect((await privateMember()).memberEmailVerified).toBe(false);
    });

    it.each([false, true])('invalidates grants across email changes and address restoration, admin=%s', async (admin) => {
        await service.requestEmailVerification(ownerId as any);
        const old = rawToken();
        const changeEmail = (memberEmail: string) => admin
            ? memberService.updateMemberByAdmin({ _id: ownerId as any, memberEmail })
            : memberService.updateMember(ownerId as any, { _id: ownerId as any, memberEmail });
        await changeEmail('new@example.test');
        await expect(service.verifyEmail(old)).rejects.toThrow('Invalid or expired');
        await changeEmail('owner@example.test');
        await expect(service.verifyEmail(old)).rejects.toThrow('Invalid or expired');
        expect((await privateMember()).memberEmailVersion).toBe(2);
        await members.updateOne({ _id: ownerId }, { emailVerificationRequestedAt: new Date(Date.now() - 61000) }).exec();
        await service.requestEmailVerification(ownerId as any);
        expect(await service.verifyEmail(rawToken())).toBe(true);
    });

    it('invalidates a grant on explicit email resubmission or clearing', async () => {
        await service.requestEmailVerification(ownerId as any);
        const raw = rawToken();
        await memberService.updateMember(ownerId as any, { _id: ownerId as any, memberEmail: 'owner@example.test' });
        await expect(service.verifyEmail(raw)).rejects.toThrow('Invalid or expired');
        await memberService.updateMemberByAdmin({ _id: ownerId as any, memberEmail: null });
        await expect(service.requestEmailVerification(ownerId as any)).rejects.toThrow('Add an email address');
    });

    it('enforces cooldown and consumes previous grants on resend', async () => {
        await service.requestEmailVerification(ownerId as any);
        const old = rawToken();
        await expect(service.requestEmailVerification(ownerId as any)).rejects.toThrow('Wait 60 seconds');
        expect(await tokens.countDocuments()).toBe(1);
        await members.updateOne({ _id: ownerId }, { emailVerificationRequestedAt: new Date(Date.now() - 61000) }).exec();
        await service.requestEmailVerification(ownerId as any);
        await expect(service.verifyEmail(old)).rejects.toThrow('Invalid or expired');
        expect(await service.verifyEmail(rawToken())).toBe(true);
    });

    it('enforces the persistent hourly account limit', async () => {
        for (let index = 0; index < 5; index++) {
            await service.requestEmailVerification(ownerId as any);
            await members.updateOne({ _id: ownerId }, { emailVerificationRequestedAt: new Date(Date.now() - 61000) }).exec();
        }
        await expect(service.requestEmailVerification(ownerId as any)).rejects.toThrow('limit reached');
        expect((await privateMember()).emailVerificationRequests).toBe(5);
    });

    it('keeps legacy missing-email accounts usable without creating verification grants', async () => {
        await members.updateOne({ _id: ownerId }, { $unset: { memberEmail: 1 } }).exec();
        await expect(service.requestEmailVerification(ownerId as any)).rejects.toThrow('Add an email address');
        expect(await tokens.countDocuments()).toBe(0);
        await expect(memberService.login({ memberNick: 'owner123', memberPassword: 'secret123' })).resolves.toBeDefined();
    });

    it('verifies a pending SHOP without approving it', async () => {
        await members.updateOne({ _id: ownerId }, { memberStatus: MemberStatus.PENDING }).exec();
        await service.requestEmailVerification(ownerId as any);
        await service.verifyEmail(rawToken());
        expect(await privateMember()).toMatchObject({ memberEmailVerified: true, memberType: MemberType.SHOP, memberStatus: MemberStatus.PENDING });
    });

    it.each([MemberStatus.BLOCK, MemberStatus.DELETE])('rejects requests for a current %s account', async (memberStatus) => {
        await members.updateOne({ _id: ownerId }, { memberStatus }).exec();
        await expect(service.requestEmailVerification(ownerId as any)).rejects.toThrow('eligible account');
        expect(mail.getCapturedMessages()).toHaveLength(0);
    });

    it('allows exactly one concurrent verification to consume the token', async () => {
        await service.requestEmailVerification(ownerId as any);
        const raw = rawToken();
        const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.verifyEmail(raw)));
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect((await privateMember()).memberEmailVerified).toBe(true);
    });

    it('serializes concurrent requests so only one email is issued', async () => {
        const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.requestEmailVerification(ownerId as any)));
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(await tokens.countDocuments()).toBe(1);
        expect(mail.getCapturedMessages()).toHaveLength(1);
    });

    it('rolls token consumption back if the member write fails', async () => {
        await service.requestEmailVerification(ownerId as any);
        jest.spyOn(members, 'updateOne').mockImplementationOnce(() => { throw new Error('Simulated member failure'); });
        await expect(service.verifyEmail(rawToken())).rejects.toThrow('Simulated member failure');
        expect((await tokens.findOne({}).lean().exec()).consumedAt).toBeNull();
        expect((await privateMember()).memberEmailVerified).toBe(false);
    });

    it('invalidates a grant after delivery failure without verifying the member', async () => {
        jest.spyOn(mail, 'sendEmailVerification').mockRejectedValueOnce(new Error('Simulated delivery failure'));
        await expect(service.requestEmailVerification(ownerId as any)).rejects.toThrow('could not be sent');
        expect((await tokens.findOne({}).lean().exec()).consumedAt).toBeInstanceOf(Date);
        expect((await privateMember()).memberEmailVerified).toBe(false);
    });

    it('does not resend for an already verified address', async () => {
        await members.updateOne({ _id: ownerId }, { memberEmailVerified: true }).exec();
        expect(await service.requestEmailVerification(ownerId as any)).toBe(true);
        expect(mail.getCapturedMessages()).toHaveLength(0);
        expect(await tokens.countDocuments()).toBe(0);
    });

    it('enforces the actual unique token-hash and TTL indexes', async () => {
        await service.requestEmailVerification(ownerId as any);
        const grant = await tokens.findOne({}).lean().exec();
        delete (grant as any)._id;
        await expect(tokens.create(grant)).rejects.toMatchObject({ code: 11000 });
        expect(await tokens.collection.indexes()).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: { tokenHash: 1 }, unique: true }),
            expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
        ]));
    });
});
