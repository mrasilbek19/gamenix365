import { JwtService } from '@nestjs/jwt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { Message } from '../../libs/enums/common.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { MemberService } from './member.service';

const memberId = new Types.ObjectId();
const oldPassword = 'oldpass123';
const newPassword = 'newpass456';
const query = (read: () => unknown) => ({
    select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn(async () => read()),
});

describe('Member password updates', () => {
    let originalHash: string;
    let stored: any;
    let members: any;
    let auth: AuthService;
    let hashPassword: jest.SpyInstance;
    let service: MemberService;

    beforeAll(async () => {
        originalHash = await new AuthService(new JwtService()).hashPassword(oldPassword);
    });

    beforeEach(() => {
        stored = {
            _id: memberId, memberNick: 'alexgaming', memberPhone: '01012345678',
            memberType: MemberType.SHOP, memberStatus: MemberStatus.ACTIVE,
            shopName: 'Alex Gaming Store', memberEmail: 'owner@example.com', memberEmailVerified: true,
            memberPassword: originalHash,
        };
        const matches = (search: Record<string, unknown>) =>
            Object.entries(search).every(([key, value]) => String(stored[key]) === String(value));
        members = {
            create: jest.fn(async (input) => {
                stored = { _id: memberId, memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE, ...input };
                return { ...stored };
            }),
            findOne: jest.fn((search) => query(() => matches(search) ? { ...stored } : null)),
            findOneAndUpdate: jest.fn((search, input) => query(() => {
                if (!matches(search)) return null;
                stored = { ...stored, ...input };
                return { ...stored };
            })),
        };
        auth = new AuthService(new JwtService({ secret: 'member-password-test-secret' }));
        hashPassword = jest.spyOn(auth, 'hashPassword');
        service = new MemberService(members, {} as any, auth, {} as any, {} as any, {} as any, {} as any);
    });

    it.each([MemberType.USER, MemberType.SHOP])('keeps bcrypt signup and username login working for %s', async (memberType) => {
        const result = await service.signup({
            memberNick: 'alexgaming', memberPhone: '01012345678', memberPassword: newPassword, memberType,
            ...(memberType === MemberType.SHOP ? { shopName: 'Alex Gaming Store' } : {}),
        });
        expect(hashPassword).toHaveBeenCalledTimes(1);
        expect(hashPassword).toHaveBeenCalledWith(newPassword);
        expect(stored.memberPassword).toMatch(/^\$2[aby]\$/);
        expect(stored.memberPassword).not.toBe(newPassword);
        expect(await auth.comparePassword(newPassword, stored.memberPassword)).toBe(true);
        expect(result.memberStatus).toBe(memberType === MemberType.SHOP ? MemberStatus.PENDING : MemberStatus.ACTIVE);
        const login = await service.login({ memberNick: 'alexgaming', memberPassword: newPassword });
        expect(members.findOne).toHaveBeenLastCalledWith({ memberNick: 'alexgaming' });
        expect((await auth.verifyToken(login.accessToken)).memberType).toBe(memberType);
        expect(await auth.verifyToken(login.accessToken)).not.toHaveProperty('memberPassword');
    });

    describe.each([false, true])('administrator update = %s', (admin) => {
        const update = (input: Partial<MemberUpdate>) => admin
            ? service.updateMemberByAdmin({ _id: memberId as any, ...input })
            : service.updateMember(memberId as any, { _id: memberId as any, ...input });

        it.each([MemberType.USER, MemberType.SHOP])('hashes once and replaces the login password for %s', async (memberType) => {
            stored.memberType = memberType;
            await update({ memberPassword: newPassword });
            const savedPassword = members.findOneAndUpdate.mock.calls[0][1].memberPassword;
            expect(hashPassword).toHaveBeenCalledTimes(1);
            expect(hashPassword).toHaveBeenCalledWith(newPassword);
            expect(savedPassword).toMatch(/^\$2[aby]\$/);
            expect(savedPassword).not.toBe(newPassword);
            expect(savedPassword).not.toBe(originalHash);
            expect(stored.memberPassword).toBe(savedPassword);
            expect(await auth.comparePassword(newPassword, savedPassword)).toBe(true);
            expect(await auth.comparePassword(oldPassword, savedPassword)).toBe(false);
            expect(stored.memberNick).toBe('alexgaming');
            expect(stored.shopName).toBe('Alex Gaming Store');
            expect(stored.memberStatus).toBe(MemberStatus.ACTIVE);
            await expect(service.login({ memberNick: 'alexgaming', memberPassword: oldPassword }))
                .rejects.toThrow(Message.WRONG_PASSWORD);
            const login = await service.login({ memberNick: 'alexgaming', memberPassword: newPassword });
            expect(members.findOne).toHaveBeenLastCalledWith({ memberNick: 'alexgaming' });
            expect((await auth.verifyToken(login.accessToken)).memberType).toBe(memberType);
        });

        it.each([
            { shopName: 'New Gaming Store' },
            { memberEmail: 'new@example.com' },
            { memberDesc: 'Updated profile' },
        ])('preserves the password when updating only %j', async (input) => {
            await update(input);
            expect(members.findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty('memberPassword');
            expect(hashPassword).not.toHaveBeenCalled();
            expect(stored.memberPassword).toBe(originalHash);
            expect(await auth.comparePassword(oldPassword, stored.memberPassword)).toBe(true);
        });

        it.each([null, '', ' ', '     ', '\t\n ', 12345, {}])('rejects invalid password %j before saving', async (memberPassword) => {
            await expect(update({ memberPassword } as any)).rejects.toThrow('Invalid member password');
            expect(hashPassword).not.toHaveBeenCalled();
            expect(members.findOneAndUpdate).not.toHaveBeenCalled();
            expect(stored.memberPassword).toBe(originalHash);
        });

        it('preserves intentional spaces in a valid new password', async () => {
            const password = ' pass123 ';
            await update({ memberPassword: password });
            expect(hashPassword).toHaveBeenCalledWith(password);
            expect(await auth.comparePassword(password, stored.memberPassword)).toBe(true);
            expect(await auth.comparePassword(password.trim(), stored.memberPassword)).toBe(false);
        });

        it('does not write plaintext if hashing fails', async () => {
            hashPassword.mockRejectedValueOnce(new Error('Hashing unavailable'));
            await expect(update({ memberPassword: newPassword })).rejects.toThrow('Hashing unavailable');
            expect(members.findOneAndUpdate).not.toHaveBeenCalled();
            expect(stored.memberPassword).toBe(originalHash);
        });
    });

    it.each([{ memberType: MemberType.ADMIN }, { memberStatus: MemberStatus.ACTIVE }])
        ('preserves self-service role/status restrictions for %j', async (input) => {
            await expect(service.updateMember(memberId as any, {
                _id: memberId as any, memberPassword: newPassword, ...input,
            })).rejects.toThrow('Not Allowed Request');
            expect(hashPassword).not.toHaveBeenCalled();
            expect(members.findOneAndUpdate).not.toHaveBeenCalled();
        });
});

describe('Existing member update password length validation', () => {
    it.each(['abcde', 'abcdefghijkl', ' pass123 '])('accepts existing valid password %j', async (memberPassword) => {
        const input = plainToInstance(MemberUpdate, { _id: memberId.toHexString(), memberPassword });
        expect(await validate(input)).toEqual([]);
    });

    it.each(['abcd', 'abcdefghijklm'])('rejects password outside the existing 5–12 range: %j', async (memberPassword) => {
        const input = plainToInstance(MemberUpdate, { _id: memberId.toHexString(), memberPassword });
        expect((await validate(input)).some((error) => error.property === 'memberPassword')).toBe(true);
    });
});
