import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import PaymentSchema from '../../schemas/Payment.model';
import PaymentEventSchema from '../../schemas/PaymentEvent.model';
import { AuthModule } from '../auth/auth.module';
import { PaymentResolver } from './payment.resolver';
import { PaymentService } from './payment.service';

@Module({
    imports: [
        AuthModule,
        MongooseModule.forFeature([
            { name: 'Payment', schema: PaymentSchema },
            { name: 'PaymentEvent', schema: PaymentEventSchema },
        ]),
    ],
    providers: [PaymentResolver, PaymentService],
    exports: [PaymentService],
})
export class PaymentModule {}
