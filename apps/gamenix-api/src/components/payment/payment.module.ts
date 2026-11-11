import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { DirectKakaoPayService } from './direct-kakaopay.service';
import { DirectKakaoCheckoutService } from './direct-kakao-checkout.service';
import { PaymentService } from './payment.service';
import { PaymentResolver } from './payment.resolver';
import { AuthModule } from '../auth/auth.module';
import KakaoPayPaymentSchema from '../../libs/schemas/KakaoPayPayment.model';
import OrderSchema from '../../schemas/Order.model';
import OrderItemSchema from '../../schemas/OrderItem.model';
import MemberSchema from '../../schemas/Member.model';
import ProductSchema from '../../schemas/Product.model';

// Direct KakaoPay uses only backend developer credentials; orders keep their existing business logic.
@Module({
    imports: [HttpModule, AuthModule, MongooseModule.forFeature([
        { name: 'KakaoPayPayment', schema: KakaoPayPaymentSchema },
        { name: 'Order', schema: OrderSchema },
        { name: 'OrderItem', schema: OrderItemSchema },
        { name: 'Member', schema: MemberSchema },
        { name: 'Product', schema: ProductSchema },
    ])],
    providers: [DirectKakaoPayService, DirectKakaoCheckoutService, PaymentService, PaymentResolver],
    exports: [DirectKakaoPayService],
})
export class PaymentModule {}
