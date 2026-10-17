import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import PaymentSchema from '../../schemas/Payment.model';
import PaymentEventSchema from '../../schemas/PaymentEvent.model';
import OrderSchema from '../../schemas/Order.model';
import OrderItemSchema from '../../schemas/OrderItem.model';
import ProductSchema from '../../schemas/Product.model';
import MemberSchema from '../../schemas/Member.model';
import { HttpModule } from '@nestjs/axios';
import { PortoneService } from './portone.service';
import { PaymentSnapshotService } from './payment-snapshot.service';
import { PaymentWorkflowService } from './payment-workflow.service';
import { PaymentService } from './payment.service';

/** Shared by API and batch; no resolver/auth dependency and checkout remains gated pending account verification. */
@Module({
    imports: [ConfigModule, HttpModule, MongooseModule.forFeature([
        { name: 'Payment', schema: PaymentSchema }, { name: 'PaymentEvent', schema: PaymentEventSchema },
        { name: 'Order', schema: OrderSchema }, { name: 'OrderItem', schema: OrderItemSchema },
        { name: 'Product', schema: ProductSchema }, { name: 'Member', schema: MemberSchema },
    ])],
    providers: [PaymentService, PaymentSnapshotService, PaymentWorkflowService,
        PortoneService],
    exports: [PaymentService, PaymentWorkflowService, PortoneService],
})
export class PaymentModule {}
