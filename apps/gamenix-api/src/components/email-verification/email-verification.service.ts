import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isEmail } from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import { Connection, Model, ObjectId, Types } from 'mongoose';
import { AuthToken } from '../../libs/dto/auth/auth-token';
import { Member } from '../../libs/dto/member/member';
import { AuthTokenPurpose } from '../../libs/enums/auth-token.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notification/notification.service';

const eligibleMember = { deletedAt: null, $or: [
    { memberStatus: MemberStatus.ACTIVE },
    { memberStatus: MemberStatus.PENDING, memberType: MemberType.SHOP },
] };
const invalidToken = () => new BadRequestException('Invalid or expired verification link');

@Injectable()
export class EmailVerificationService implements OnModuleInit {
    private readonly frontendOrigin: string;
    private readonly ipLimits = new Map<string, { count: number; expiresAt: number }>();
    private lastPrunedAt = 0;

    constructor(
        @InjectModel('Member') private readonly memberModel: Model<Member>,
        @InjectModel('AuthToken') private readonly tokenModel: Model<AuthToken>,
        @InjectConnection() private readonly connection: Connection,
        private readonly mailService: MailService,
        config: ConfigService,
        @Optional() private readonly notificationService?: NotificationService,
    ) {
        const environment = config.get<string>('NODE_ENV');
        const origin = config.get<string>('FRONTEND_ORIGIN') ?? (environment === 'production' ? '' : 'http://localhost:3000');
        try {
            const url = new URL(origin);
            const localHttp = environment !== 'production' && url.protocol === 'http:' &&
                ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
            if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
                throw new Error();
            }
            this.frontendOrigin = url.origin;
        } catch {
            throw new Error('FRONTEND_ORIGIN must be a trusted HTTPS origin (loopback HTTP is allowed outside production)');
        }
    }

    public async onModuleInit(): Promise<void> {
        const hello = await this.connection.db.admin().command({ hello: 1 });
        if ((!hello.setName && hello.msg !== 'isdbgrid') || hello.logicalSessionTimeoutMinutes == null ||
            hello.maxWireVersion < (hello.msg === 'isdbgrid' ? 8 : 7)) {
            throw new Error('Email verification requires MongoDB transactions; use a replica set or sharded cluster');
        }
        await this.tokenModel.init();
    }

    public async requestEmailVerification(memberId: ObjectId, ip?: string): Promise<boolean> {
        this.checkIpLimit('request', ip, 20);
        const token = randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(token);
        const session = await this.connection.startSession();
        let recipient: { email: string; name: string };
        try {
            await session.withTransaction(async () => {
                recipient = undefined;
                const now = new Date();
                const member = await this.memberModel.findOne({ _id: memberId, ...eligibleMember })
                    .select('memberEmail memberEmailVerified memberEmailVersion emailVerificationRequestedAt emailVerificationWindowStart emailVerificationRequests memberNick shopName')
                    .session(session).lean().exec();
                if (!member) throw new ForbiddenException('An eligible account is required');
                if (!member.memberEmail || !isEmail(member.memberEmail)) throw new BadRequestException('Add an email address before requesting verification');
                if (member.memberEmailVerified) return;
                if (member.emailVerificationRequestedAt && now.getTime() - member.emailVerificationRequestedAt.getTime() < 60000) {
                    throw new HttpException('Wait 60 seconds before requesting another verification email', HttpStatus.TOO_MANY_REQUESTS);
                }
                const sameWindow = member.emailVerificationWindowStart && now.getTime() - member.emailVerificationWindowStart.getTime() < 3600000;
                const count = sameWindow ? member.emailVerificationRequests ?? 0 : 0;
                if (count >= 5) throw new HttpException('Verification email limit reached; try again later', HttpStatus.TOO_MANY_REQUESTS);
                // This member write serializes concurrent resends and conflicts with email changes.
                await this.memberModel.updateOne({ _id: memberId }, { $set: {
                    emailVerificationRequestedAt: now,
                    emailVerificationWindowStart: sameWindow ? member.emailVerificationWindowStart : now,
                    emailVerificationRequests: count + 1,
                } }, { session }).exec();
                await this.tokenModel.updateMany({ memberId, purpose: AuthTokenPurpose.EMAIL_VERIFICATION, consumedAt: null },
                    { $set: { consumedAt: now } }, { session }).exec();
                await this.tokenModel.create([{
                    memberId: new Types.ObjectId(String(memberId)), purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
                    emailSnapshot: member.memberEmail, emailVersion: member.memberEmailVersion ?? 0,
                    tokenHash, expiresAt: new Date(now.getTime() + 15 * 60000), consumedAt: null,
                }], { session });
                recipient = { email: member.memberEmail, name: member.shopName || member.memberNick };
            }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
        } finally {
            await session.endSession();
        }
        if (recipient) {
            const link = new URL('/account/verify-email', this.frontendOrigin);
            // Fragments stay out of web-server access logs and Referer headers.
            link.hash = `token=${token}`;
            try {
                await this.mailService.sendEmailVerification(recipient.email, recipient.name, link.toString());
            } catch {
                await this.tokenModel.updateOne({ tokenHash }, { $set: { consumedAt: new Date() } }).exec();
                throw new ServiceUnavailableException('Verification email could not be sent; try again after the cooldown');
            }
        }
        return true;
    }

    public async verifyEmail(token: string, ip?: string): Promise<boolean> {
        this.checkIpLimit('verify', ip, 60);
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw invalidToken();
        const session = await this.connection.startSession();
        let verifiedMemberId: Types.ObjectId;
        try {
            await session.withTransaction(async () => {
                const now = new Date();
                const grant = await this.tokenModel.findOneAndUpdate({
                    tokenHash: this.hashToken(token), purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
                    expiresAt: { $gt: now }, consumedAt: null,
                }, { $set: { consumedAt: now } }, { new: true, session }).lean().exec();
                if (!grant) throw invalidToken();
                verifiedMemberId = grant.memberId;
                const member = await this.memberModel.updateOne({
                    _id: grant.memberId, memberEmail: grant.emailSnapshot, ...eligibleMember,
                    $expr: { $eq: [{ $ifNull: ['$memberEmailVersion', 0] }, grant.emailVersion] },
                }, { $set: { memberEmailVerified: true } }, { session }).exec();
                if (!member.matchedCount) throw invalidToken();
            }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
        } finally {
            await session.endSession();
        }
        await this.notificationService?.notifyEmailVerified(verifiedMemberId);
        return true;
    }

    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    private checkIpLimit(operation: string, ip: string, maximum: number): void {
        const now = Date.now();
        if (now - this.lastPrunedAt >= 60000) {
            for (const [key, value] of this.ipLimits) if (value.expiresAt <= now) this.ipLimits.delete(key);
            this.lastPrunedAt = now;
        }
        const key = `${operation}:${this.hashToken(ip || 'unknown')}`;
        const existing = this.ipLimits.get(key);
        const window = existing && existing.expiresAt > now ? existing : { count: 0, expiresAt: now + 15 * 60000 };
        if (window.count >= maximum || (!existing && this.ipLimits.size >= 10000)) {
            throw new HttpException('Too many verification attempts; try again later', HttpStatus.TOO_MANY_REQUESTS);
        }
        window.count++;
        this.ipLimits.set(key, window);
    }
}
