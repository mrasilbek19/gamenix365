import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { MemberAuthType, MemberStatus, MemberType } from '../../enums/member.enum';
import { availableAgentSorts, availableMemberSorts } from '../../config';
import { Direction } from '../../enums/common.enum';

@InputType()
export class MemberInput {
    @IsNotEmpty()
    @Length(3, 12)
    @Field(() => String)
    memberNick: string;

    @IsNotEmpty()
    @Length(5, 12)
    @Field(() => String)
    memberPassword: string;

    @IsNotEmpty()
    @Field(() => String)
    memberPhone: string;

    @ValidateIf((_, value) => value !== undefined)
    @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
    @IsString()
    @Length(1, 100)
    @Field(() => String, { nullable: true })
    shopName?: string;

    @IsOptional()
    @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
    @IsEmail()
    @Field(() => String, { nullable: true })
    memberEmail?: string;

    @IsOptional()
    @IsString()
    @Field(() => String, { nullable: true })
    memberAddress?: string;

    @IsOptional()
    @Field(() => MemberType, { nullable: true })
    memberType?: MemberType;

    @IsOptional()
    @Field(() => MemberAuthType, { nullable: true })
    memberAuthType?: MemberAuthType;
}

@InputType()
export class GoogleLoginInput {
    @IsString()
    @Length(20, 8192)
    @Field(() => String)
    idToken: string;
}

@InputType()
export class LoginInput {
    @IsNotEmpty()
    @Length(3, 12)
    @Field(() => String)
    memberNick: string;

    @IsNotEmpty()
    @Length(5, 12)
    @Field(() => String)
    memberPassword: string;
}

@InputType()
export class PasswordResetRequestInput {
    @Length(3, 12)
    @Field(() => String)
    memberNick: string;

    @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
    @IsEmail()
    @Length(1, 254)
    @Field(() => String)
    memberEmail: string;
}

@InputType()
export class PasswordResetVerifyInput {
    @Length(3, 12)
    @Field(() => String)
    memberNick: string;

    @Matches(/^\d{6}$/)
    @Field(() => String)
    code: string;
}

@InputType()
export class PasswordResetInput {
    @Matches(/^[a-f0-9]{64}$/)
    @Field(() => String)
    resetToken: string;

    @Length(5, 12)
    @Matches(/\S/)
    @Field(() => String)
    memberPassword: string;
}


@InputType()
class AISearch {
    @IsOptional()
    @Field(() => String, { nullable: true })
    text?: string;
}

@InputType()
export class AgentsInquiry {
    @IsNotEmpty()
    @Min(1)
    @Field(() => Int)
    page: number;

    @IsNotEmpty()
    @Min(1)
    @Field(() => Int)
    limit: number;

    @IsOptional()
    @IsIn(availableAgentSorts)
    @Field(() => String, { nullable: true })
    sort?: string;

    @IsOptional()
    @Field(() => Direction, { nullable: true })
    direction?: Direction;

    @IsNotEmpty()
    @Field(() => AISearch)
    search: AISearch;
}


@InputType()
class MISearch {
    @IsOptional()
    @Field(() => MemberStatus, { nullable: true })
    memberStatus?: MemberStatus;

    @IsOptional()
    @Field(() => MemberType, { nullable: true })
    memberType?: MemberType;

    @IsOptional()
    @Field(() => String, { nullable: true })
    text?: string;
}

@InputType()
export class MembersInquiry {
    @IsNotEmpty()
    @Min(1)
    @Field(() => Int)
    page: number;

    @IsNotEmpty()
    @Min(1)
    @Field(() => Int)
    limit: number;

    @IsOptional()
    @IsIn(availableMemberSorts)
    @Field(() => String, { nullable: true })
    sort?: string;

    @IsOptional()
    @Field(() => Direction, { nullable: true })
    direction?: Direction;

    @IsNotEmpty()
    @Field(() => MISearch)
    search: MISearch;
}
