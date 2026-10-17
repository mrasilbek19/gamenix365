import { INestApplication, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApolloDriver } from '@nestjs/apollo';
import { GraphQLModule, GraphQLSchemaHost, Query, Resolver } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { graphql, GraphQLInputObjectType, GraphQLObjectType, GraphQLSchema } from 'graphql';
import { model, Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { WithoutGuard } from '../auth/guards/without.guard';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { Product } from '../../libs/dto/product/product';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import MemberSchema from '../../schemas/Member.model';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum', () =>
    jest.requireActual('../../libs/enums/common.enum'), { virtual: true });

const ownerId = new Types.ObjectId();
const otherId = new Types.ObjectId();
const credentials = () => ({ memberNick: 'player', memberPhone: '01012345678', memberPassword: 'secret123' });
const duplicateEmail = { code: 11000, keyPattern: { memberEmail: 1 }, keyValue: { memberEmail: 'owner@example.com' } };

describe('Member email schema and DTOs', () => {
    const MemberModel = model('MemberEmailContractTest', MemberSchema);

    it('normalizes stored email and defaults verification to false', () => {
        const member = new MemberModel({ ...credentials(), memberEmail: '  Owner@EXAMPLE.com  ' });
        expect(member.validateSync()).toBeUndefined();
        expect(member.memberEmail).toBe('owner@example.com');
        expect(member.memberEmailVerified).toBe(false);
    });

    it.each([undefined, null])('keeps accounts with email %s valid', (memberEmail) => {
        const member = new MemberModel({ ...credentials(), memberEmail });
        expect(member.validateSync()).toBeUndefined();
        expect(member.memberEmailVerified).toBe(false);
    });

    it.each(['invalid', '', '   ', 'a@', 'a@b', 'a b@example.com'])('rejects invalid stored email %j', (memberEmail) => {
        expect(new MemberModel({ ...credentials(), memberEmail }).validateSync()?.errors.memberEmail).toBeDefined();
    });

    it('defines a unique string-only partial index and hides both fields by default', () => {
        expect(MemberSchema.indexes()).toContainEqual([
            { memberEmail: 1 },
            expect.objectContaining({ unique: true, partialFilterExpression: { memberEmail: { $type: 'string' } } }),
        ]);
        expect(MemberSchema.path('memberEmail').options.select).toBe(false);
        expect(MemberSchema.path('memberEmailVerified').options.select).toBe(false);
    });

    describe.each([MemberInput, MemberUpdate])('%p validation', (Dto) => {
        const input = () => ({ ...credentials(), _id: ownerId.toHexString() });

        it('accepts and normalizes an optional email', async () => {
            const dto = plainToInstance(Dto as typeof MemberInput, { ...input(), memberEmail: '  Owner@EXAMPLE.com  ' });
            expect(await validate(dto)).toEqual([]);
            expect(dto.memberEmail).toBe('owner@example.com');
        });

        it.each([undefined, null])('accepts an omitted or cleared email: %s', async (memberEmail) => {
            expect(await validate(plainToInstance(Dto as typeof MemberInput, { ...input(), memberEmail }))).toEqual([]);
        });

        it.each(['invalid', '', '   ', 123, {}, ['owner@example.com']])('rejects invalid email %j', async (memberEmail) => {
            const errors = await validate(plainToInstance(Dto as typeof MemberInput, { ...input(), memberEmail }));
            expect(errors.some((error) => error.property === 'memberEmail')).toBe(true);
        });
    });
});

describe('Member email service behavior', () => {
    const query = (result?: unknown, error?: unknown) => ({
        select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(),
        exec: jest.fn(async () => { if (error) throw error; return result; }),
    });
    let service: MemberService;
    let members: any;
    let auth: any;

    beforeEach(() => {
        members = {
            create: jest.fn(async (input) => ({ _id: ownerId, ...input })),
            findOneAndUpdate: jest.fn(() => query({ _id: ownerId })),
            findOne: jest.fn(() => query({ _id: ownerId, memberStatus: MemberStatus.ACTIVE, memberPassword: 'hash' })),
            aggregate: jest.fn(() => query([{ list: [], metaCounter: [] }])),
        };
        auth = { hashPassword: jest.fn(async () => 'hash'), createToken: jest.fn(async () => 'token'),
            comparePassword: jest.fn(async () => true) };
        service = new MemberService(members, {} as any, auth, {} as any, {} as any, {} as any, {} as any);
    });

    it.each([MemberType.USER, MemberType.SHOP])('keeps optional-email %s signup and shop approval behavior', async (memberType) => {
        await service.signup({ ...credentials(), memberType });
        const input = members.create.mock.calls[0][0];
        expect(input.memberEmail).toBeUndefined();
        expect(input.memberStatus).toBe(memberType === MemberType.SHOP ? MemberStatus.PENDING : undefined);
        expect(auth.hashPassword).toHaveBeenCalledWith('secret123');
    });

    it('normalizes new email and explicitly starts it unverified', async () => {
        const result = await service.signup({ ...credentials(), memberEmail: '  Owner@EXAMPLE.com  ' });
        expect(result.memberEmail).toBe('owner@example.com');
        expect(result.memberEmailVerified).toBe(false);
    });

    it.each([MemberType.USER, MemberType.SHOP, MemberType.ADMIN])('preserves nickname/password login for %s without email', async (memberType) => {
        members.findOne.mockReturnValue(query({ _id: ownerId, memberType, memberStatus: MemberStatus.ACTIVE, memberPassword: 'hash' }));
        expect((await service.login(credentials())).accessToken).toBe('token');
        expect(members.findOne).toHaveBeenCalledWith({ memberNick: 'player' });
    });

    it.each(['signup', 'updateMember', 'updateMemberByAdmin'])('rejects verification spoofing through %s', async (method) => {
        const input: any = { ...credentials(), _id: ownerId, memberEmailVerified: true };
        const work = method === 'signup' ? service.signup(input)
            : method === 'updateMember' ? service.updateMember(ownerId as any, input) : service.updateMemberByAdmin(input);
        await expect(work).rejects.toThrow('Not Allowed Request');
        expect(members.create).not.toHaveBeenCalled();
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each(['signup', 'updateMember', 'updateMemberByAdmin'])('validates raw service email through %s', async (method) => {
        const input: any = { ...credentials(), _id: ownerId, memberEmail: 'invalid' };
        const work = method === 'signup' ? service.signup(input)
            : method === 'updateMember' ? service.updateMember(ownerId as any, input) : service.updateMemberByAdmin(input);
        await expect(work).rejects.toThrow('Invalid member email');
        expect(members.create).not.toHaveBeenCalled();
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each(['signup', 'updateMember', 'updateMemberByAdmin'])('maps duplicate email to a safe error through %s', async (method) => {
        members.create.mockRejectedValue(duplicateEmail);
        members.findOneAndUpdate.mockReturnValue(query(undefined, duplicateEmail));
        const input: any = { ...credentials(), _id: ownerId, memberEmail: 'owner@example.com' };
        const work = method === 'signup' ? service.signup(input)
            : method === 'updateMember' ? service.updateMember(ownerId as any, input) : service.updateMemberByAdmin(input);
        await expect(work).rejects.toThrow('Already used member email');
    });

    it('preserves existing nickname/phone duplicate signup errors', async () => {
        members.create.mockRejectedValue({ code: 11000, keyPattern: { memberNick: 1 } });
        await expect(service.signup(credentials())).rejects.toThrow('Already used member nick or phone');
    });

    it.each([false, true])('updates email and verification together for admin=%s', async (admin) => {
        const input: any = { _id: ownerId, memberEmail: ' New@EXAMPLE.com ' };
        if (admin) await service.updateMemberByAdmin(input);
        else await service.updateMember(ownerId as any, input);
        expect(members.findOneAndUpdate).toHaveBeenCalledWith(
            admin ? { _id: ownerId } : { _id: ownerId, memberStatus: MemberStatus.ACTIVE },
            expect.objectContaining({ memberEmail: 'new@example.com', memberEmailVerified: false }),
            { new: true, runValidators: true },
        );
    });

    it('resets verification when explicitly clearing or resubmitting email', async () => {
        for (const memberEmail of [null, 'owner@example.com']) {
            await service.updateMember(ownerId as any, { _id: ownerId as any, memberEmail });
            expect(members.findOneAndUpdate.mock.calls.at(-1)[1]).toEqual({ _id: ownerId, memberEmail, memberEmailVerified: false, $inc: { memberEmailVersion: 1 } });
        }
    });

    it('leaves email and verification untouched when updating another field', async () => {
        await service.updateMember(ownerId as any, { _id: ownerId as any, memberDesc: 'New description' });
        const update = members.findOneAndUpdate.mock.calls[0][1];
        expect(update).not.toHaveProperty('memberEmail');
        expect(update).not.toHaveProperty('memberEmailVerified');
    });

    it('propagates other update errors without mislabelling them as duplicate email', async () => {
        members.findOneAndUpdate.mockReturnValue(query(undefined, new Error('Database unavailable')));
        await expect(service.updateMember(ownerId as any, { _id: ownerId as any })).rejects.toThrow('Database unavailable');
        await expect(service.updateMemberByAdmin({ _id: ownerId as any })).rejects.toThrow('Database unavailable');
    });

    it('reads private fields through an explicit backend projection', async () => {
        const result = query({ memberEmail: 'owner@example.com', memberEmailVerified: true });
        members.findOne.mockReturnValue(result);
        expect(await service.getMemberEmail(ownerId as any)).toEqual({ memberEmail: 'owner@example.com', memberEmailVerified: true });
        expect(result.select).toHaveBeenCalledWith('memberEmail memberEmailVerified');
    });

    it('excludes private fields from shop and admin list aggregation results', async () => {
        await service.getAgents(null, { page: 1, limit: 10, search: {} });
        await service.getAllMembersByAdmin({ page: 1, limit: 10, search: {} });
        for (const [pipeline] of members.aggregate.mock.calls) {
            expect(pipeline.find((stage) => stage.$facet).$facet.list)
                .toContainEqual({ $project: { memberEmail: 0, memberEmailVerified: 0 } });
        }
    });
});

@Resolver()
class NestedMemberEmailTestResolver {
    @UseGuards(WithoutGuard)
    @Query(() => Product)
    public emailPrivacyProduct(): any {
        // Simulates a raw $lookup result, which bypasses Mongoose select:false.
        return { memberData: { _id: ownerId, memberEmail: 'private@example.com', memberEmailVerified: true } };
    }
}

describe('Member email GraphQL privacy and contracts', () => {
    let app: INestApplication;
    let schema: GraphQLSchema;
    let auth: AuthService;
    const member = { _id: ownerId, memberEmail: 'private@example.com', memberEmailVerified: true };
    const service = {
        getMember: jest.fn(async () => member),
        getAgents: jest.fn(async () => ({ list: [member], metaCounter: [] })),
        getMemberEmail: jest.fn(async () => ({ memberEmail: 'owner@example.com', memberEmailVerified: true })),
        signup: jest.fn(async () => member), login: jest.fn(async () => member), updateMember: jest.fn(async () => member),
    };
    const execute = async (source: string, variables?: Record<string, unknown>, memberId?: Types.ObjectId) => {
        const token = memberId ? await auth.createToken({ _id: memberId, memberType: MemberType.USER } as any) : null;
        return await graphql({ schema, source, variableValues: variables,
            contextValue: { req: { headers: token ? { authorization: `Bearer ${token}` } : {}, body: {} } } });
    };

    beforeAll(async () => {
        auth = new AuthService(new JwtService({ secret: 'member-email-test-secret' }));
        const module = await Test.createTestingModule({
            imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
            providers: [MemberResolver, NestedMemberEmailTestResolver,
                { provide: MemberService, useValue: service }, { provide: AuthService, useValue: auth }],
        }).compile();
        app = module.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();
        schema = app.get(GraphQLSchemaHost).schema;
    });

    beforeEach(() => jest.clearAllMocks());
    afterAll(async () => { await app?.close(); });

    it('exposes nullable email inputs/output and no client verification input', () => {
        for (const name of ['MemberInput', 'MemberUpdate']) {
            const fields = (schema.getType(name) as GraphQLInputObjectType).getFields();
            expect(String(fields.memberEmail.type)).toBe('String');
            expect(fields.memberEmailVerified).toBeUndefined();
        }
        const fields = (schema.getType('Member') as GraphQLObjectType).getFields();
        expect(String(fields.memberEmail.type)).toBe('String');
        expect(String(fields.memberEmailVerified.type)).toBe('Boolean');
    });

    it.each([undefined, otherId])('hides email on public member, shop and nested product results for viewer %s', async (viewer) => {
        const result = await execute(`query($memberId: String!, $input: AgentsInquiry!) {
            getMember(memberId: $memberId) { memberEmail memberEmailVerified }
            getAgents(input: $input) { list { memberEmail memberEmailVerified } }
            emailPrivacyProduct { memberData { memberEmail memberEmailVerified } }
        }`, { memberId: ownerId.toHexString(), input: { page: 1, limit: 10, search: {} } }, viewer);
        expect(result.errors).toBeUndefined();
        expect(result.data).toEqual({
            getMember: { memberEmail: null, memberEmailVerified: null },
            getAgents: { list: [{ memberEmail: null, memberEmailVerified: null }] },
            emailPrivacyProduct: { memberData: { memberEmail: null, memberEmailVerified: null } },
        });
        expect(service.getMemberEmail).not.toHaveBeenCalled();
    });

    it('returns fresh private values only to the authenticated account owner', async () => {
        const result = await execute('query($memberId: String!) { getMember(memberId: $memberId) { memberEmail memberEmailVerified } }',
            { memberId: ownerId.toHexString() }, ownerId);
        expect(result.errors).toBeUndefined();
        expect(result.data?.getMember).toEqual({ memberEmail: 'owner@example.com', memberEmailVerified: true });
        expect(service.getMemberEmail).toHaveBeenCalledWith(expect.anything());
    });

    it('returns null email and false verification for an existing owner without email fields', async () => {
        service.getMemberEmail.mockResolvedValueOnce({} as any).mockResolvedValueOnce({} as any);
        const result = await execute('query($memberId: String!) { getMember(memberId: $memberId) { memberEmail memberEmailVerified } }',
            { memberId: ownerId.toHexString() }, ownerId);
        expect(result.errors).toBeUndefined();
        expect(result.data?.getMember).toEqual({ memberEmail: null, memberEmailVerified: false });
    });

    it('validates signup email through the existing global ValidationPipe', async () => {
        const result = await execute('mutation($input: MemberInput!) { signup(input: $input) { _id } }',
            { input: { ...credentials(), memberEmail: 'invalid' } });
        expect(result.errors?.[0].message).toContain('Bad Request');
        expect(service.signup).not.toHaveBeenCalled();
    });

    it('validates update email through the existing global ValidationPipe', async () => {
        const result = await execute('mutation($input: MemberUpdate!) { updateMember(input: $input) { _id } }',
            { input: { _id: ownerId.toHexString(), memberEmail: 'invalid' } }, ownerId);
        expect(result.errors?.[0].message).toContain('Bad Request');
        expect(service.updateMember).not.toHaveBeenCalled();
    });

    it.each(['MemberInput', 'MemberUpdate'])('rejects verification status in %s at the GraphQL boundary', async (type) => {
        const operation = type === 'MemberInput' ? 'signup' : 'updateMember';
        const result = await execute(`mutation($input: ${type}!) { ${operation}(input: $input) { _id } }`,
            { input: { ...credentials(), _id: ownerId.toHexString(), memberEmailVerified: true } }, ownerId);
        expect(result.errors?.some((error) => error.message.includes('memberEmailVerified'))).toBe(true);
        expect(service.signup).not.toHaveBeenCalled();
        expect(service.updateMember).not.toHaveBeenCalled();
    });

    it('keeps private email data out of JWTs for documents and plain objects', async () => {
        for (const input of [member, { ...member, _doc: member }]) {
            const token = await auth.createToken(input as any);
            const payload = await auth.verifyToken(token);
            expect(String(payload._id)).toBe(String(ownerId));
            expect(payload).not.toHaveProperty('memberEmail');
            expect(payload).not.toHaveProperty('memberEmailVerified');
        }
    });
});
