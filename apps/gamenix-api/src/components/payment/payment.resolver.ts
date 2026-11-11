import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { KakaoPayCheckoutSession, KakaoPayPaymentStatus, KakaoPayTestAvailability } from '../../libs/dto/payment/kakao-checkout';
import { PaymentService } from './payment.service';
import { DirectKakaoPayService } from './direct-kakaopay.service';
import { DirectKakaoCheckoutService } from './direct-kakao-checkout.service';

@Resolver()
export class PaymentResolver {
    constructor(private readonly paymentService: PaymentService,
        private readonly checkoutService: DirectKakaoCheckoutService,
        private readonly kakaopayService: DirectKakaoPayService) {}

    @Query(() => KakaoPayTestAvailability)
    public getKakaoPayTestAvailability(): KakaoPayTestAvailability {
        return this.kakaopayService.getAvailability();
    }

    @UseGuards(AuthGuard)
    @Mutation(() => KakaoPayCheckoutSession)
    public prepareKakaoPayCheckout(@Args('orderId') orderId: string, @AuthMember('_id') memberId: ObjectId) {
        return this.checkoutService.prepareDirectKakaoPayCheckout(memberId, orderId);
    }

    @UseGuards(AuthGuard)
    @Mutation(() => KakaoPayPaymentStatus)
    public approveKakaoPayPayment(@Args('orderId') orderId: string, @Args('state') state: string,
        @Args('pgToken') pgToken: string, @AuthMember('_id') memberId: ObjectId) {
        return this.checkoutService.approveDirectKakaoPayPayment(memberId, orderId, state, pgToken);
    }

    @UseGuards(AuthGuard)
    @Query(() => KakaoPayPaymentStatus)
    public getKakaoPayPaymentStatus(@Args('orderId') orderId: string, @AuthMember('_id') memberId: ObjectId) {
        return this.paymentService.getKakaoPayPaymentStatus(memberId, orderId);
    }

    @UseGuards(AuthGuard)
    @Mutation(() => KakaoPayPaymentStatus)
    public verifyKakaoPayPayment(@Args('orderId') orderId: string, @AuthMember('_id') memberId: ObjectId) {
        return this.checkoutService.verifyDirectKakaoPayPayment(memberId, orderId);
    }

    @UseGuards(AuthGuard)
    @Mutation(() => KakaoPayPaymentStatus)
    public cancelKakaoPayPayment(@Args('orderId') orderId: string, @AuthMember('_id') memberId: ObjectId) {
        return this.checkoutService.cancelDirectKakaoPayPayment(memberId, orderId);
    }
}
