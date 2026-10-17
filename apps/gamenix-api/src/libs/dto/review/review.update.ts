import { Field, InputType, Int } from '@nestjs/graphql';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ReviewStatus } from '../../enums/review.enum';

@InputType()
export class ReviewUpdate {
	@IsMongoId()
	@Field(() => String)
	reviewId: string;

	@IsOptional()
	@IsString()
	@MaxLength(1000)
	@Field(() => String, { nullable: true })
	reviewMessage?: string;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10)
	@IsString({ each: true })
	@MaxLength(512, { each: true })
	@Field(() => [String], { nullable: true })
	reviewImages?: string[];

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(5)
	@Field(() => Int, { nullable: true })
	reviewRating?: number;
}

@InputType()
export class AdminReviewUpdate {
	@IsMongoId()
	@Field(() => String)
	reviewId: string;

	@IsOptional()
	@IsEnum(ReviewStatus)
	@Field(() => ReviewStatus, { nullable: true })
	reviewStatus?: ReviewStatus;
}
