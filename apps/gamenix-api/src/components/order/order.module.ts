import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderResolver } from './order.resolver';
import { OrderService } from './order.service';
import OrderSchema from '../../schemas/Order.model';
import OrderItemSchema from '../../schemas/OrderItem.model';
import ProductSchema from '../../schemas/Product.model';
import MemberSchema from '../../schemas/Member.model';
import { AuthModule } from '../auth/auth.module';
import { MemberModule } from '../member/member.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderEmailModule } from '../order-email/order-email.module';
import { PaymentCoreModule } from '../payment/payment-core.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: 'Order',
        schema: OrderSchema,
      },
      { name: 'OrderItem', schema: OrderItemSchema },
      { name: 'Product', schema: ProductSchema },
      { name: 'Member', schema: MemberSchema },
    ]),
    AuthModule,
    MemberModule,
    NotificationModule,
    OrderEmailModule,
    PaymentCoreModule,
  ],
  providers: [OrderResolver, OrderService],
  exports: [OrderService],
})
export class OrderModule { }
