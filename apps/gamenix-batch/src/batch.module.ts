import { Module } from '@nestjs/common';
import { BatchController } from './batch.controller';
import { BatchService } from './batch.service';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import ProductSchema from 'apps/gamenix-api/src/schemas/Product.model';
import MemberSchema from 'apps/gamenix-api/src/schemas/Member.model';
import { OrderEmailModule } from '../../gamenix-api/src/components/order-email/order-email.module';
import { OrderEmailWorker } from './order-email.worker';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseModule,
    ScheduleModule.forRoot(),
    OrderEmailModule,
    MongooseModule.forFeature([{ name: 'Product', schema: ProductSchema }]),
    MongooseModule.forFeature([{ name: "Member", schema: MemberSchema }]),
  ],
  controllers: [BatchController],
  providers: [BatchService, OrderEmailWorker],
})
export class BatchModule { }
