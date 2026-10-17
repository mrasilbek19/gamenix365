import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminReviewUpdate, ReviewUpdate } from '../../libs/dto/review/review.update';
import { ReviewInput, ReviewsInquiry } from '../../libs/dto/review/review.input';
import { Review, ReviewStats, Reviews } from '../../libs/dto/review/review';
import { ReviewGroup, ReviewStatus } from '../../libs/enums/review.enum';
import { availableReviewSorts } from '../../libs/config';
import { Direction, Message } from '../../libs/enums/common.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { ProductStatus } from '../../libs/enums/product.enum';
import { Member } from '../../libs/dto/member/member';
import { Product } from '../../libs/dto/product/product';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class ReviewService {
    constructor(
        @InjectModel('Review') private readonly reviewModel: Model<Review>,
        @InjectModel('Member') private readonly memberModel: Model<Member>,
        @InjectModel('Product') private readonly productModel: Model<Product>,
    ) { }

    public async createNewReview(memberId: Types.ObjectId, input: ReviewInput): Promise<Review> {
        await this.requireMember(memberId);
        const reviewRefId = this.objectId(input.reviewRefId);
        if (!Object.values(ReviewGroup).includes(input.reviewGroup)) throw new BadRequestException(Message.BAD_REQUEST);
        let shopId = reviewRefId;
        if (input.reviewGroup === ReviewGroup.PRODUCT) {
            const product = await this.productModel.findOne({
                _id: reviewRefId, productStatus: ProductStatus.PROCESS, deletedAt: null,
            }).exec();
            if (!product) throw new NotFoundException(Message.NO_DATA_FOUND);
            shopId = this.objectId(String(product.memberId));
        }
        const shop = await this.memberModel.exists({
            _id: shopId, memberType: MemberType.SHOP, memberStatus: MemberStatus.ACTIVE, deletedAt: null,
        }).exec();
        if (!shop) throw new NotFoundException(Message.NO_DATA_FOUND);
        if (String(shopId) === String(memberId)) throw new ForbiddenException(Message.NOT_ALLOWED_REQUEST);

        try {
            return await this.reviewModel.create({
                ...this.reviewContent(input), memberId, reviewRefId, reviewGroup: input.reviewGroup,
                reviewStatus: ReviewStatus.ACTIVE,
            });
        } catch (err) {
            if (err?.code === 11000) throw new BadRequestException(Message.ALREADY_REVIEWED);
            throw new BadRequestException(Message.CREATE_FAILED);
        }
    }

    public async updateReview(memberId: Types.ObjectId, input: ReviewUpdate): Promise<Review> {
        await this.requireMember(memberId);
        const result = await this.reviewModel.findOneAndUpdate(
            { _id: this.objectId(input.reviewId), memberId, reviewStatus: ReviewStatus.ACTIVE },
            { $set: this.reviewContent(input) },
            { new: true, runValidators: true },
        ).exec();
        if (!result) throw new NotFoundException(Message.NO_DATA_FOUND);
        return result;
    }

    public async updateReviewByAdmin(memberId: Types.ObjectId, input: AdminReviewUpdate): Promise<Review> {
        await this.requireMember(memberId, true);
        if (!Object.values(ReviewStatus).includes(input.reviewStatus)) throw new BadRequestException(Message.BAD_REQUEST);
        const result = await this.reviewModel.findByIdAndUpdate(
            this.objectId(input.reviewId), { $set: { reviewStatus: input.reviewStatus } }, { new: true, runValidators: true },
        ).exec();
        if (!result) throw new NotFoundException(Message.NO_DATA_FOUND);
        return result;
    }

    public async removeReviewByAdmin(memberId: Types.ObjectId, reviewId: string): Promise<Review> {
        await this.requireMember(memberId, true);
        const result = await this.reviewModel.findOneAndDelete({
            _id: this.objectId(reviewId), reviewStatus: ReviewStatus.DELETE,
        }).exec();
        if (!result) throw new NotFoundException(Message.NO_DATA_FOUND);
        return result;
    }

    public async getReviews(input: ReviewsInquiry): Promise<Reviews> {
        if (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100 ||
            !Number.isSafeInteger((input.page - 1) * input.limit) || !Object.values(ReviewGroup).includes(input.search?.reviewGroup) ||
            (input.sort != null && !availableReviewSorts.includes(input.sort)) ||
            (input.direction != null && ![Direction.ASC, Direction.DESC].includes(input.direction))) {
            throw new BadRequestException(Message.BAD_REQUEST);
        }
        const result = await this.reviewModel.aggregate([
            { $match: { reviewGroup: input.search.reviewGroup, reviewRefId: this.objectId(input.search.reviewRefId), reviewStatus: ReviewStatus.ACTIVE } },
            { $sort: { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC, _id: Direction.DESC } },
            {
                $facet: {
                    list: [
                        { $skip: (input.page - 1) * input.limit },
                        { $limit: input.limit },
                        { $lookup: {
                            from: 'members', localField: 'memberId', foreignField: '_id', as: 'memberData',
                            pipeline: [{ $project: {
                                memberPassword: 0, memberEmail: 0, memberEmailVerified: 0, memberEmailVersion: 0,
                                emailVerificationRequestedAt: 0, emailVerificationWindowStart: 0, emailVerificationRequests: 0,
                                passwordResetRequestedAt: 0, passwordResetWindowStart: 0, passwordResetRequests: 0,
                            } }],
                        } },
                        { $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
                    ],
                    metaCounter: [{ $count: 'total' }],
                    distribution: [{ $group: { _id: '$reviewRating', count: { $sum: 1 } } }],
                },
            },
        ]).exec();
        const { list, metaCounter, distribution } = result[0] ?? { list: [], metaCounter: [], distribution: [] };
        return { list, metaCounter, stats: this.buildReviewStats(distribution, metaCounter[0]?.total ?? 0) };
    }

    private async requireMember(memberId: Types.ObjectId, admin = false): Promise<void> {
        if (!memberId || !await this.memberModel.exists({
            _id: memberId, memberStatus: MemberStatus.ACTIVE, deletedAt: null,
            ...(admin ? { memberType: MemberType.ADMIN } : {}),
        }).exec()) throw new ForbiddenException(Message.NOT_ALLOWED_REQUEST);
    }

    private objectId(value: string): Types.ObjectId {
        if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) throw new BadRequestException(Message.BAD_REQUEST);
        return new Types.ObjectId(value);
    }

    private reviewContent(input: ReviewInput | ReviewUpdate) {
        const { reviewMessage, reviewImages, reviewRating } = input;
        if ((reviewRating != null && (!Number.isInteger(reviewRating) || reviewRating < 1 || reviewRating > 5)) ||
            ('reviewGroup' in input && reviewRating == null) ||
            (reviewMessage != null && (typeof reviewMessage !== 'string' || reviewMessage.length > 1000)) ||
            (reviewImages != null && (!Array.isArray(reviewImages) || reviewImages.length > 10 ||
                reviewImages.some((image) => typeof image !== 'string' || image.length > 512)))) {
            throw new BadRequestException(Message.BAD_REQUEST);
        }
        return {
            ...(reviewMessage != null ? { reviewMessage } : {}),
            ...(reviewImages != null ? { reviewImages } : {}),
            ...(reviewRating != null ? { reviewRating } : {}),
        };
    }

    private buildReviewStats(distribution: { _id: number; count: number }[], totalReviews: number): ReviewStats {
        const countsByStar = new Map(distribution.map((entry) => [entry._id, entry.count]));
        const ratingDistribution = [5, 4, 3, 2, 1].map((star) => {
            const count = countsByStar.get(star) ?? 0;
            return { star, count, percentage: totalReviews ? Math.round((count / totalReviews) * 100) : 0 };
        });

        const ratingSum = distribution.reduce((sum, entry) => sum + entry._id * entry.count, 0);
        const averageRating = totalReviews ? Math.round((ratingSum / totalReviews) * 10) / 10 : 0;

        return { totalReviews, averageRating, ratingDistribution };
    }
}
