import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module';
import { ProductModule } from './product/product.module';
import { AuthModule } from './auth/auth.module';
import { CommentModule } from './comment/comment.module';
import { LikeModule } from './like/like.module';
import { ViewModule } from './view/view.module';
import { FollowModule } from './follow/follow.module';
import { BoardArticleModule } from './board-article/board-article.module';
import { EventModule } from './event/event.module';
import { OrderModule } from './order/order.module';
import { EmailVerificationModule } from './email-verification/email-verification.module';
import { NotificationModule } from './notification/notification.module';
import { ReviewModule } from './review/review.module';
import { PaymentResolver } from './payment/payment.resolver';
import { PaymentWebhookController } from './payment/payment-webhook.controller';
import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [
    MemberModule,
    AuthModule,
    ProductModule,
    BoardArticleModule,
    CommentModule,
    LikeModule,
    ViewModule,
    FollowModule,
    EventModule,
    OrderModule,
    EmailVerificationModule,
    NotificationModule,
    PaymentModule,
    ReviewModule,
  ],
  controllers: [PaymentWebhookController],
  providers: [PaymentResolver],
})
export class ComponentsModule { }
