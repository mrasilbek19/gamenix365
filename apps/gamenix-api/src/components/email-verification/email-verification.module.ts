import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import AuthTokenSchema from '../../schemas/AuthToken.model';
import MemberSchema from '../../schemas/Member.model';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { EmailVerificationResolver } from './email-verification.resolver';
import { EmailVerificationService } from './email-verification.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
    imports: [ConfigModule, AuthModule, MailModule, NotificationModule, MongooseModule.forFeature([
        { name: 'Member', schema: MemberSchema }, { name: 'AuthToken', schema: AuthTokenSchema },
    ])],
    providers: [EmailVerificationResolver, EmailVerificationService],
    exports: [EmailVerificationService],
})
export class EmailVerificationModule { }
