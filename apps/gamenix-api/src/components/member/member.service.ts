import { BadRequestException, HttpException, HttpStatus, Injectable, InternalServerErrorException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Member, Members } from '../../libs/dto/member/member';
import { AgentsInquiry, LoginInput, MemberInput, MembersInquiry, PasswordResetInput, PasswordResetRequestInput, PasswordResetVerifyInput } from '../../libs/dto/member/member.input';
import { Direction, Message } from '../../libs/enums/common.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { AuthService } from '../auth/auth.service';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { ObjectId } from 'mongoose';
import { StatisticModifier, T } from '../../libs/types/common';
import { ViewService } from '../view/view.service';
import { ViewGroup } from '../../libs/enums/view.enum';
import { LikeService } from '../like/like.service';
import { LikeInput } from '../../libs/dto/like/like.input';
import { LikeGroup } from '../../libs/enums/like.enum';
import { Follower, Following, MeFollowed } from '../../libs/dto/follow/follow';
import { lookupAuthMemberLiked } from '../../libs/config';
import { isEmail, length } from 'class-validator';
import { NotificationService } from '../notification/notification.service';
import { MailService } from '../mail/mail.service';
import { AuthToken } from '../../libs/dto/auth/auth-token';
import { AuthTokenPurpose } from '../../libs/enums/auth-token.enum';
import { createHash, randomBytes, randomInt } from 'crypto';

const RESET_CODE_TTL_MINUTES = 3;
const RESET_SESSION_TTL_MINUTES = 10;
const MAX_RESET_ATTEMPTS = 5;
const resetMember = { deletedAt: null, memberEmailVerified: true, $or: [
    { memberStatus: MemberStatus.ACTIVE },
    { memberStatus: MemberStatus.PENDING, memberType: MemberType.SHOP },
] };

@Injectable()
export class MemberService {
    private readonly passwordResetIpLimits = new Map<string, { count: number; expiresAt: number }>();

    constructor(
        @InjectModel("Member") private readonly memberModel: Model<Member>,
        @InjectModel("Follow") private readonly followModel: Model<Follower | Following>,
        private authService: AuthService,
        private viewService: ViewService,
        private likeService: LikeService,
        @InjectModel('AuthToken') private readonly tokenModel: Model<AuthToken>,
        private readonly mailService: MailService,
        @Optional() private readonly notificationService?: NotificationService,
    ) { }

    public async assertActiveShop(memberId: ObjectId): Promise<void> {
        const shop = await this.memberModel.findOne({
            _id: memberId, memberType: MemberType.SHOP, memberStatus: MemberStatus.ACTIVE,
        }).lean().exec();
        if (!shop) throw new BadRequestException('An active approved shop is required');
    }

    public async signup(input: MemberInput): Promise<Member> {
        this.prepareMemberEmail(input);
        const memberType = input.memberType ?? MemberType.USER;
        if (![MemberType.USER, MemberType.SHOP].includes(memberType)) {
            throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
        }
        this.prepareShopName(input);
        if (input.shopName !== undefined && memberType !== MemberType.SHOP) {
            throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
        }
        if (memberType === MemberType.SHOP) (input as T).memberStatus = MemberStatus.PENDING;
        input.memberPassword = await this.authService.hashPassword(input.memberPassword);
        try {
            const result = await this.memberModel.create(input);
            result.accessToken = await this.authService.createToken(result);
            return result
        } catch (err) {
            if (err.code === 11000 && (err.keyPattern?.memberEmail || err.keyValue?.memberEmail)) {
                throw new BadRequestException(Message.USED_MEMBER_EMAIL);
            }
            throw new BadRequestException(Message.USED_MEMBER_NICK_OR_PHONE)
        }
    }

    public async login(input: LoginInput): Promise<Member> {
        const { memberNick, memberPassword } = input;
        const response: Member = await this.memberModel
            .findOne({ memberNick: memberNick })
            .select('+memberPassword')
            .exec();

        if (!response || response.memberStatus === MemberStatus.DELETE) {
            throw new InternalServerErrorException(Message.NO_MEMBER_NICK);
        } else if (response.memberStatus === MemberStatus.BLOCK) {
            throw new InternalServerErrorException(Message.BLOCKED_USER);
        }

        const isMatch = await this.authService.comparePassword(input.memberPassword, response.memberPassword);
        if (!isMatch) throw new InternalServerErrorException(Message.WRONG_PASSWORD);

        response.accessToken = await this.authService.createToken(response)

        return response;
    }

    /** Petora's recovery flow, using Gamenix usernames, verified optional email and existing authTokens. */
    public async requestPasswordReset(input: PasswordResetRequestInput, ip?: string): Promise<boolean> {
        this.checkPasswordResetIp('request', ip, 20);
        const memberEmail = typeof input.memberEmail === 'string' ? input.memberEmail.trim().toLowerCase() : '';
        if (!length(input.memberNick, 3, 12) || !isEmail(memberEmail)) throw new BadRequestException(Message.BAD_REQUEST);
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        const codeHash = await this.authService.hashPassword(code);
        const tokenHash = this.hashResetToken(randomBytes(32).toString('hex'));
        const session = await this.memberModel.db.startSession();
        let recipient: { email: string; memberNick: string };
        try {
            await session.withTransaction(async () => {
                recipient = undefined;
                const now = new Date();
                const member = await this.memberModel.findOne({ memberNick: input.memberNick, memberEmail, ...resetMember })
                    .select('+memberEmail +memberEmailVersion +memberPassword +passwordResetRequestedAt +passwordResetWindowStart +passwordResetRequests')
                    .session(session).lean().exec();
                if (!member?.memberPassword) return;
                if (member.passwordResetRequestedAt && now.getTime() - member.passwordResetRequestedAt.getTime() < 60000) return;
                const sameWindow = member.passwordResetWindowStart && now.getTime() - member.passwordResetWindowStart.getTime() < 3600000;
                const requests = sameWindow ? member.passwordResetRequests ?? 0 : 0;
                if (requests >= 5) return;
                // Serializes resends with one another and with email/password changes.
                await this.memberModel.updateOne({ _id: member._id }, { $set: {
                    passwordResetRequestedAt: now, passwordResetWindowStart: sameWindow ? member.passwordResetWindowStart : now,
                    passwordResetRequests: requests + 1,
                } }, { session }).exec();
                await this.tokenModel.updateMany({ memberId: member._id,
                    purpose: { $in: [AuthTokenPurpose.PASSWORD_RESET_CODE, AuthTokenPurpose.PASSWORD_RESET] }, consumedAt: null,
                }, { $set: { consumedAt: now } }, { session }).exec();
                await this.tokenModel.create([{
                    memberId: member._id, purpose: AuthTokenPurpose.PASSWORD_RESET_CODE, tokenHash, codeHash,
                    emailSnapshot: member.memberEmail, emailVersion: member.memberEmailVersion ?? 0,
                    passwordSnapshot: this.hashResetToken(member.memberPassword), expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MINUTES * 60000),
                }], { session });
                recipient = { email: member.memberEmail, memberNick: member.memberNick };
            }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
        } finally { await session.endSession(); }
        if (recipient) {
            try { await this.mailService.sendPasswordResetCode(recipient.email, recipient.memberNick, code, RESET_CODE_TTL_MINUTES); }
            catch {
                await this.tokenModel.updateOne({ tokenHash }, { $set: { consumedAt: new Date() } }).exec().catch(() => undefined);
                // The public response must not reveal whether this username/email exists or delivery failed.
            }
        }
        return true;
    }

    public async verifyPasswordResetCode(input: PasswordResetVerifyInput, ip?: string): Promise<string> {
        this.checkPasswordResetIp('verify', ip, 60);
        if (!length(input.memberNick, 3, 12) || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) {
            throw new BadRequestException('Invalid or expired reset code');
        }
        const member = await this.memberModel.findOne({ memberNick: input.memberNick, ...resetMember })
            .select('+memberEmail +memberEmailVersion +memberPassword').lean().exec();
        if (!member?.memberPassword) throw new BadRequestException('Invalid or expired reset code');
        // Count each attempt atomically BEFORE bcrypt, so concurrent guesses cannot bypass the limit.
        const reset = await this.tokenModel.findOneAndUpdate({
            memberId: member._id, purpose: AuthTokenPurpose.PASSWORD_RESET_CODE,
            emailSnapshot: member.memberEmail, emailVersion: member.memberEmailVersion ?? 0, passwordSnapshot: this.hashResetToken(member.memberPassword),
            consumedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_RESET_ATTEMPTS },
        }, { $inc: { attempts: 1 } }, { new: true }).select('+codeHash').lean().exec();
        if (!reset?.codeHash || !await this.authService.comparePassword(input.code, reset.codeHash)) {
            throw new BadRequestException('Invalid or expired reset code');
        }
        const resetToken = randomBytes(32).toString('hex');
        const result = await this.tokenModel.updateOne({ _id: reset._id, purpose: AuthTokenPurpose.PASSWORD_RESET_CODE,
            consumedAt: null, expiresAt: { $gt: new Date() },
        }, { $set: { purpose: AuthTokenPurpose.PASSWORD_RESET, tokenHash: this.hashResetToken(resetToken),
            expiresAt: new Date(Date.now() + RESET_SESSION_TTL_MINUTES * 60000),
        }, $unset: { codeHash: 1 } }).exec();
        if (!result.modifiedCount) throw new BadRequestException('Invalid or expired reset code');
        return resetToken;
    }

    public async resetPassword(input: PasswordResetInput, ip?: string): Promise<boolean> {
        this.checkPasswordResetIp('reset', ip, 60);
        if (typeof input.resetToken !== 'string' || !/^[a-f0-9]{64}$/.test(input.resetToken) ||
            !length(input.memberPassword, 5, 12) || !input.memberPassword.trim()) throw new BadRequestException(Message.BAD_REQUEST);
        const memberPassword = await this.authService.hashPassword(input.memberPassword);
        const session = await this.memberModel.db.startSession();
        try {
            await session.withTransaction(async () => {
                const now = new Date();
                const reset = await this.tokenModel.findOneAndUpdate({
                    tokenHash: this.hashResetToken(input.resetToken), purpose: AuthTokenPurpose.PASSWORD_RESET,
                    consumedAt: null, expiresAt: { $gt: now },
                }, { $set: { consumedAt: now } }, { new: true, session }).select('+passwordSnapshot').lean().exec();
                if (!reset?.passwordSnapshot) throw new BadRequestException('Invalid or expired reset session');
                const search = { _id: reset.memberId, ...resetMember, memberEmail: reset.emailSnapshot,
                    $expr: { $eq: [{ $ifNull: ['$memberEmailVersion', 0] }, reset.emailVersion] },
                };
                const current = await this.memberModel.findOne(search).select('+memberPassword').session(session).lean().exec();
                if (!current?.memberPassword || this.hashResetToken(current.memberPassword) !== reset.passwordSnapshot) {
                    throw new BadRequestException('Invalid or expired reset session');
                }
                const member = await this.memberModel.updateOne({ ...search, memberPassword: current.memberPassword },
                    { $set: { memberPassword } }, { session }).exec();
                if (!member.matchedCount) throw new BadRequestException('Invalid or expired reset session');
                await this.tokenModel.updateMany({ memberId: reset.memberId,
                    purpose: { $in: [AuthTokenPurpose.PASSWORD_RESET_CODE, AuthTokenPurpose.PASSWORD_RESET] }, consumedAt: null,
                }, { $set: { consumedAt: now } }, { session }).exec();
            }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
        } finally { await session.endSession(); }
        return true;
    }

    private hashResetToken(resetToken: string): string {
        return createHash('sha256').update(resetToken).digest('hex');
    }

    private checkPasswordResetIp(operation: string, ip: string, maximum: number): void {
        const now = Date.now();
        for (const [key, value] of this.passwordResetIpLimits) if (value.expiresAt <= now) this.passwordResetIpLimits.delete(key);
        const key = `${operation}:${this.hashResetToken(ip || 'unknown')}`;
        const current = this.passwordResetIpLimits.get(key) ?? { count: 0, expiresAt: now + 15 * 60000 };
        if (current.count >= maximum || (!this.passwordResetIpLimits.has(key) && this.passwordResetIpLimits.size >= 10000)) {
            throw new HttpException('Too many password reset attempts; try again later', HttpStatus.TOO_MANY_REQUESTS);
        }
        current.count++;
        this.passwordResetIpLimits.set(key, current);
    }

    public async updateMember(
        memberId: ObjectId,
        input: MemberUpdate,
    ): Promise<Member> {
        if (input.memberType !== undefined || input.memberStatus !== undefined) {
            throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
        }
        this.prepareMemberEmail(input);
        this.prepareShopName(input);
        const search: T = { _id: memberId, memberStatus: MemberStatus.ACTIVE };
        if (input.shopName !== undefined) {
            if (input._id !== undefined && String(input._id) !== String(memberId)) {
                throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
            }
            search.memberType = MemberType.SHOP;
            const shop = await this.memberModel.findOne(search).lean().exec();
            if (!shop) throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
        }
        if (input.memberPassword !== undefined) {
            if (typeof input.memberPassword !== 'string' || !input.memberPassword.trim()) {
                throw new BadRequestException('Invalid member password');
            }
            input.memberPassword = await this.authService.hashPassword(input.memberPassword);
        }
        if (input.memberEmail !== undefined) (input as T).$inc = { memberEmailVersion: 1 };
        const result: Member = await this.memberModel
            .findOneAndUpdate(
                search,
                input,
                { new: true, runValidators: true },
            )
            .exec()
            .catch((err) => {
                if (err.code === 11000 && (err.keyPattern?.memberEmail || err.keyValue?.memberEmail)) {
                    throw new BadRequestException(Message.USED_MEMBER_EMAIL);
                }
                throw err;
            });

        if (!result) {
            throw new InternalServerErrorException(Message.UPDATE_FAILED);
        }

        result.accessToken = await this.authService.createToken(result);

        return result;
    }

    public async getMember(memberId: ObjectId, targetId: ObjectId): Promise<Member> {
        const search: T = {
            _id: targetId,
            memberStatus: {
                $in: String(memberId) === String(targetId)
                    ? [MemberStatus.ACTIVE, MemberStatus.BLOCK, MemberStatus.PENDING, MemberStatus.DELETE]
                    : [MemberStatus.ACTIVE, MemberStatus.BLOCK],
            },
        };

        const targetMember = await this.memberModel.findOne(search).lean().exec();

        if (!targetMember) {
            throw new InternalServerErrorException(Message.NO_DATA_FOUND);
        }

        if (memberId) {
            const viewInput = { memberId: memberId, viewRefId: targetId, viewGroup: ViewGroup.MEMBER };
            const newView = await this.viewService.recordView(viewInput);
            if (newView) {
                await this.memberModel.findOneAndUpdate(search, { $inc: { memberViews: 1 } }, { new: true }).exec();
                targetMember.memberViews++;
            }

            const likeInput = { memberId: memberId, likeRefId: targetId, likeGroup: LikeGroup.MEMBER };
            targetMember.meLiked = await this.likeService.checkLikeExistence(likeInput);

            targetMember.meFollowed = await this.checkSubscription(memberId, targetId);
        }

        return targetMember;
    }

    public async getMemberEmail(memberId: ObjectId): Promise<Pick<Member, 'memberEmail' | 'memberEmailVerified'>> {
        return await this.memberModel.findOne({ _id: memberId })
            .select('memberEmail memberEmailVerified').lean().exec();
    }

    public async getAgents(
        memberId: ObjectId,
        input: AgentsInquiry,
    ): Promise<Members> {
        const { text } = input.search;

        const match: T = {
            memberType: MemberType.SHOP,
            memberStatus: MemberStatus.ACTIVE,
        };

        const sort: T = {
            [input?.sort ?? "createdAt"]: input?.direction ?? Direction.DESC,
        };

        if (text) {
            const searchText = { $regex: new RegExp(text, "i") };
            match.$or = [{ shopName: searchText }, { memberFullName: searchText }, { memberNick: searchText }];
        }
        console.log("match:", match);

        const result = await this.memberModel
            .aggregate([
                { $match: match },
                { $sort: sort },
                {
                    $facet: {
                        list: [
                            { $skip: (input.page - 1) * input.limit },
                            { $limit: input.limit },
                            { $project: { memberEmail: 0, memberEmailVerified: 0 } },
                            lookupAuthMemberLiked(memberId),
                        ],
                        metaCounter: [{ $count: "total" }],
                    },
                },
            ])
            .exec();

        if (!result.length) {
            throw new InternalServerErrorException(Message.NO_DATA_FOUND);
        }

        return result[0];
    }


    public async likeTargetMember(memberId: ObjectId, likeRefId: ObjectId): Promise<Member> {
        const target: Member = await this.memberModel.findOne({ _id: likeRefId, memberStatus: MemberStatus.ACTIVE }).exec();
        if (!target) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

        const input: LikeInput = {
            memberId: memberId,
            likeRefId: likeRefId,
            likeGroup: LikeGroup.MEMBER,
        };

        // LIKE TOGGLE via Like modules
        const modifier: number = await this.likeService.toggleLike(input);
        const result = await this.memberStatsEditor({ _id: likeRefId, targetKey: 'memberLikes', modifier: modifier });

        if (!result) throw new InternalServerErrorException(Message.SOMETHING_WENT_WRONG);
        return result;
    }


    public async getAllMembersByAdmin(
        input: MembersInquiry,
    ): Promise<Members> {
        const { memberStatus, memberType, text } = input.search;

        const match: T = {};
        const sort: T = {
            [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC,
        };

        if (memberStatus) match.memberStatus = memberStatus;
        if (memberType) match.memberType = memberType;
        if (text) match.memberNick = { $regex: new RegExp(text, 'i') };
        console.log('match:', match);

        const result = await this.memberModel
            .aggregate([
                { $match: match },
                { $sort: sort },
                {
                    $facet: {
                        list: [
                            { $skip: (input.page - 1) * input.limit },
                            { $limit: input.limit },
                            { $project: { memberEmail: 0, memberEmailVerified: 0 } },
                        ],
                        metaCounter: [{ $count: 'total' }],
                    },
                },
            ])
            .exec();

        if (!result.length) {
            throw new InternalServerErrorException(Message.NO_DATA_FOUND);
        }

        return result[0];
    }

    public async updateMemberByAdmin(input: MemberUpdate): Promise<Member> {
        const previousMember = input.memberStatus === undefined
            ? null
            : await this.memberModel.findOne({ _id: input._id }).select('memberType memberStatus').lean().exec();
        this.prepareMemberEmail(input);
        this.prepareShopName(input);
        const search: T = { _id: input._id };
        if (input.shopName !== undefined) {
            const member = await this.memberModel.findOne(search).lean().exec();
            const memberType = input.memberType === undefined ? member?.memberType : input.memberType;
            if (!member || memberType !== MemberType.SHOP) {
                throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
            }
            if (input.memberType !== MemberType.SHOP) search.memberType = MemberType.SHOP;
        }
        if (input.memberPassword !== undefined) {
            if (typeof input.memberPassword !== 'string' || !input.memberPassword.trim()) {
                throw new BadRequestException('Invalid member password');
            }
            input.memberPassword = await this.authService.hashPassword(input.memberPassword);
        }
        const update: T = { ...input };
        if (input.memberEmail !== undefined) update.$inc = { memberEmailVersion: 1 };
        if (input.memberType !== undefined && input.memberType !== MemberType.SHOP) {
            update.$unset = { shopName: 1 };
        }
        const result: Member = await this.memberModel
            .findOneAndUpdate(search, update, { new: true, runValidators: true })
            .exec()
            .catch((err) => {
                if (err.code === 11000 && (err.keyPattern?.memberEmail || err.keyValue?.memberEmail)) {
                    throw new BadRequestException(Message.USED_MEMBER_EMAIL);
                }
                throw err;
            });
        if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);

        if (previousMember?.memberType === MemberType.SHOP && result.memberType === MemberType.SHOP &&
            previousMember.memberStatus === MemberStatus.PENDING &&
            result.memberStatus === MemberStatus.ACTIVE) {
            await this.notificationService?.notifyShopModeration(new Types.ObjectId(String(result._id)), true);
        } else if (previousMember?.memberType === MemberType.SHOP && result.memberType === MemberType.SHOP &&
            previousMember.memberStatus === MemberStatus.PENDING &&
            result.memberStatus === MemberStatus.BLOCK) {
            await this.notificationService?.notifyShopModeration(new Types.ObjectId(String(result._id)), false);
        }

        return result;
    }

    private prepareShopName(input: MemberInput | MemberUpdate): void {
        if (input.shopName === undefined) return;
        if (typeof input.shopName !== 'string') throw new BadRequestException('Invalid shop name');
        input.shopName = input.shopName.trim();
        if (!input.shopName || input.shopName.length > 100) throw new BadRequestException('Invalid shop name');
    }

    private prepareMemberEmail(input: MemberInput | MemberUpdate): void {
        if (Object.prototype.hasOwnProperty.call(input, 'memberEmailVerified')) {
            throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
        }
        if (input.memberEmail === undefined) return;
        if (input.memberEmail !== null) {
            if (typeof input.memberEmail !== 'string') throw new BadRequestException('Invalid member email');
            input.memberEmail = input.memberEmail.trim().toLowerCase();
            if (!isEmail(input.memberEmail)) throw new BadRequestException('Invalid member email');
        }
        // An explicit email submission (including clearing it) always requires verification again.
        (input as T).memberEmailVerified = false;
    }

    private async checkSubscription(
        followerId: ObjectId,
        followingId: ObjectId,
    ): Promise<MeFollowed[]> {
        const result = await this.followModel
            .findOne({ followingId: followingId, followerId: followerId }).exec();
        return result ? [{ followerId: followerId, followingId: followingId, myFollowing: true }] : [];
    }

    public async memberStatsEditor(
        input: StatisticModifier,
    ): Promise<Member> {
        const { _id, targetKey, modifier } = input;

        return await this.memberModel
            .findByIdAndUpdate(
                _id,
                {
                    $inc: { [targetKey]: modifier },
                },
                { new: true },
            )
            .exec();
    }
}
