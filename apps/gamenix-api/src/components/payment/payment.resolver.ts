import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { Payment } from '../../libs/dto/payment/payment';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { PaymentService } from './payment.service';

@Resolver()
export class PaymentResolver {
    constructor(private readonly paymentService: PaymentService) {}

    @UseGuards(AuthGuard)
    @Query(() => Payment)
    public async getPaymentStatus(
        @Args('paymentId', { type: () => String }) paymentId: string,
        @AuthMember('_id') memberId: Types.ObjectId,
    ): Promise<Payment> {
        return await this.paymentService.getPaymentStatus(memberId, paymentId);
    }
}
