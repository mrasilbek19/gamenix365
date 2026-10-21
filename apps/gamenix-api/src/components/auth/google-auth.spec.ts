import { generateKeyPairSync, createSign } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { model, Types } from 'mongoose';
import { AuthService } from './auth.service';
import { MemberService } from '../member/member.service';
import { MemberResolver } from '../member/member.resolver';
import MemberSchema from '../../schemas/Member.model';
import { MemberAuthType, MemberStatus, MemberType } from '../../libs/enums/member.enum';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum', () =>
	jest.requireActual('../../libs/enums/common.enum'), { virtual: true });

const audience = 'gamenix-test.apps.googleusercontent.com';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const claims = () => ({ iss: 'https://accounts.google.com', aud: audience, sub: 'google-subject-123', email: 'player@gmail.com', email_verified: true, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
const sign = (payload: any, key = keys.privateKey) => {
	const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const signature = createSign('RSA-SHA256').update(`${header}.${body}`).sign(key).toString('base64url');
	return `${header}.${body}.${signature}`;
};

describe('Google identity verification and Gamenix accounts', () => {
	let auth: AuthService;
	let previous: string | undefined;
	beforeEach(() => {
		previous = process.env.GOOGLE_CLIENT_ID;
		process.env.GOOGLE_CLIENT_ID = audience;
		auth = new AuthService(new JwtService({ secret: 'offline-google-test-secret' }));
		jest.spyOn((auth as any).googleClient, 'getFederatedSignonCertsAsync').mockResolvedValue({
			certs: { 'test-key': keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, format: 'PEM',
		});
	});
	afterEach(() => {
		if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
		else process.env.GOOGLE_CLIENT_ID = previous;
	});
	it('verifies an actual RSA signature with the official library using offline certificate fixtures', async () => {
		expect((await auth.verifyGoogleToken(sign(claims()))).sub).toBe('google-subject-123');
	});
	it.each([
		['wrong audience', { aud: 'other.apps.googleusercontent.com' }],
		['wrong issuer', { iss: 'https://attacker.test' }],
		['expired', { exp: Math.floor(Date.now() / 1000) - 1 }],
		['future issued', { iat: Math.floor(Date.now() / 1000) + 10000 }],
		['unverified email', { email_verified: false }],
		['nonboolean email verification', { email_verified: 'false' }],
		['missing subject', { sub: '' }],
		['missing email', { email: '' }],
	])('rejects %s', async (_, patch) => {
		await expect(auth.verifyGoogleToken(sign({ ...claims(), ...patch }))).rejects.toThrow('Invalid or expired Google credential.');
	});
	it('rejects forged signatures and malformed tokens', async () => {
		await expect(auth.verifyGoogleToken(sign(claims(), other.privateKey))).rejects.toThrow('Invalid or expired');
		await expect(auth.verifyGoogleToken('forged-token')).rejects.toThrow('Invalid or expired');
	});
	it('fails closed without an audience even if a signed token exists', async () => {
		delete process.env.GOOGLE_CLIENT_ID;
		await expect(auth.verifyGoogleToken(sign(claims()))).rejects.toThrow('not configured');
	});
	const query = (result: any) => ({ exec: async () => result, select: function () { return this; } });
	function setup(existing: any = null) {
		const members = {
			findOne: jest.fn(() => query(existing)), exists: jest.fn(async () => null),
			create: jest.fn(async (input) => ({ _id: new Types.ObjectId(), ...input })),
		};
		const service = new MemberService(members as any, {} as any, auth, {} as any, {} as any, {} as any, {} as any);
		return { service, members };
	}
	it('creates USER/ACTIVE using stable subject, with no fake password or phone and private JWT fields excluded', async () => {
		const { service, members } = setup();
		const result = await service.loginAndSignupWithGoogle(sign(claims()));
		const input = members.create.mock.calls[0][0];
		expect(input).toMatchObject({ googleSubject: claims().sub, memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE, memberAuthType: MemberAuthType.GOOGLE });
		expect(input.memberNick).toMatch(/^g[a-f0-9]{10}$/);
		expect(input).not.toHaveProperty('memberPassword');
		expect(input).not.toHaveProperty('memberPhone');
		const jwt = await auth.verifyToken(result.accessToken);
		expect(jwt).not.toHaveProperty('googleSubject');
		expect(jwt).not.toHaveProperty('memberEmail');
		expect(jwt).not.toHaveProperty('memberPassword');
		expect(new MemberResolver(service).memberPhone(result)).toBe('');
	});
	it('finds returning identity by sub even when its Google email changes', async () => {
		const existing = { _id: new Types.ObjectId(), memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE, memberEmail: 'original@gmail.com' };
		const { service, members } = setup(existing);
		const result = await service.loginAndSignupWithGoogle(sign({ ...claims(), email: 'changed@gmail.com' }));
		expect(result._id).toBe(existing._id);
		expect(members.findOne).toHaveBeenCalledWith({ googleSubject: claims().sub });
		expect(members.create).not.toHaveBeenCalled();
		expect(result.memberEmail).toBe('original@gmail.com');
	});
	it('rejects existing local email rather than linking or changing its role', async () => {
		const { service, members } = setup();
		members.exists.mockResolvedValue({ _id: 'local-shop' } as any);
		await expect(service.loginAndSignupWithGoogle(sign(claims()))).rejects.toThrow('account linking is not enabled');
		expect(members.create).not.toHaveBeenCalled();
	});
	it.each([
		{ memberType: MemberType.SHOP, memberStatus: MemberStatus.PENDING },
		{ memberType: MemberType.ADMIN, memberStatus: MemberStatus.ACTIVE },
		{ memberType: MemberType.USER, memberStatus: MemberStatus.BLOCK },
		{ memberType: MemberType.USER, memberStatus: MemberStatus.DELETE },
		{ memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE, deletedAt: new Date() },
	])('rejects ineligible account %#', async (existing) => {
		const { service } = setup(existing);
		await expect(service.loginAndSignupWithGoogle(sign(claims()))).rejects.toThrow('cannot use Google sign-in');
	});
	it('never reads or creates accounts for an invalid credential', async () => {
		const { service, members } = setup();
		await expect(service.loginAndSignupWithGoogle(sign(claims(), other.privateKey))).rejects.toThrow();
		expect(members.findOne).not.toHaveBeenCalled();
		expect(members.create).not.toHaveBeenCalled();
	});
	it('recovers duplicate-subject races without issuing a second account', async () => {
		const { service, members } = setup();
		members.findOne.mockReturnValueOnce(query(null)).mockReturnValueOnce(query({ _id: new Types.ObjectId(), memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE }));
		members.create.mockRejectedValue({ code: 11000 });
		expect((await service.loginAndSignupWithGoogle(sign(claims()))).accessToken).toBeTruthy();
	});
	it('handles a competing local email registration without linking it', async () => {
		const { service, members } = setup();
		members.create.mockRejectedValue({ code: 11000 });
		await expect(service.loginAndSignupWithGoogle(sign(claims()))).rejects.toThrow('existing method');
	});
	it('does not attempt a password comparison for passwordless accounts', async () => {
		const { service } = setup({ memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE });
		const compare = jest.spyOn(auth, 'comparePassword');
		await expect(service.login({ memberNick: 'g1234567890', memberPassword: 'pass123' })).rejects.toThrow('Continue with Google');
		expect(compare).not.toHaveBeenCalled();
	});
	it('retains password/phone requirements for local accounts and unique private subject indexing', async () => {
		const MemberModel = model('GoogleSchemaOfflineTest', MemberSchema);
		const local = new MemberModel({ memberNick: 'local' });
		expect(local.validateSync().errors).toHaveProperty('memberPassword');
		expect(local.validateSync().errors).toHaveProperty('memberPhone');
		const google = new MemberModel({ memberNick: 'g1234567890', memberAuthType: MemberAuthType.GOOGLE, googleSubject: claims().sub });
		expect(google.validateSync()).toBeUndefined();
		expect(MemberSchema.path('googleSubject').options.select).toBe(false);
		expect(MemberSchema.indexes()).toContainEqual([{ googleSubject: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { googleSubject: { $type: 'string' } } })]);
	});
});
