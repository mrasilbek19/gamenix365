import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PortoneService } from './portone.service';
import { PaymentResolver } from './payment.resolver';

@Module({
	imports: [HttpModule],
	providers: [PortoneService, PaymentResolver],
	exports: [PortoneService],
})
export class PaymentModule {}
