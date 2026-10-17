import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import EmailDeliverySchema from '../../schemas/EmailDelivery.model';
import MemberSchema from '../../schemas/Member.model';
import OrderSchema from '../../schemas/Order.model';
import OrderItemSchema from '../../schemas/OrderItem.model';
import ProductSchema from '../../schemas/Product.model';
import { MailModule } from '../mail/mail.module';
import { OrderEmailService } from './order-email.service';

@Module({
    imports: [MailModule, MongooseModule.forFeature([
        { name: 'EmailDelivery', schema: EmailDeliverySchema },
        { name: 'Member', schema: MemberSchema },
        { name: 'Order', schema: OrderSchema },
        { name: 'OrderItem', schema: OrderItemSchema },
        { name: 'Product', schema: ProductSchema },
    ])],
    providers: [OrderEmailService],
    exports: [OrderEmailService],
})
export class OrderEmailModule {}
