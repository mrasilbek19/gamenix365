import { ReviewGroup, ReviewStatus } from '../../enums/review.enum';
import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { Member, TotalCounter } from '../member/member';
import { Types } from 'mongoose';

@ObjectType()
export class Review {
	@Field(() => String)
	_id: Types.ObjectId;

	@Field(() => ReviewStatus)
	reviewStatus: ReviewStatus;

	@Field(() => ReviewGroup)
	reviewGroup: ReviewGroup;

	@Field(() => [String], { nullable: true })
	reviewImages?: string[];

	@Field(() => String, { nullable: true })
	reviewMessage?: string;

	@Field(() => Int)
	reviewRating: number;

	@Field(() => String)
	reviewRefId: Types.ObjectId;

	@Field(() => String)
	memberId: Types.ObjectId;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;

	/** from aggregation */

	@Field(() => Member, { nullable: true })
	memberData?: Member;
}

@ObjectType()
export class RatingCount {
	@Field(() => Int)
	star: number;

	@Field(() => Int)
	count: number;

	@Field(() => Float)
	percentage: number;
}

@ObjectType()
export class ReviewStats {
	@Field(() => Int)
	totalReviews: number;

	@Field(() => Float)
	averageRating: number;

	@Field(() => [RatingCount])
	ratingDistribution: RatingCount[];
}

@ObjectType()
export class Reviews {
	@Field(() => [Review])
	list: Review[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter: TotalCounter[];

	@Field(() => ReviewStats)
	stats: ReviewStats;
}
