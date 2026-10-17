import { AdminReviewUpdate, ReviewUpdate } from '../../libs/dto/review/review.update';
import { ReviewInput, ReviewsInquiry } from '../../libs/dto/review/review.input';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Review, Reviews } from '../../libs/dto/review/review';
import { WithoutGuard } from '../auth/guards/without.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ReviewService } from './review.service';
import { UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';

@Resolver()
export class ReviewResolver {
    constructor(private readonly reviewService: ReviewService) { }

    @UseGuards(AuthGuard)
    @Mutation((returns) => Review)
    public async createNewReview(
        @Args('input') input: ReviewInput,
        @AuthMember('_id') memberId: Types.ObjectId,
    ): Promise<Review> {
        console.log('Mutation: createNewReview');
        return await this.reviewService.createNewReview(memberId, input);
    }

    @UseGuards(AuthGuard)
    @Mutation((returns) => Review)
    public async updateReview(
        @Args('input') input: ReviewUpdate,
        @AuthMember('_id') memberId: Types.ObjectId,
    ): Promise<Review> {
        console.log('Mutation: updateReview');
        return await this.reviewService.updateReview(memberId, input);
    }

    @UseGuards(WithoutGuard)
    @Query((returns) => Reviews)
    public async getReviews(@Args('input') input: ReviewsInquiry): Promise<Reviews> {
        console.log('Query: getReviews');
        return await this.reviewService.getReviews(input);
    }

    /** ADMIN */

    @Roles(MemberType.ADMIN)
    @UseGuards(RolesGuard)
    @Mutation((returns) => Review)
    public async updateReviewByAdmin(
        @Args('input') input: AdminReviewUpdate,
        @AuthMember('_id') memberId: Types.ObjectId,
    ): Promise<Review> {
        console.log('Mutation: updateReviewByAdmin');
        return await this.reviewService.updateReviewByAdmin(memberId, input);
    }

    @Roles(MemberType.ADMIN)
    @UseGuards(RolesGuard)
    @Mutation((returns) => Review)
    public async removeReviewByAdmin(
        @Args('reviewId') input: string,
        @AuthMember('_id') memberId: Types.ObjectId,
    ): Promise<Review> {
        console.log('Mutation: removeReviewByAdmin');
        return await this.reviewService.removeReviewByAdmin(memberId, input);
    }
}
