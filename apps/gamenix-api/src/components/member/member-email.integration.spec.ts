import { Connection, createConnection, Model } from 'mongoose';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus } from '../../libs/enums/member.enum';
import MemberSchema from '../../schemas/Member.model';
import { MemberService } from './member.service';

// Use only an explicitly configured test server and a fresh database, never the app database.
const testUri = process.env.MEMBER_TEST_MONGO_URI;
const describeMongo = testUri ? describe : describe.skip;

describeMongo('Member email MongoDB integration', () => {
    let connection: Connection;
    let members: Model<Member>;
    let service: MemberService;
    let sequence = 0;
    const credentials = () => ({ memberNick: `player${++sequence}`, memberPhone: `010${sequence}`, memberPassword: 'secret123' });

    beforeAll(async () => {
        connection = await createConnection(testUri, {
            dbName: `gamenix_member_email_test_${Date.now()}_${process.pid}`,
            serverSelectionTimeoutMS: 5000,
        }).asPromise();
        members = connection.model<Member>('Member', MemberSchema);
        await members.init();
        service = new MemberService(members, {} as any, {
            hashPassword: async () => 'test-hash', createToken: async () => 'test-token',
        } as any, {} as any, {} as any, {} as any, {} as any);
    }, 15000);

    beforeEach(async () => { await members.deleteMany({}).exec(); });

    afterAll(async () => {
        if (!connection) return;
        try { await connection.dropDatabase(); }
        finally { await connection.close(); }
    });

    it('allows multiple missing/null emails and defaults verification to false', async () => {
        for (const memberEmail of [undefined, undefined, null, null]) {
            const member = await members.create({ ...credentials(), memberEmail });
            expect(member.memberEmailVerified).toBe(false);
        }
        expect(await members.countDocuments()).toBe(4);
    });

    it('enforces normalized email uniqueness during concurrent signup', async () => {
        const results = await Promise.allSettled([
            service.signup({ ...credentials(), memberEmail: '  Owner@EXAMPLE.com  ' }),
            service.signup({ ...credentials(), memberEmail: 'owner@example.com' }),
        ]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
        expect(rejected.reason.message).toBe('Already used member email');
        expect(await members.countDocuments({ memberEmail: 'owner@example.com' })).toBe(1);
    });

    it('rejects duplicate updates and changes email/verification in one write', async () => {
        const first = await members.create({ ...credentials(), memberEmail: 'first@example.com' });
        const second = await members.create({ ...credentials(), memberEmail: 'second@example.com' });
        // Represents a trusted backend verification write, unavailable through member inputs.
        await members.updateOne({ _id: second._id }, { memberEmailVerified: true }).exec();
        await expect(service.updateMember(second._id, {
            _id: second._id, memberEmail: ' FIRST@EXAMPLE.com ',
        })).rejects.toThrow('Already used member email');
        expect((await service.getMemberEmail(second._id)).memberEmailVerified).toBe(true);
        await service.updateMember(second._id, { _id: second._id, memberEmail: ' NEW@EXAMPLE.com ' });
        expect(await service.getMemberEmail(second._id)).toMatchObject({
            memberEmail: 'new@example.com', memberEmailVerified: false,
        });
        expect((await service.getMemberEmail(first._id)).memberEmail).toBe('first@example.com');
    });

    it('preserves verification on other updates and keeps legacy members compatible', async () => {
        const member = await members.create({ ...credentials(), memberEmail: 'owner@example.com' });
        await members.updateOne({ _id: member._id }, { memberEmailVerified: true }).exec();
        await service.updateMember(member._id, { _id: member._id, memberDesc: 'New description' });
        expect((await service.getMemberEmail(member._id)).memberEmailVerified).toBe(true);
        await service.updateMemberByAdmin({ _id: member._id, memberEmail: null });
        expect(await service.getMemberEmail(member._id)).toMatchObject({ memberEmail: null, memberEmailVerified: false });

        const legacy = await members.collection.insertOne({ ...credentials(), memberStatus: MemberStatus.ACTIVE });
        await service.updateMember(legacy.insertedId as any, { _id: legacy.insertedId as any, memberDesc: 'Legacy update' });
        expect((await members.findById(legacy.insertedId).lean().exec()).memberDesc).toBe('Legacy update');
        expect((await service.getMemberEmail(legacy.insertedId as any)).memberEmail).toBeUndefined();
    });
});
