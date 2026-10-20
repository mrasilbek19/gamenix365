import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { MemberService } from './member.service';
import { BadRequestException, InternalServerErrorException, UseGuards } from '@nestjs/common';
import { AgentsInquiry, LoginInput, MemberInput, MembersInquiry, PasswordResetInput, PasswordResetRequestInput, PasswordResetVerifyInput } from '../../libs/dto/member/member.input';
import { Member, Members } from '../../libs/dto/member/member';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { ObjectId } from 'mongoose';
import { MemberType } from '../../libs/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { getSerialForImage, shapeIntoMongoObjectId, validMimeTypes } from '../../libs/config';
import { WithoutGuard } from '../auth/guards/without.guard';
import { Message } from '../../libs/enums/common.enum';
import { GraphQLUpload, FileUpload } from 'graphql-upload';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';

@Resolver(() => Member)
export class MemberResolver {
    constructor(private readonly memberService: MemberService) { }

    // Applies to every Member result, including members loaded through aggregation lookups.
    @ResolveField(() => String, { nullable: true })
    public async memberEmail(@Parent() member: Member, @AuthMember('_id') memberId: ObjectId): Promise<string | null> {
        if (!memberId || String(memberId) !== String(member._id)) return null;
        const result = await this.memberService.getMemberEmail(memberId);
        return result?.memberEmail ?? null;
    }

    @ResolveField(() => Boolean, { nullable: true })
    public async memberEmailVerified(@Parent() member: Member, @AuthMember('_id') memberId: ObjectId): Promise<boolean | null> {
        if (!memberId || String(memberId) !== String(member._id)) return null;
        const result = await this.memberService.getMemberEmail(memberId);
        return result ? result.memberEmailVerified ?? false : null;
    }

    @Mutation(() => Member)
    public async signup(@Args('input') input: MemberInput): Promise<Member> {
        console.log('Mutation: signup');
        return await this.memberService.signup(input);
    }

    @Mutation(() => Member)
    public async login(@Args('input') input: LoginInput): Promise<Member> {
        console.log('Mutation: login');
        return await this.memberService.login(input);
    }

    @Mutation(() => Boolean)
    public async requestPasswordReset(@Args('input') input: PasswordResetRequestInput): Promise<boolean> {
        return await this.memberService.requestPasswordReset(input);
    }

    @Mutation(() => String)
    public async verifyPasswordResetCode(@Args('input') input: PasswordResetVerifyInput): Promise<string> {
        return await this.memberService.verifyPasswordResetCode(input);
    }

    @Mutation(() => Boolean)
    public async resetPassword(@Args('input') input: PasswordResetInput): Promise<boolean> {
        return await this.memberService.resetPassword(input);
    }

    @UseGuards(AuthGuard)
    @Mutation(() => Member)
    public async updateMember(
        @Args('input') input: MemberUpdate,
        @AuthMember('_id') memberId: ObjectId
    ): Promise<Member> {
        console.log('Mutation: updateMember');
        if (input.shopName !== undefined && String(input._id) !== String(memberId)) {
            throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
        }
        delete input._id
        return await this.memberService.updateMember(memberId, input);
    }

    @UseGuards(AuthGuard)
    @Query(() => String)
    public async checkAuth(@AuthMember('memberNick') memberNick: string): Promise<string> {
        console.log('Query: checkAuth');
        console.log(" ----------------------> ", memberNick)
        return `Hi ${memberNick}`
    }

    @Roles(MemberType.USER, MemberType.SHOP)
    @UseGuards(RolesGuard)
    @Query(() => String)
    public async checkAuthRoles(@AuthMember() authmember: Member): Promise<string> {
        console.log('Query: checkAuthRoles');
        console.log(" ----------------------> ", authmember.memberType)
        return `Hi ${authmember.memberNick} you are ${authmember.memberType} (memberId: ${authmember._id})`
    }


    @UseGuards(WithoutGuard)
    @Query(() => Member)
    public async getMember(@Args('memberId') input: string,
        @AuthMember('_id') memberId: ObjectId): Promise<Member> {
        console.log('Query: getMember');
        const targetId = shapeIntoMongoObjectId(input)
        return await this.memberService.getMember(memberId, targetId);
    }

    @UseGuards(WithoutGuard)
    @Query(() => Members)
    public async getAgents(
        @Args('input') input: AgentsInquiry,
        @AuthMember('_id') memberId: ObjectId,
    ): Promise<Members> {
        console.log('Query: getAgents');
        return await this.memberService.getAgents(memberId, input);
    }

    @UseGuards(AuthGuard)
    @Mutation(() => Member)
    public async likeTargetMember(
        @Args('memberId') input: string,
        @AuthMember('_id') memberId: ObjectId,
    ): Promise<Member> {
        console.log('Mutation: likeTargetMember');
        const likeRefId = shapeIntoMongoObjectId(input);
        return await this.memberService.likeTargetMember(memberId, likeRefId);
    }


    /* ADMIN */
    @Roles(MemberType.ADMIN)
    @UseGuards(RolesGuard)
    @Query(() => Members)
    public async getAllMembersByAdmin(
        @Args('input') input: MembersInquiry,
    ): Promise<Members> {
        console.log('Query: getAllMembersByAdmin');
        return await this.memberService.getAllMembersByAdmin(input);
    }
    @Roles(MemberType.ADMIN)
    @UseGuards(RolesGuard)
    @Mutation(() => Member)
    public async updateMemberByAdmin(@Args('input') input: MemberUpdate,): Promise<Member> {
        console.log('Mutation: updateMember');
        return this.memberService.updateMemberByAdmin(input);
    }


    private async prepareUploadTarget(target: String): Promise<void> {
        if (!['member', 'article', 'property', 'product', 'event'].includes(String(target))) {
            throw new Error('Invalid upload target');
        }
        await mkdir(`uploads/${target}`, { recursive: true });
    }

    /* Uploader */

    @UseGuards(AuthGuard)
    @Mutation((returns) => String)
    public async imageUploader(
        @Args({ name: 'file', type: () => GraphQLUpload })
        { createReadStream, filename, mimetype }: FileUpload,
        @Args('target') target: String,
    ): Promise<string> {
        console.log('Mutation: imageUploader');

        if (!filename) throw new Error(Message.UPLOAD_FAILED);
        const validMime = validMimeTypes.includes(mimetype);
        if (!validMime) throw new Error(Message.PROVIDE_ALLOWED_FORMAT);

        await this.prepareUploadTarget(target);
        const imageName = getSerialForImage(filename);
        const url = `uploads/${target}/${imageName}`;
        const stream = createReadStream();

        const result = await new Promise((resolve, reject) => {
            stream
                .pipe(createWriteStream(url))
                .on('finish', async () => resolve(true))
                .on('error', () => reject(false));
        });
        if (!result) throw new Error(Message.UPLOAD_FAILED);

        return url;
    }

    @UseGuards(AuthGuard)
    @Mutation((returns) => [String])
    public async imagesUploader(
        @Args('files', { type: () => [GraphQLUpload] })
        files: Promise<FileUpload>[],
        @Args('target') target: String,
    ): Promise<string[]> {
        console.log('Mutation: imagesUploader');

        await this.prepareUploadTarget(target);
        const uploadedImages = [];
        const promisedList = files.map(async (img: Promise<FileUpload>, index: number): Promise<Promise<void>> => {
            try {
                const { filename, mimetype, encoding, createReadStream } = await img;

                const validMime = validMimeTypes.includes(mimetype);
                if (!validMime) throw new Error(Message.PROVIDE_ALLOWED_FORMAT);

                const imageName = getSerialForImage(filename);
                const url = `uploads/${target}/${imageName}`;
                const stream = createReadStream();

                const result = await new Promise((resolve, reject) => {
                    stream
                        .pipe(createWriteStream(url))
                        .on('finish', () => resolve(true))
                        .on('error', () => reject(false));
                });
                if (!result) throw new Error(Message.UPLOAD_FAILED);

                uploadedImages[index] = url;
            } catch (err) {
                console.log('Error, file missing!');
            }
        });

        await Promise.all(promisedList);
        return uploadedImages;
    }

}
