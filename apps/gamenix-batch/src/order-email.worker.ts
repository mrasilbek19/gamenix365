import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderEmailService } from '../../gamenix-api/src/components/order-email/order-email.service';

@Injectable()
export class OrderEmailWorker {
    private readonly logger = new Logger(OrderEmailWorker.name);
    private running = false;

    constructor(private readonly orderEmailService: OrderEmailService) {}

    @Cron('*/30 * * * * *', { name: 'ORDER_EMAIL_DELIVERIES' })
    public async deliverOrderEmails(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.orderEmailService.processDueEmails();
        } catch {
            this.logger.error('Order email batch failed; pending records will be retried');
        } finally {
            this.running = false;
        }
    }
}
