import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentWorkflowService } from '../../gamenix-api/src/components/payment/payment-workflow.service';

@Injectable()
export class PaymentWorker {
    private readonly logger = new Logger(PaymentWorker.name);
    private running = false;

    constructor(private readonly payments: PaymentWorkflowService) {}

    @Cron('*/30 * * * * *', { name: 'SANDBOX_PAYMENT_RECONCILIATION' })
    public async reconcile(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.payments.processDueEvents();
            await this.payments.processDuePayments();
        } catch {
            // Provider exceptions/raw payloads may contain credentials; never log them.
            this.logger.error('Payment reconciliation interrupted; durable claims recover after lease expiry');
        } finally { this.running = false; }
    }
}
