import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ReviewGroup } from '../../enums/review.enum';
import { Field, InputType, Int } from '@nestjs/graphql';
import { Direction } from '../../enums/common.enum';
import { availableReviewSorts } from '../../config';
import { Types } from 'mongoose';

@InputType()
export class ReviewInput {
	@IsMongoId()
	@Field(() => String)
	reviewRefId: string;

	@IsEnum(ReviewGroup)
	@Field(() => ReviewGroup)
	reviewGroup: ReviewGroup;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10)
	@IsString({ each: true })
	@MaxLength(512, { each: true })
	@Field(() => [String], { nullable: true })
	reviewImages?: string[];

	@IsOptional()
	@IsString()
	@MaxLength(1000)
	@Field(() => String, { nullable: true })
	reviewMessage?: string;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Max(5)
	@Field(() => Int)
	reviewRating: number;

	memberId?: Types.ObjectId;
}

@InputType()
class RISearch {
	@IsEnum(ReviewGroup)
	@Field(() => ReviewGroup)
	reviewGroup: ReviewGroup;

	@IsMongoId()
	@Field(() => String)
	reviewRefId: string;
}

@InputType()
export class ReviewsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableReviewSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsEnum(Direction)
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@ValidateNested()
	@Type(() => RISearch)
	@IsNotEmpty()
	@Field(() => RISearch)
	search: RISearch;
}
