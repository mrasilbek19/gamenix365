import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { Payment } from '../../libs/dto/payment/payment';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { PaymentService } from './payment.service';
import { PaymentWorkflowService } from './payment-workflow.service';
import { TestCheckoutInput } from '../../libs/dto/payment/checkout-session.input';
import { TestCheckoutAvailability, TestCheckoutSession } from '../../libs/dto/payment/checkout-session';

@Resolver()
export class PaymentResolver {
    constructor(private readonly paymentService: PaymentService, private readonly workflow: PaymentWorkflowService) {}

    @UseGuards(AuthGuard)
    @Query(() => TestCheckoutAvailability)
    public getTestCheckoutAvailability(): Promise<TestCheckoutAvailability> {
        return this.workflow.availability();
    }

    @UseGuards(AuthGuard)
    @Mutation(() => TestCheckoutSession)
    public createTestCheckoutSession(
        @Args('input') input: TestCheckoutInput,
        @AuthMember('_id') memberId: Types.ObjectId,
    ): Promise<TestCheckoutSession> {
        return this.workflow.createSession(memberId, input);
    }

    @UseGuards(AuthGuard)
    @Query(() => Payment)
    public async getPaymentStatus(
        @Args('paymentId', { type: () => String }) paymentId: string,
        @AuthMember('_id') memberId: Types.ObjectId,
    ): Promise<Payment> {
        return await this.paymentService.getPaymentStatus(memberId, paymentId);
    }
}
