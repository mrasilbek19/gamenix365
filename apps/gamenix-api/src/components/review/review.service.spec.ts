import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ReviewService } from './review.service';
import { ReviewGroup, ReviewStatus } from '../../libs/enums/review.enum';
import { MemberType } from '../../libs/enums/member.enum';
import ReviewSchema from '../../schemas/Review.model';

const query = (value: any) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('Petora reviews adapted to Gamenix', () => {
    const memberId = new Types.ObjectId();
    const shopId = new Types.ObjectId();
    const productId = new Types.ObjectId();
    const reviewId = new Types.ObjectId();
    const input = { reviewRefId: String(productId), reviewGroup: ReviewGroup.PRODUCT, reviewRating: 5 };
    let reviews: any;
    let members: any;
    let products: any;
    let service: ReviewService;

    beforeEach(() => {
        reviews = {
            create: jest.fn().mockImplementation(async (record) => ({ _id: reviewId, ...record })),
            findOneAndUpdate: jest.fn(() => query(null)),
            findByIdAndUpdate: jest.fn(() => query({ _id: reviewId })),
            findOneAndDelete: jest.fn(() => query({ _id: reviewId })),
            aggregate: jest.fn(() => query([{ list: [], metaCounter: [], distribution: [] }])),
        };
        members = { exists: jest.fn(() => query({ _id: memberId })) };
        products = { findOne: jest.fn(() => query({ memberId: shopId })) };
        service = new ReviewService(reviews, members, products);
    });

    it('binds a product review to the current author and ignores injected ownership/status', async () => {
        const result = await service.createNewReview(memberId, {
            ...input, memberId: shopId, reviewStatus: ReviewStatus.HIDE,
        } as any);
        expect(result).toMatchObject({ memberId, reviewStatus: ReviewStatus.ACTIVE, reviewGroup: ReviewGroup.PRODUCT });
        expect(members.exists).toHaveBeenLastCalledWith(expect.objectContaining({ _id: shopId, memberType: MemberType.SHOP }));
    });

    it('supports SHOP reviews without querying a product', async () => {
        await service.createNewReview(memberId, { ...input, reviewRefId: String(shopId), reviewGroup: ReviewGroup.SHOP });
        expect(products.findOne).not.toHaveBeenCalled();
    });

    it('rejects inactive authors, missing products/shops and self reviews', async () => {
        members.exists.mockReturnValueOnce(query(null));
        await expect(service.createNewReview(memberId, input)).rejects.toBeInstanceOf(ForbiddenException);
        products.findOne.mockReturnValueOnce(query(null));
        await expect(service.createNewReview(memberId, input)).rejects.toBeInstanceOf(NotFoundException);
        members.exists.mockReturnValueOnce(query({})).mockReturnValueOnce(query(null));
        await expect(service.createNewReview(memberId, input)).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.createNewReview(shopId, input)).rejects.toBeInstanceOf(ForbiddenException);
        expect(reviews.create).not.toHaveBeenCalled();
    });

    it.each([0, 6, 2.5, NaN])('rejects invalid star rating %s', async (reviewRating) => {
        await expect(service.createNewReview(memberId, { ...input, reviewRating })).rejects.toBeInstanceOf(BadRequestException);
        expect(reviews.create).not.toHaveBeenCalled();
    });

    it('uses a unique author/group/target index and handles concurrent insert conflicts', async () => {
        expect(ReviewSchema.indexes()).toContainEqual([
            { memberId: 1, reviewGroup: 1, reviewRefId: 1 }, expect.objectContaining({ unique: true }),
        ]);
        reviews.create.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
        await expect(service.createNewReview(memberId, input)).rejects.toThrow('already reviewed');
    });

    it('cannot update another author’s review or change ownership and status', async () => {
        await expect(service.updateReview(memberId, {
            reviewId: String(reviewId), reviewRating: 4, memberId: shopId, reviewStatus: ReviewStatus.DELETE,
        } as any)).rejects.toBeInstanceOf(NotFoundException);
        expect(reviews.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: reviewId, memberId, reviewStatus: ReviewStatus.ACTIVE },
            { $set: { reviewRating: 4 } }, expect.objectContaining({ runValidators: true }),
        );
    });

    it('rechecks the current administrator and only removes DELETE reviews', async () => {
        members.exists.mockReturnValueOnce(query(null));
        await expect(service.updateReviewByAdmin(memberId, {
            reviewId: String(reviewId), reviewStatus: ReviewStatus.HIDE,
        })).rejects.toBeInstanceOf(ForbiddenException);
        expect(members.exists).toHaveBeenLastCalledWith(expect.objectContaining({ memberType: MemberType.ADMIN }));
        expect(reviews.findByIdAndUpdate).not.toHaveBeenCalled();
        await service.updateReviewByAdmin(memberId, { reviewId: String(reviewId), reviewStatus: ReviewStatus.HIDE });
        await service.removeReviewByAdmin(memberId, String(reviewId));
        expect(reviews.findOneAndDelete).toHaveBeenCalledWith({ _id: reviewId, reviewStatus: ReviewStatus.DELETE });
    });

    it('paginates ACTIVE reviews and computes statistics over all matching reviews', async () => {
        reviews.aggregate.mockReturnValueOnce(query([{
            list: [{ _id: reviewId }], metaCounter: [{ total: 3 }], distribution: [{ _id: 5, count: 2 }, { _id: 2, count: 1 }],
        }]));
        const result = await service.getReviews({ page: 2, limit: 2, search: input });
        expect(result.stats).toMatchObject({ totalReviews: 3, averageRating: 4 });
        expect(result.stats.ratingDistribution[0]).toEqual({ star: 5, count: 2, percentage: 67 });
        const pipeline = reviews.aggregate.mock.calls[0][0];
        expect(pipeline[0].$match).toMatchObject({ reviewStatus: ReviewStatus.ACTIVE, reviewRefId: productId });
        expect(pipeline[2].$facet.list.slice(0, 2)).toEqual([{ $skip: 2 }, { $limit: 2 }]);
        expect(pipeline[2].$facet.list[2].$lookup.pipeline[0].$project).toMatchObject({
            memberPassword: 0, memberEmail: 0, passwordResetRequests: 0,
        });
    });

    it('returns empty statistics and rejects unsafe pagination, sort and IDs', async () => {
        expect((await service.getReviews({ page: 1, limit: 10, search: input })).stats).toMatchObject({ totalReviews: 0, averageRating: 0 });
        for (const override of [{ page: 0 }, { limit: 101 }, { sort: 'memberPassword' }, { search: { ...input, reviewRefId: 'bad' } }]) {
            await expect(service.getReviews({ page: 1, limit: 10, search: input, ...override })).rejects.toBeInstanceOf(BadRequestException);
        }
    });
});
