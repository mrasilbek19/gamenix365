import { INestApplication, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApolloDriver } from '@nestjs/apollo';
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync } from 'crypto';
import { Types } from 'mongoose';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { AuthMember } from './decorators/authMember.decorator';
import { MemberService } from '../member/member.service';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Message } from '../../libs/enums/common.enum';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum', () =>
    jest.requireActual('../../libs/enums/common.enum'), { virtual: true });

@Resolver()
class JwtAuthTestResolver {
    @UseGuards(AuthGuard)
    @Query(() => String)
    public protectedMember(@AuthMember('memberType') memberType: string): string {
        return memberType;
    }

    @Roles(MemberType.ADMIN)
    @UseGuards(RolesGuard)
    @Query(() => Boolean)
    public protectedAdmin(): boolean {
        return true;
    }
}

describe('Backend JWT configuration and GraphQL authentication', () => {
    const secret = 'jwt-auth-offline-test-secret';
    const audience = 'jwt-auth-test.apps.googleusercontent.com';
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKey = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const payload = { _id: new Types.ObjectId().toHexString(), memberNick: 'player', memberType: MemberType.USER };
    const signer = new JwtService({ secret });
    let app: INestApplication;
    let auth: AuthService;
    let server: ApolloDriver['instance'];
    let previousSecret: string | undefined;
    let previousAudience: string | undefined;

    const execute = async (token: string, query = '{ protectedMember }') => {
        const response = await server.executeOperation({ query }, {
            contextValue: { req: { headers: { authorization: `Bearer ${token}` }, body: {} } },
        });
        if (response.body.kind !== 'single') throw new Error('Expected a single GraphQL result');
        return response.body.singleResult;
    };
    const googleToken = () => signer.sign({
        iss: 'https://accounts.google.com', aud: audience, sub: 'google-jwt-test-subject',
        email: 'player@example.test', email_verified: true,
    }, { secret: privateKey, algorithm: 'RS256', expiresIn: '1h' });

    beforeAll(async () => {
        previousSecret = process.env.SECRET_TOKEN;
        previousAudience = process.env.GOOGLE_CLIENT_ID;
        process.env.SECRET_TOKEN = secret;
        process.env.GOOGLE_CLIENT_ID = audience;
        const module = await Test.createTestingModule({
            imports: [AuthModule, GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
            providers: [JwtAuthTestResolver],
        }).compile();
        app = module.createNestApplication();
        await app.init();
        auth = app.get(AuthService);
        server = app.get(GraphQLModule<ApolloDriver>).graphQlAdapter.instance;
        jest.spyOn((auth as any).googleClient, 'getFederatedSignonCertsAsync').mockResolvedValue({
            certs: { 'jwt-test-key': rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, format: 'PEM',
        });
    });

    afterAll(async () => {
        await app?.close();
        if (previousSecret === undefined) delete process.env.SECRET_TOKEN;
        else process.env.SECRET_TOKEN = previousSecret;
        if (previousAudience === undefined) delete process.env.GOOGLE_CLIENT_ID;
        else process.env.GOOGLE_CLIENT_ID = previousAudience;
    });

    it.each([MemberType.USER, MemberType.SHOP, MemberType.ADMIN])('password login issues an HS256 JWT accepted by AuthGuard for %s', async (memberType) => {
        const member = { ...payload, memberType, memberStatus: MemberStatus.ACTIVE,
            memberPassword: await auth.hashPassword('password123') };
        const members = { findOne: jest.fn(() => ({ select: jest.fn().mockReturnThis(), exec: async () => ({ ...member }) })) };
        const service = new MemberService(members as any, {} as any, auth, {} as any, {} as any, {} as any, {} as any);
        const result = await service.login({ memberNick: member.memberNick, memberPassword: 'password123' });
        expect((signer.decode(result.accessToken, { complete: true }) as any).header.alg).toBe('HS256');
        const verified = await auth.verifyToken(result.accessToken);
        expect(verified.memberType).toBe(memberType);
        expect(verified).not.toHaveProperty('memberPassword');
        expect(await execute(result.accessToken)).toMatchObject({ data: { protectedMember: memberType } });
    });

    it('exchanges an officially verified Google RS256 credential for a backend HS256 JWT', async () => {
        const credential = signer.sign({ iss: 'https://accounts.google.com', aud: audience,
            sub: 'google-jwt-test-subject', email: 'player@example.test', email_verified: true },
            { secret: privateKey, algorithm: 'RS256', keyid: 'jwt-test-key', expiresIn: '1h' });
        const members = {
            findOne: jest.fn(() => ({ exec: async () => null })), exists: jest.fn(async () => null),
            create: jest.fn(async (input) => ({ ...payload, ...input })),
        };
        const service = new MemberService(members as any, {} as any, auth, {} as any, {} as any, {} as any, {} as any);
        const result = await service.loginAndSignupWithGoogle(credential);
        expect(result.accessToken).not.toBe(credential);
        expect((signer.decode(result.accessToken, { complete: true }) as any).header.alg).toBe('HS256');
        expect(await execute(result.accessToken)).toMatchObject({ data: { protectedMember: MemberType.USER } });
        expect((await execute(credential)).errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    const invalidTokens = [
        ['HS384', () => signer.sign(payload, { algorithm: 'HS384' })],
        ['HS512', () => signer.sign(payload, { algorithm: 'HS512' })],
        ['Google-style RS256', googleToken],
        ['unsigned', () => signer.sign(payload, { algorithm: 'none' })],
        ['invalid signature', () => signer.sign(payload, { secret: 'different-test-secret' })],
        ['expired', () => signer.sign(payload, { expiresIn: -1 })],
        ['not yet valid', () => signer.sign(payload, { notBefore: '1h' })],
        ['malformed', () => 'invalid-token'],
        ['old browser fixture with no algorithm', () => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`],
    ] as const;

    it.each(invalidTokens)('rejects %s as an authentication error without exposing JWT details', async (_, createToken) => {
        const token = createToken();
        await expect(auth.verifyToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
        const result = await execute(token);
        expect(result.errors?.[0]).toMatchObject({ message: Message.NOT_AUTHENTICATED, extensions: { code: 'UNAUTHENTICATED' } });
        expect(result.data).toBeNull();
    });

    it.each([MemberType.USER, MemberType.SHOP, MemberType.ADMIN])('preserves ADMIN role restrictions for %s', async (memberType) => {
        const token = await auth.createToken({ ...payload, memberType } as any);
        const result = await execute(token, '{ protectedAdmin }');
        if (memberType === MemberType.ADMIN) expect(result).toMatchObject({ data: { protectedAdmin: true } });
        else expect(result.errors?.[0].extensions.code).toBe('FORBIDDEN');
    });

    it('returns an authentication error for invalid tokens on role-protected operations', async () => {
        expect((await execute('invalid-token', '{ protectedAdmin }')).errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
    });
});
