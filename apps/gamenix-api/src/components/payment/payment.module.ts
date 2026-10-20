import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PortoneService } from './portone.service';

@Module({
	imports: [HttpModule],
	providers: [PortoneService],
	exports: [PortoneService],
})
export class PaymentModule {}
