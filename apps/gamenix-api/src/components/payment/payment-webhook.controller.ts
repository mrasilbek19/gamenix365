import { Controller, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentWorkflowService } from './payment-workflow.service';

@Controller('payments')
export class PaymentWebhookController {
    constructor(private readonly workflow: PaymentWorkflowService) {}

    @Post('webhook')
    @HttpCode(200)
    public receive(@Req() request: RawBodyRequest<Request>) {
        // No JSON reserialization fallback: signature verification requires the original bytes.
        return this.workflow.receiveWebhook(request.rawBody, request.headers);
    }
}
