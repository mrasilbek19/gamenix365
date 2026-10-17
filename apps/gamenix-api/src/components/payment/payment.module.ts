import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentResolver } from './payment.resolver';
import { PaymentCoreModule } from './payment-core.module';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
    imports: [AuthModule, PaymentCoreModule],
    controllers: [PaymentWebhookController],
    providers: [PaymentResolver],
    exports: [PaymentCoreModule],
})
export class PaymentModule {}
