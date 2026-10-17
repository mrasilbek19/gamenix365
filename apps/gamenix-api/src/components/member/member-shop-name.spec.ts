import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ApolloDriver } from '@nestjs/apollo';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { graphql, GraphQLInputObjectType, GraphQLObjectType, GraphQLSchema } from 'graphql';
import { model, Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import MemberSchema from '../../schemas/Member.model';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum', () =>
    jest.requireActual('../../libs/enums/common.enum'), { virtual: true });

const ownerId = new Types.ObjectId();
const otherId = new Types.ObjectId();
const userId = new Types.ObjectId();
const adminId = new Types.ObjectId();
const credentials = () => ({ memberNick: 'alexgaming', memberPhone: '01012345678', memberPassword: 'secret123' });
const MemberModel = model('MemberShopNameTest', MemberSchema);
const query = (value: unknown) => ({
    select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn(async () => value),
});

describe('Member shop name schema and input validation', () => {
    it('trims a normal business name without changing username or password', () => {
        const member = new MemberModel({ ...credentials(), memberType: MemberType.SHOP, shopName: '  Alex Gaming Store  ' });
        expect(member.validateSync()).toBeUndefined();
        expect(member.shopName).toBe('Alex Gaming Store');
        expect(member.memberNick).toBe('alexgaming');
        expect(member.memberPassword).toBe('secret123');
    });

    it.each([MemberType.USER, MemberType.SHOP, MemberType.ADMIN])('keeps legacy %s members valid without shopName', (memberType) => {
        const member = new MemberModel({ ...credentials(), memberType });
        expect(member.validateSync()).toBeUndefined();
        expect(member.shopName).toBeUndefined();
    });

    it.each([MemberType.USER, MemberType.ADMIN])('rejects a business name on a stored %s account', (memberType) => {
        expect(new MemberModel({ ...credentials(), memberType, shopName: 'Alex Gaming Store' })
            .validateSync()?.errors.shopName).toBeDefined();
    });

    it.each([null, '', '   ', 'x'.repeat(101)])('rejects invalid stored shopName %j', (shopName) => {
        expect(new MemberModel({ ...credentials(), memberType: MemberType.SHOP, shopName })
            .validateSync()?.errors.shopName).toBeDefined();
    });

    it('validates actual Mongoose query updates for owners, admins, role promotion and role demotion', async () => {
        const updates = [
            { search: { _id: ownerId, memberType: MemberType.SHOP }, input: { shopName: ' New Store ' } },
            { search: { _id: ownerId }, input: { memberType: MemberType.SHOP, shopName: ' New Store ' } },
            { search: { _id: ownerId }, input: { memberType: MemberType.USER, $unset: { shopName: 1 } } },
        ];
        for (const { search, input } of updates) {
            const update: any = MemberModel.findOneAndUpdate(search, input, { runValidators: true });
            const cast = update._castUpdate(update.getUpdate());
            await expect(update.validate(cast, update.getOptions(), false)).resolves.toBeUndefined();
            if (input.shopName) expect(cast.$set.shopName).toBe('New Store');
        }
        const invalid: any = MemberModel.findOneAndUpdate({ _id: userId, memberType: MemberType.USER },
            { shopName: 'User Store' }, { runValidators: true });
        await expect(invalid.validate(invalid._castUpdate(invalid.getUpdate()), invalid.getOptions(), false))
            .rejects.toThrow('Shop name is only available for shop accounts');
        const clearedRole: any = MemberModel.findOneAndUpdate({ _id: ownerId, memberType: MemberType.SHOP },
            { shopName: 'Store', memberType: null }, { runValidators: true });
        await expect(clearedRole.validate(clearedRole._castUpdate(clearedRole.getUpdate()), clearedRole.getOptions(), false))
            .rejects.toThrow('Shop name is only available for shop accounts');
    });

    describe.each([MemberInput, MemberUpdate])('%p', (Dto) => {
        it('accepts omission, trims spaces and permits names from 1 to 100 characters', async () => {
            for (const shopName of [undefined, ' A ', 'x'.repeat(100), ' Alex Gaming Store ']) {
                const dto = plainToInstance(Dto as typeof MemberInput, { ...credentials(), _id: ownerId, shopName });
                expect(await validate(dto)).toEqual([]);
                expect(dto.shopName).toBe(shopName?.trim());
            }
        });

        it.each([null, '', '   ', 'x'.repeat(101), 123, {}, ['Alex']])('rejects supplied invalid shopName %j', async (shopName) => {
            const dto = plainToInstance(Dto as typeof MemberInput, { ...credentials(), _id: ownerId, shopName });
            expect((await validate(dto)).some((error) => error.property === 'shopName')).toBe(true);
        });
    });
});

describe('Member shop name service boundaries', () => {
    let members: any;
    let auth: any;
    let service: MemberService;

    beforeEach(() => {
        members = {
            create: jest.fn(async (input) => ({ _id: ownerId, ...input })),
            findOne: jest.fn(() => query({ _id: ownerId, memberType: MemberType.SHOP, memberStatus: MemberStatus.ACTIVE })),
            findOneAndUpdate: jest.fn(() => query({ _id: ownerId, memberNick: 'alexgaming', shopName: 'Alex Gaming Store' })),
            aggregate: jest.fn(() => query([{ list: [], metaCounter: [] }])),
        };
        auth = { hashPassword: jest.fn(async () => 'hash'), createToken: jest.fn(async () => 'token') };
        service = new MemberService(members, {} as any, auth, {} as any, {} as any, {} as any, {} as any);
    });

    it('creates a pending SHOP with separate normalized public name and hashed login credentials', async () => {
        await service.signup({ ...credentials(), memberType: MemberType.SHOP, shopName: '  Alex Gaming Store  ' });
        expect(members.create).toHaveBeenCalledWith(expect.objectContaining({ memberNick: 'alexgaming',
            memberPassword: 'hash', shopName: 'Alex Gaming Store', memberStatus: MemberStatus.PENDING }));
        expect(auth.hashPassword).toHaveBeenCalledWith('secret123');
    });

    it.each([undefined, MemberType.USER])('rejects USER signup with a shop name, including default role %s', async (memberType) => {
        await expect(service.signup({ ...credentials(), memberType, shopName: 'Store' })).rejects.toThrow('Not Allowed Request');
        expect(members.create).not.toHaveBeenCalled();
        expect(auth.hashPassword).not.toHaveBeenCalled();
    });

    it.each(['signup', 'updateMember', 'updateMemberByAdmin'])('validates raw supplied names in %s', async (method) => {
        for (const shopName of [null, '', '   ', 'x'.repeat(101), 123, {}]) {
            const input: any = { ...credentials(), _id: ownerId, memberType: method === 'signup' ? MemberType.SHOP : undefined, shopName };
            const work = method === 'signup' ? service.signup(input)
                : method === 'updateMember' ? service.updateMember(ownerId as any, input) : service.updateMemberByAdmin(input);
            await expect(work).rejects.toThrow('Invalid shop name');
        }
        expect(members.create).not.toHaveBeenCalled();
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('updates only the authenticated active SHOP and repeats role/status in the write predicate', async () => {
        const result = await service.updateMember(ownerId as any, { _id: ownerId as any, shopName: '  Alex Gaming Store  ' });
        expect(members.findOne).toHaveBeenCalledWith({ _id: ownerId, memberType: MemberType.SHOP, memberStatus: MemberStatus.ACTIVE });
        expect(members.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: ownerId, memberType: MemberType.SHOP, memberStatus: MemberStatus.ACTIVE },
            { _id: ownerId, shopName: 'Alex Gaming Store' }, { new: true, runValidators: true });
        expect(result.memberNick).toBe('alexgaming');
        expect(auth.createToken).toHaveBeenCalledWith(result);
    });

    it('rejects an attempt to supply another shop ID before any write', async () => {
        await expect(service.updateMember(ownerId as any, { _id: otherId as any, shopName: 'Other Store' }))
            .rejects.toThrow('Not Allowed Request');
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects a name write when the current account is not an active SHOP', async () => {
        members.findOne.mockReturnValue(query(null));
        await expect(service.updateMember(ownerId as any, { _id: ownerId as any, shopName: 'Store' }))
            .rejects.toThrow('Not Allowed Request');
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('prevents a role/status race from becoming a successful name update', async () => {
        members.findOneAndUpdate.mockReturnValue(query(null));
        await expect(service.updateMember(ownerId as any, { _id: ownerId as any, shopName: 'Store' }))
            .rejects.toThrow('Update failed!');
        expect(auth.createToken).not.toHaveBeenCalled();
    });

    it('preserves unrelated USER and legacy profile updates without an extra role lookup', async () => {
        await service.updateMember(userId as any, { _id: userId as any, memberDesc: 'Player profile' });
        expect(members.findOne).not.toHaveBeenCalled();
        expect(members.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: userId, memberStatus: MemberStatus.ACTIVE }, { _id: userId, memberDesc: 'Player profile' },
            { new: true, runValidators: true });
    });

    it('allows the existing admin method to update SHOP names and preserves approval patches', async () => {
        await service.updateMemberByAdmin({ _id: ownerId as any, shopName: ' New Store ', memberStatus: MemberStatus.ACTIVE });
        expect(members.findOneAndUpdate).toHaveBeenCalledWith({ _id: ownerId, memberType: MemberType.SHOP },
            { _id: ownerId, shopName: 'New Store', memberStatus: MemberStatus.ACTIVE }, { new: true, runValidators: true });
    });

    it('allows authorized USER-to-SHOP conversion with a public name', async () => {
        members.findOne.mockReturnValue(query({ _id: userId, memberType: MemberType.USER }));
        await service.updateMemberByAdmin({ _id: userId as any, memberType: MemberType.SHOP, shopName: ' New Store ' });
        expect(members.findOneAndUpdate).toHaveBeenCalledWith({ _id: userId },
            { _id: userId, memberType: MemberType.SHOP, shopName: 'New Store' }, { new: true, runValidators: true });
    });

    it.each([MemberType.USER, MemberType.ADMIN, null])('rejects an admin name patch for resulting %s role', async (memberType) => {
        await expect(service.updateMemberByAdmin({ _id: ownerId as any, memberType, shopName: 'Store' }))
            .rejects.toThrow('Not Allowed Request');
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each([MemberType.USER, MemberType.ADMIN])('removes the public shop field when admin changes a SHOP to %s', async (memberType) => {
        await service.updateMemberByAdmin({ _id: ownerId as any, memberType });
        expect(members.findOneAndUpdate).toHaveBeenCalledWith({ _id: ownerId },
            { _id: ownerId, memberType, $unset: { shopName: 1 } }, { new: true, runValidators: true });
    });

    it('searches real shop names and legacy display names while keeping active SHOP visibility and private projections', async () => {
        await service.getAgents(null, { page: 1, limit: 4, search: { text: 'Gaming Store' } });
        const pipeline = members.aggregate.mock.calls[0][0];
        expect(pipeline[0].$match).toEqual({ memberType: MemberType.SHOP, memberStatus: MemberStatus.ACTIVE,
            $or: [{ shopName: { $regex: /Gaming Store/i } }, { memberFullName: { $regex: /Gaming Store/i } },
                { memberNick: { $regex: /Gaming Store/i } }] });
        expect(pipeline.find((stage) => stage.$facet).$facet.list)
            .toContainEqual({ $project: { memberEmail: 0, memberEmailVerified: 0 } });
    });
});

describe('Member shop name GraphQL signup, login and authorization', () => {
    let app: INestApplication;
    let schema: GraphQLSchema;
    let auth: AuthService;
    let records: any[];
    let members: any;
    const signup = 'mutation($input: MemberInput!) { signup(input: $input) { _id memberNick shopName memberStatus accessToken } }';
    const login = 'mutation($input: LoginInput!) { login(input: $input) { _id memberNick shopName accessToken } }';
    const update = 'mutation($input: MemberUpdate!) { updateMember(input: $input) { _id memberNick shopName accessToken } }';
    const adminUpdate = 'mutation($input: MemberUpdate!) { updateMemberByAdmin(input: $input) { _id memberNick shopName memberType memberStatus } }';
    const execute = async (source: string, input: unknown, memberId?: Types.ObjectId) => {
        const member = records.find((record) => String(record._id) === String(memberId));
        const token = member ? await auth.createToken(member) : null;
        return await graphql({ schema, source, variableValues: { input },
            contextValue: { req: { headers: token ? { authorization: `Bearer ${token}` } : {}, body: {} } } });
    };
    const matches = (record: any, search: any) => Object.entries(search)
        .every(([key, value]) => String(record[key]) === String(value));

    beforeAll(async () => {
        auth = new AuthService(new JwtService({ secret: 'shop-name-test-secret' }));
        members = {
            create: jest.fn(async (input) => {
                const member = new MemberModel(input);
                await member.validate();
                const record = member.toObject();
                records.push(record);
                return record;
            }),
            findOne: jest.fn((search) => query(records.find((record) => matches(record, search)) ?? null)),
            findOneAndUpdate: jest.fn((search, input) => ({ exec: async () => {
                const record = records.find((member) => matches(member, search));
                if (!record) return null;
                const next = { ...record, ...input };
                delete next.$unset;
                for (const field of Object.keys(input.$unset ?? {})) delete next[field];
                const member = new MemberModel(next);
                await member.validate();
                Object.assign(record, member.toObject());
                for (const field of Object.keys(input.$unset ?? {})) delete record[field];
                return { ...record };
            } })),
        };
        const service = new MemberService(members, {} as any, auth, {} as any, {} as any, {} as any, {} as any);
        const module = await Test.createTestingModule({
            imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
            providers: [MemberResolver, { provide: MemberService, useValue: service }, { provide: AuthService, useValue: auth }],
        }).compile();
        app = module.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();
        schema = app.get(GraphQLSchemaHost).schema;
    });

    beforeEach(async () => {
        const memberPassword = await auth.hashPassword('secret123');
        records = [
            { _id: ownerId, memberType: MemberType.SHOP, memberNick: 'owner123', shopName: 'Original Store' },
            { _id: otherId, memberType: MemberType.SHOP, memberNick: 'other123', shopName: 'Other Store' },
            { _id: userId, memberType: MemberType.USER, memberNick: 'player123' },
            { _id: adminId, memberType: MemberType.ADMIN, memberNick: 'admin123' },
        ].map((record) => ({ ...record, memberStatus: MemberStatus.ACTIVE, memberPhone: String(record._id), memberPassword }));
        jest.clearAllMocks();
    });
    afterAll(async () => { await app?.close(); });

    it('adds one optional field to existing inputs/output while leaving LoginInput unchanged', () => {
        for (const name of ['MemberInput', 'MemberUpdate']) {
            expect(String((schema.getType(name) as GraphQLInputObjectType).getFields().shopName.type)).toBe('String');
        }
        expect(String((schema.getType('Member') as GraphQLObjectType).getFields().shopName.type)).toBe('String');
        expect((schema.getType('LoginInput') as GraphQLInputObjectType).getFields().shopName).toBeUndefined();
    });

    it('registers separate SHOP username/name, logs in by username and stays pending until existing admin approval', async () => {
        const registered = await execute(signup, { ...credentials(), memberType: MemberType.SHOP, shopName: ' Alex Gaming Store ' });
        expect(registered.errors).toBeUndefined();
        expect(registered.data?.signup).toMatchObject({ memberNick: 'alexgaming', shopName: 'Alex Gaming Store', memberStatus: MemberStatus.PENDING });
        const signedIn = await execute(login, { memberNick: 'alexgaming', memberPassword: 'secret123' });
        expect(signedIn.errors).toBeUndefined();
        expect(signedIn.data?.login).toMatchObject({ memberNick: 'alexgaming', shopName: 'Alex Gaming Store' });
        const businessLogin = await execute(login, { memberNick: 'Alex Gaming Store', memberPassword: 'secret123' });
        expect(businessLogin.errors).toBeDefined();
        const id = (registered.data?.signup as any)._id;
        const pendingEdit = await execute(update, { _id: id, shopName: 'New Store' }, new Types.ObjectId(id));
        expect(pendingEdit.errors).toBeDefined();
        const approved = await execute(adminUpdate, { _id: id, memberStatus: MemberStatus.ACTIVE }, adminId);
        expect(approved.errors).toBeUndefined();
        expect(approved.data?.updateMemberByAdmin).toMatchObject({ memberStatus: MemberStatus.ACTIVE, shopName: 'Alex Gaming Store' });
        const renamed = await execute(update, { _id: id, shopName: ' Alex Equipment ' }, new Types.ObjectId(id));
        expect(renamed.errors).toBeUndefined();
        expect(renamed.data?.updateMember).toMatchObject({ memberNick: 'alexgaming', shopName: 'Alex Equipment' });
        expect((await execute(login, { memberNick: 'alexgaming', memberPassword: 'secret123' })).errors).toBeUndefined();
    });

    it('rejects another shop ID in the actual resolver before deleting the submitted ID', async () => {
        const result = await execute(update, { _id: otherId.toHexString(), shopName: 'Stolen Store' }, ownerId);
        expect(result.errors?.[0].message).toBe('Not Allowed Request!');
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
        expect(records.find((record) => record._id === otherId).shopName).toBe('Other Store');
    });

    it.each([undefined, userId, adminId])('rejects owner name updates for unauthenticated/nonSHOP viewer %s', async (viewer) => {
        const result = await execute(update, { _id: (viewer ?? ownerId).toHexString(), shopName: 'Unauthorized Store' }, viewer);
        expect(result.errors).toBeDefined();
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each([ownerId, userId, undefined])('protects existing admin name mutation from viewer %s', async (viewer) => {
        const result = await execute(adminUpdate, { _id: otherId.toHexString(), shopName: 'Unauthorized Store' }, viewer);
        expect(result.errors).toBeDefined();
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('allows ADMIN business naming and preserves role conversion semantics', async () => {
        const named = await execute(adminUpdate, { _id: ownerId.toHexString(), shopName: 'Admin Updated Store' }, adminId);
        expect(named.errors).toBeUndefined();
        expect(named.data?.updateMemberByAdmin).toMatchObject({ memberNick: 'owner123', shopName: 'Admin Updated Store' });
        const promoted = await execute(adminUpdate, { _id: userId.toHexString(), memberType: MemberType.SHOP, shopName: 'Player Store' }, adminId);
        expect(promoted.errors).toBeUndefined();
        const converted = await execute(adminUpdate, { _id: ownerId.toHexString(), memberType: MemberType.USER }, adminId);
        expect(converted.errors).toBeUndefined();
        expect(converted.data?.updateMemberByAdmin).toMatchObject({ memberNick: 'owner123', memberType: MemberType.USER, shopName: null });
    });

    it('keeps legacy SHOP and ordinary USER signup/login compatible', async () => {
        for (const memberType of [MemberType.SHOP, MemberType.USER]) {
            const memberNick = memberType === MemberType.SHOP ? 'legacyshop' : 'newplayer';
            const result = await execute(signup, { ...credentials(), memberNick, memberType });
            expect(result.errors).toBeUndefined();
            expect(result.data?.signup).toMatchObject({ memberNick, shopName: null });
            expect((await execute(login, { memberNick, memberPassword: 'secret123' })).errors).toBeUndefined();
        }
    });

    it.each([null, '', '   ', 'x'.repeat(101)])('validates name %j through the actual GraphQL ValidationPipe', async (shopName) => {
        expect((await execute(signup, { ...credentials(), memberType: MemberType.SHOP, shopName })).errors).toBeDefined();
        expect((await execute(update, { _id: ownerId.toHexString(), shopName }, ownerId)).errors).toBeDefined();
        expect(members.create).not.toHaveBeenCalled();
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects USER signup names and preserves self-approval protection', async () => {
        expect((await execute(signup, { ...credentials(), memberType: MemberType.USER, shopName: 'Store' })).errors).toBeDefined();
        expect((await execute(update, { _id: ownerId.toHexString(), shopName: 'Store', memberStatus: MemberStatus.ACTIVE }, ownerId)).errors).toBeDefined();
        expect(members.create).not.toHaveBeenCalled();
        expect(members.findOneAndUpdate).not.toHaveBeenCalled();
    });
});
