import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from "bcryptjs";
import { Member } from '../../libs/dto/member/member';
import { T } from '../../libs/types/common';
import { JwtService } from '@nestjs/jwt';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { isEmail } from 'class-validator';

@Injectable()
export class AuthService {
    private readonly googleClient = new OAuth2Client();

    public async verifyGoogleToken(idToken: string): Promise<TokenPayload> {
        const audience = process.env.GOOGLE_CLIENT_ID?.trim();
        if (!audience) throw new ServiceUnavailableException('Google sign-in is not configured.');
        if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 8192) {
            throw new UnauthorizedException('Invalid or expired Google credential.');
        }
        try {
            // Google's official verifier checks the signature, audience, issuer and token times.
            const ticket = await this.googleClient.verifyIdToken({ idToken, audience });
            const payload = ticket.getPayload();
            if (!payload || payload.aud !== audience ||
                !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) ||
                !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now() ||
                typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 255 ||
                payload.email_verified !== true || typeof payload.email !== 'string' || !isEmail(payload.email)) {
                throw new Error('Invalid Google claims');
            }
            return payload;
        } catch {
            // Provider errors may contain tokens; never log or return them.
            throw new UnauthorizedException('Invalid or expired Google credential.');
        }
    }


    constructor(private jwtService: JwtService) { }

    public async hashPassword(memberPassword: string): Promise<string> {
        const salt = await bcrypt.genSalt();
        return await bcrypt.hash(memberPassword, salt);
    }

    public async comparePassword(password: string, hashedpassword: string): Promise<boolean> {
        return await bcrypt.compare(password, hashedpassword);
    }

    public async createToken(member: Member): Promise<string> {
        const payload: T = {};
        Object.keys(member['_doc'] ? member['_doc'] : member).map((ele) => {
            payload[`${ele}`] = member[`${ele}`];
        });
        delete payload.memberPassword;
        delete payload.googleSubject;
        delete payload.memberEmail;
        delete payload.memberEmailVerified;
        delete payload.memberEmailVersion;
        delete payload.emailVerificationRequestedAt;
        delete payload.emailVerificationWindowStart;
        delete payload.emailVerificationRequests;
        delete payload.passwordResetRequestedAt;
        delete payload.passwordResetWindowStart;
        delete payload.passwordResetRequests;
        return await this.jwtService.signAsync(payload);
    }

    public async verifyToken(token: string): Promise<Member> {
        const member = await this.jwtService.verifyAsync(token);
        member._id = shapeIntoMongoObjectId(member._id);
        return member;
    }

}
