import { BadRequestException, Injectable, InternalServerErrorException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Member, Members } from '../../libs/dto/member/member';
import { AgentsInquiry, LoginInput, MemberInput, MembersInquiry } from '../../libs/dto/member/member.input';
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
import { isEmail } from 'class-validator';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class MemberService {
    constructor(
        @InjectModel("Member") private readonly memberModel: Model<Member>,
        @InjectModel("Follow") private readonly followModel: Model<Follower | Following>,
        private authService: AuthService,
        private viewService: ViewService,
        private likeService: LikeService,
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
