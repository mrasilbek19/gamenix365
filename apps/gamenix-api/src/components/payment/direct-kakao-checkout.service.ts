import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PaymentService } from './payment.service';
import { PaymentMethod } from '../../libs/enums/payment.enum';
import { OrderStatus } from '../../libs/enums/order.enum';
import { DirectKakaoPayOrder, DirectKakaoPayService, DirectKakaoPayRequestError, KAKAOPAY_TEST_CID } from './direct-kakaopay.service';
import { KakaoPayPaymentRecord } from '../../libs/schemas/KakaoPayPayment.model';
import { KakaoPayCheckoutSession, KakaoPayPaymentStatus } from '../../libs/dto/payment/kakao-checkout';
import { Order } from '../../libs/dto/order/order';

export function kakaoPayDate(value: string): Date {
    // Current examples omit the Korean provider's offset; never depend on the host timezone.
    const naive = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/;
    const zoned = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
    if (typeof value !== 'string' || !(naive.test(value) || zoned.test(value))) {
        throw new BadRequestException('Direct payment capture time is invalid');
    }
    const normalized = naive.test(value)
        ? `${value}+09:00` : value;
    const result = new Date(normalized);
    if (typeof value !== 'string' || !Number.isFinite(result.getTime())) throw new BadRequestException('Direct payment capture time is invalid');
    return result;
}

@Injectable()
export class DirectKakaoCheckoutService {
    constructor(
        @InjectModel('KakaoPayPayment') private readonly paymentModel: Model<KakaoPayPaymentRecord>,
        private readonly checkoutService: PaymentService,
        private readonly kakaopayService: DirectKakaoPayService,
    ) { }

    public async prepareDirectKakaoPayCheckout(memberId: ObjectId, orderId: string): Promise<KakaoPayCheckoutSession> {
        const order = await this.checkoutService.getPayableOrder(memberId, orderId);
        const configuration = this.kakaopayService.requireConfiguration();
        const quantity = order.orderItems.reduce((total, item) => total + item.itemQuantity, 0);
        if (!Number.isSafeInteger(quantity) || quantity < 1) throw new BadRequestException('Invalid order quantity');
        const existing = await this.paymentModel.findOne({ orderId: order._id, memberId: order.memberId }).lean().exec();
        if (existing) this.requireAttempt(existing, order);
        await this.checkoutService.requireUniqueIndexes();
        const nonce = randomBytes(32).toString('base64url');
        const claimId = randomBytes(24).toString('hex');
        const snapshot = {
            provider: 'DIRECT', orderId: new Types.ObjectId(String(order._id)), memberId: new Types.ObjectId(String(order.memberId)),
            shopId: new Types.ObjectId(String(order.shopId)), paymentId: `gamenix-test-kakao-${order._id}`,
            totalAmount: order.orderTotal, currency: 'KRW', orderName: `Gamenix order ${order._id}`,
            customData: JSON.stringify({ memberId: String(order.memberId), orderId: String(order._id) }),
            cid: KAKAOPAY_TEST_CID, partnerUserId: this.partnerUserId(String(order.memberId)),
            callbackStateHash: this.hash(nonce), callbackExpiresAt: new Date(Date.now() + 15 * 60_000),
            readyClaimId: claimId, readyState: 'CLAIMED', approvalState: 'WAITING', status: 'PENDING', verifiedSuccess: false,
        };
        let attempt: KakaoPayPaymentRecord;
        try {
            if (this.checkoutService.canRetryPreparation(existing)) {
                attempt = await this.paymentModel.findOneAndUpdate(
                    { orderId: order._id, memberId: order.memberId, provider: 'DIRECT', __v: existing.__v ?? 0,
                        readyClaimId: existing.readyClaimId, readyState: existing.readyState, approvalState: 'WAITING',
                        status: existing.status, verifiedSuccess: false,
                        tid: { $exists: false }, transactionId: { $exists: false }, paidAt: { $exists: false },
                        approvalClaimId: { $exists: false }, cancellationRequestedAt: { $exists: false },
                        cancelledAt: { $exists: false }, nextRedirectPcUrl: { $exists: false }, nextRedirectMobileUrl: { $exists: false } },
                    { $set: { readyClaimId: claimId, readyState: 'CLAIMED', status: 'PENDING', verifiedSuccess: false,
                        callbackStateHash: snapshot.callbackStateHash, callbackExpiresAt: snapshot.callbackExpiresAt },
                        $unset: { preparationError: 1, preparationHttpStatus: 1, preparationErrorCode: 1 }, $inc: { __v: 1 } },
                    { new: true, runValidators: true },
                ).lean().exec();
                if (!attempt) throw new ConflictException('Direct payment preparation is already in progress; check payment status');
            } else {
                attempt = await this.paymentModel.findOneAndUpdate(
                    { orderId: order._id, memberId: order.memberId }, { $setOnInsert: snapshot },
                    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
                ).lean().exec();
            }
        } catch (err) {
            if (err?.code !== 11000) throw err;
            attempt = await this.paymentModel.findOne({ orderId: order._id, memberId: order.memberId }).lean().exec();
            if (!attempt) throw new ConflictException('Payment reference conflict; checkout was not started');
        }
        this.requireAttempt(attempt, order);
        if (attempt.transactionId || attempt.cancellationRequestedAt || ['CANCELLED', 'FAILED'].includes(attempt.status)) {
            throw new ConflictException('This direct payment cannot be restarted');
        }
        this.requireUnexpired(attempt);
        if (attempt.readyState === 'READY' && attempt.tid && attempt.approvalState === 'WAITING') return this.session(attempt);
        if (attempt.readyClaimId !== claimId) {
            throw new ConflictException('Direct payment preparation or approval is pending; check payment status');
        }

        const callback = (result: string) => {
            const url = new URL('/orders/process', configuration.frontendOrigin);
            url.searchParams.set('orderId', String(order._id));
            url.searchParams.set('kakaoState', nonce);
            url.searchParams.set('kakaoReturn', result);
            if (url.href.length > 255) throw new ServiceUnavailableException('DIRECT_RETURN_ORIGIN_NOT_CONFIGURED');
            return url.href;
        };
        try {
            const prepared = await this.kakaopayService.ready({
                partner_order_id: attempt.paymentId, partner_user_id: attempt.partnerUserId, item_name: attempt.orderName,
                quantity, total_amount: attempt.totalAmount,
                approval_url: callback('approve'), cancel_url: callback('cancel'), fail_url: callback('fail'),
            });
            const saved = await this.paymentModel.findOneAndUpdate(
                { orderId: attempt.orderId, memberId: attempt.memberId, provider: 'DIRECT', readyClaimId: claimId,
                    readyState: 'CLAIMED', tid: { $exists: false } },
                { $set: { tid: prepared.tid, readyState: 'READY', nextRedirectPcUrl: prepared.next_redirect_pc_url,
                    nextRedirectMobileUrl: prepared.next_redirect_mobile_url, status: 'READY' }, $inc: { __v: 1 } },
                { new: true, runValidators: true },
            ).lean().exec();
            if (!saved) throw new ServiceUnavailableException('Direct payment preparation could not be saved');
            return this.session(saved);
        } catch (err) {
            const rejected = err instanceof DirectKakaoPayRequestError && err.definitiveReadyRejection;
            const message = err instanceof DirectKakaoPayRequestError ? err.message
                : 'Checkout was not opened. Retry payment for this saved order.';
            await this.paymentModel.updateOne(
                { orderId: attempt.orderId, memberId: attempt.memberId, readyClaimId: claimId, readyState: 'CLAIMED' },
                { $set: { readyState: rejected ? 'REJECTED' : 'UNCERTAIN', status: rejected ? 'FAILED' : 'PENDING',
                    preparationError: message,
                    preparationHttpStatus: err instanceof DirectKakaoPayRequestError ? err.providerHttpStatus : undefined,
                    preparationErrorCode: err instanceof DirectKakaoPayRequestError ? err.providerErrorCode : undefined }, $inc: { __v: 1 } },
            ).exec().catch(() => undefined);
            if (err instanceof DirectKakaoPayRequestError) throw err;
            throw new ServiceUnavailableException('Direct payment preparation is uncertain; check payment status before retrying');
        }
    }

    public async approveDirectKakaoPayPayment(memberId: ObjectId, orderId: string, state: string, pgToken: string): Promise<KakaoPayPaymentStatus> {
        const { order, attempt } = await this.loadAttempt(memberId, orderId);
        if (!attempt?.tid) throw new ConflictException('No prepared direct payment is available');
        this.requireState(attempt, state);
        if (typeof pgToken !== 'string' || !pgToken.trim() || pgToken.length > 2048) throw new BadRequestException('Invalid payment approval token');
        this.kakaopayService.requireConfiguration();
        const current = await this.verifyDirectKakaoPayPayment(memberId, orderId);
        if (current.verifiedSuccess || current.status !== 'READY') return current;
        const fresh = await this.paymentModel.findOne({ orderId: order._id, memberId: order.memberId }).lean().exec();
        this.requireAttempt(fresh, order);
        this.requireState(fresh, state);
        if (fresh.approvalState !== 'WAITING') return this.checkoutService.getKakaoPayPaymentStatus(memberId, orderId);
        const claimId = randomBytes(24).toString('hex');
        const claimed = await this.paymentModel.findOneAndUpdate(
            { orderId: fresh.orderId, memberId: fresh.memberId, provider: 'DIRECT', tid: fresh.tid,
                approvalState: 'WAITING', __v: fresh.__v ?? 0 },
            { $set: { approvalState: 'CLAIMED', approvalClaimId: claimId, status: 'PENDING' }, $inc: { __v: 1 } },
            { new: true, runValidators: true },
        ).lean().exec();
        if (!claimed) return this.verifyDirectKakaoPayPayment(memberId, orderId);
        let approvalError: DirectKakaoPayRequestError;
        try {
            await this.kakaopayService.approve({ tid: claimed.tid, partner_order_id: claimed.paymentId,
                partner_user_id: claimed.partnerUserId, pg_token: pgToken, total_amount: claimed.totalAmount });
        } catch (err) {
            // A timeout does not establish nonpayment. Repeated callbacks may only query this TID.
            if (err instanceof DirectKakaoPayRequestError) approvalError = err;
        }
        await this.paymentModel.updateOne(
            { orderId: claimed.orderId, memberId: claimed.memberId, approvalClaimId: claimId, approvalState: 'CLAIMED' },
            { $set: { approvalState: 'UNCERTAIN' }, $inc: { __v: 1 } },
        ).exec();
        const verified = await this.verifyDirectKakaoPayPayment(memberId, orderId);
        if (approvalError && !verified.verifiedSuccess && verified.status !== 'CANCELLED') throw approvalError;
        return verified;
    }

    public async verifyDirectKakaoPayPayment(memberId: ObjectId, orderId: string): Promise<KakaoPayPaymentStatus> {
        const { order, attempt } = await this.loadAttempt(memberId, orderId);
        if (!attempt?.tid) return this.checkoutService.getKakaoPayPaymentStatus(memberId, orderId);
        await this.checkoutService.requireActiveMembers(order);
        const facts = await this.kakaopayService.getOrder(attempt.tid);
        this.requireOrderFacts(facts, attempt);
        if (attempt.status === 'CANCELLED' && facts.status === 'SUCCESS_PAYMENT') {
            return this.checkoutService.getKakaoPayPaymentStatus(memberId, orderId);
        }
        let status: string;
        let evidence: object = {};
        if (facts.status === 'SUCCESS_PAYMENT') {
            if (facts.canceled_amount?.total !== 0) throw new BadRequestException('Direct payment cancellation evidence does not match');
            const captures = facts.payment_action_details?.filter(action => action.payment_action_type === 'PAYMENT');
            if (captures?.length !== 1 || typeof captures[0].aid !== 'string' || !captures[0].aid.trim() ||
                captures[0].amount !== attempt.totalAmount) throw new BadRequestException('Direct payment capture evidence is incomplete');
            const paidAt = kakaoPayDate(facts.approved_at);
            if (kakaoPayDate(captures[0].approved_at).getTime() !== paidAt.getTime()) {
                throw new BadRequestException('Direct payment capture time does not match');
            }
            if (attempt.transactionId && attempt.transactionId !== captures[0].aid) throw new ConflictException('Direct payment capture reference changed');
            status = 'PAID';
            evidence = { transactionId: captures[0].aid, paidAt, providerApprovedAt: facts.approved_at, paymentMethod: PaymentMethod.EASY_PAY, approvalState: 'COMPLETE' };
        } else if (facts.status === 'CANCEL_PAYMENT') {
            if (facts.canceled_amount?.total !== attempt.totalAmount || !facts.canceled_at) {
                throw new BadRequestException('Direct payment cancellation evidence is incomplete');
            }
            status = 'CANCELLED';
            evidence = { cancelledAt: kakaoPayDate(facts.canceled_at) };
        } else if (facts.status === 'PART_CANCEL_PAYMENT') status = 'PENDING';
        else if (facts.status === 'QUIT_PAYMENT' && !attempt.transactionId) status = 'CANCELLED';
        else if (['FAIL_PAYMENT', 'FAIL_AUTH_PASSWORD'].includes(facts.status)) status = 'FAILED';
        else if (['READY', 'SEND_TMS', 'OPEN_PAYMENT', 'SELECT_METHOD', 'ARS_WAITING', 'AUTH_PASSWORD'].includes(facts.status) &&
            attempt.approvalState === 'WAITING') status = 'READY';
        else status = 'PENDING';

        const saved = await this.paymentModel.findOneAndUpdate(
            { orderId: attempt.orderId, memberId: attempt.memberId, provider: 'DIRECT', tid: attempt.tid, __v: attempt.__v ?? 0 },
            { $set: { status, verifiedSuccess: status === 'PAID', ...evidence }, $inc: { __v: 1 } },
            { new: true, runValidators: true },
        ).lean().exec();
        if (!saved) {
            const latest = await this.paymentModel.findOne({ orderId: attempt.orderId, memberId: attempt.memberId }).lean().exec();
            this.requireAttempt(latest, order);
            if (status === 'PAID' && latest.transactionId && latest.transactionId !== (evidence as any).transactionId) {
                throw new ConflictException('Direct payment capture reference changed');
            }
        }
        return this.checkoutService.getKakaoPayPaymentStatus(memberId, orderId);
    }

    public async cancelDirectKakaoPayPayment(memberId: ObjectId, orderId: string): Promise<KakaoPayPaymentStatus> {
        const { order, attempt } = await this.loadAttempt(memberId, orderId);
        if (order.orderStatus !== OrderStatus.PAUSE) throw new ConflictException('A payment can only be cancelled before order processing');
        await this.checkoutService.requireActiveMembers(order);
        if (!attempt?.tid) throw new BadRequestException('This order has no prepared direct payment');
        if (attempt.status === 'CANCELLED') return this.checkoutService.getKakaoPayPaymentStatus(memberId, orderId);
        if (attempt.cancellationRequestedAt) return this.verifyDirectKakaoPayPayment(memberId, orderId);
        const verified = await this.verifyDirectKakaoPayPayment(memberId, orderId);
        if (verified.status === 'CANCELLED' || verified.cancellationPending) return verified;
        if (!verified.verifiedSuccess) throw new BadRequestException('Only a verified paid payment can be cancelled');
        const fresh = await this.paymentModel.findOne({ orderId: order._id, memberId: order.memberId }).lean().exec();
        this.requireAttempt(fresh, order);
        const claimed = await this.paymentModel.findOneAndUpdate(
            { orderId: fresh.orderId, memberId: fresh.memberId, provider: 'DIRECT', tid: fresh.tid,
                status: 'PAID', cancellationRequestedAt: { $exists: false }, __v: fresh.__v ?? 0 },
            { $set: { cancellationRequestedAt: new Date() }, $inc: { __v: 1 } }, { new: true, runValidators: true },
        ).lean().exec();
        if (claimed) {
            try { await this.kakaopayService.cancel(claimed.tid, claimed.totalAmount); }
            catch { /* A timeout remains uncertain. Recovery queries the saved TID without reposting. */ }
        }
        return this.verifyDirectKakaoPayPayment(memberId, orderId);
    }

    private async loadAttempt(memberId: ObjectId, orderId: string): Promise<{ order: Order; attempt?: KakaoPayPaymentRecord }> {
        const order = await this.checkoutService.getOwnedOrder(memberId, orderId);
        const attempt = await this.paymentModel.findOne({ orderId: order._id, memberId: order.memberId }).lean().exec();
        if (attempt) this.requireAttempt(attempt, order);
        return { order, attempt };
    }

    private requireAttempt(attempt: KakaoPayPaymentRecord, order: Order): void {
        this.checkoutService.assertAttempt(attempt, order);
        if (attempt.provider !== 'DIRECT') throw new ConflictException('This order has a historical PortOne payment; manual review is required');
        if (attempt.cid !== KAKAOPAY_TEST_CID || attempt.partnerUserId !== this.partnerUserId(String(order.memberId))) {
            throw new ConflictException('The direct payment does not match the saved test identity');
        }
    }

    private requireOrderFacts(facts: DirectKakaoPayOrder, attempt: KakaoPayPaymentRecord): void {
        if (!facts || facts.cid !== KAKAOPAY_TEST_CID || facts.tid !== attempt.tid ||
            facts.partner_order_id !== attempt.paymentId || facts.partner_user_id !== attempt.partnerUserId ||
            facts.amount?.total !== attempt.totalAmount || facts.amount.tax_free !== 0) {
            throw new BadRequestException('Direct provider order does not match the saved checkout');
        }
    }

    private session(attempt: KakaoPayPaymentRecord): KakaoPayCheckoutSession {
        this.kakaopayService.requireRedirectUrl(attempt.nextRedirectPcUrl);
        this.kakaopayService.requireRedirectUrl(attempt.nextRedirectMobileUrl);
        return { orderId: String(attempt.orderId), paymentId: attempt.paymentId,
            nextRedirectPcUrl: attempt.nextRedirectPcUrl, nextRedirectMobileUrl: attempt.nextRedirectMobileUrl };
    }

    private requireState(attempt: KakaoPayPaymentRecord, state: string): void {
        if (typeof state !== 'string' || state.length > 512 || !/^[a-f\d]{64}$/.test(attempt.callbackStateHash ?? '') ||
            !timingSafeEqual(Buffer.from(this.hash(state)), Buffer.from(attempt.callbackStateHash))) {
            throw new BadRequestException('Payment callback state is invalid');
        }
        this.requireUnexpired(attempt);
    }

    private requireUnexpired(attempt: KakaoPayPaymentRecord): void {
        if (!attempt.callbackExpiresAt || !Number.isFinite(new Date(attempt.callbackExpiresAt).getTime()) ||
            new Date(attempt.callbackExpiresAt).getTime() <= Date.now()) {
            throw new ConflictException('This direct payment session has expired; check the saved order before starting again');
        }
    }

    private hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
    private partnerUserId(memberId: string): string { return `gm_${this.hash(memberId)}`; }
}
