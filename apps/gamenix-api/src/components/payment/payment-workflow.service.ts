import {
    BadRequestException, ConflictException, Injectable,
    ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { TestCheckoutInput } from '../../libs/dto/payment/checkout-session.input';
import { TestCheckoutAvailability, TestCheckoutSession } from '../../libs/dto/payment/checkout-session';
import { PaymentEventRecord, PaymentRecord } from '../../libs/dto/payment/payment-record';
import { PaymentCurrency, PaymentEnvironment, PaymentEventState, PaymentReconciliationStatus, PaymentStatus } from '../../libs/enums/payment.enum';
import { PAYMENT_CHECK_LIMIT, PAYMENT_LEASE_MS, PortoneService, SandboxIdentity, providerDeadline } from './portone.service';
import { PaymentSnapshotService } from './payment-snapshot.service';
import { matchingFacts } from './payment-verification';

const INTERNAL = '+provider +merchantId +providerPaymentId +providerSessionId +idempotencyKey +requestFingerprint '
    + '+snapshot +buyerCountry +storeId +channelId +pgMerchantId +checkoutUrl +active +verification '
    + '+checkAttempts +checkRevision +nextCheckAt +leaseToken +lockedUntil';
const closed = [PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.EXPIRED];
const safeId = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const retryAt = (attempt: number) => new Date(Date.now() + Math.min(60 * 60 * 1000, 30000 * 2 ** (attempt - 1)));

@Injectable()
export class PaymentWorkflowService {
    constructor(
        @InjectModel('Payment') private readonly payments: Model<PaymentRecord>,
        @InjectModel('PaymentEvent') private readonly events: Model<PaymentEventRecord>,
        private readonly snapshots: PaymentSnapshotService,
        private readonly provider: PortoneService,
        private readonly config: ConfigService,
    ) {}

    /** An environment flag is never evidence of a compatible sandbox account. */
    private async identity(): Promise<SandboxIdentity | null> {
        if (this.config.get('PAYMENTS_ENABLED') !== 'true' || this.config.get('NODE_ENV') === 'production') return null;
        let identity: SandboxIdentity | null;
        try { identity = await providerDeadline(() => this.provider.verifiedSandbox(), 5000); }
        catch { return null; }
        if (!identity || identity.environment !== 'SANDBOX' || identity.currency !== 'USD'
            || ![identity.provider, identity.merchantId, identity.storeId, identity.channelId, identity.pgMerchantId].every(safeId)
            || !/^[a-z0-9.-]+$/.test(identity.checkoutHost) || !identity.buyerCountries?.length
            || identity.buyerCountries.some((country) => !/^[A-Z]{2}$/.test(country))) return null;
        return identity;
    }

    public async availability(): Promise<TestCheckoutAvailability> {
        const identity = await this.identity();
        return identity ? { enabled: true, buyerCountries: identity.buyerCountries }
            : { enabled: false, reason: 'SANDBOX_NOT_VERIFIED', buyerCountries: [] };
    }

    private async requireIdentity(): Promise<SandboxIdentity> {
        const identity = await this.identity();
        if (!identity) throw new ServiceUnavailableException('Sandbox checkout is unavailable: account/channel verification is pending');
        return identity;
    }

    private async requireUniqueIndexes(): Promise<void> {
        const [payments, events] = await Promise.all([this.payments.collection.indexes(), this.events.collection.indexes()]);
        const unique = (indexes: typeof payments, keys: Record<string, number>, partial?: Record<string, unknown>) => indexes.some((index) =>
            index.unique === true && JSON.stringify(index.key) === JSON.stringify(keys)
            && JSON.stringify(index.partialFilterExpression) === JSON.stringify(partial));
        if (!unique(payments, { environment: 1, memberId: 1, idempotencyKey: 1 })
            || !unique(payments, { environment: 1, orderId: 1, active: 1 }, { active: true })
            || !unique(payments, { provider: 1, environment: 1, merchantId: 1, providerPaymentId: 1 }, { providerPaymentId: { $type: 'string' } })
            || !unique(events, { provider: 1, environment: 1, merchantId: 1, providerEventId: 1 })) {
            throw new ServiceUnavailableException('Required payment indexes are unavailable');
        }
    }

    public async createSession(member: Types.ObjectId | string, input: TestCheckoutInput): Promise<TestCheckoutSession> {
        if (!/^[a-f\d]{24}$/i.test(String(member))) throw new UnauthorizedException('Authentication required');
        if (!/^[a-f\d]{24}$/i.test(input.orderId) || !/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)) {
            throw new BadRequestException('Invalid checkout request');
        }
        const identity = await this.requireIdentity(); // No writes/network when the account gate is closed.
        await this.requireUniqueIndexes();
        if (!identity.buyerCountries.includes(input.buyerCountry)) throw new BadRequestException('Unsupported buyer country');
        const memberId = new Types.ObjectId(String(member));
        const orderId = new Types.ObjectId(input.orderId);
        await this.snapshots.ownedOrder(memberId, orderId);
        const key = { memberId, environment: PaymentEnvironment.SANDBOX, idempotencyKey: input.idempotencyKey };
        const prior = await this.payments.findOne(key).select(INTERNAL).lean().exec();
        if (prior) return this.replay(prior, input, identity);
        const { snapshot, shopId } = await this.snapshots.build(memberId, orderId);
        // Historical rows have no active claim. Uncertain/captured rows must still block a new charge.
        const blocking = await this.payments.exists({ orderId, environment: PaymentEnvironment.SANDBOX, $or: [
            { active: true }, { status: { $in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN, PaymentStatus.SUCCEEDED] } },
            { reconciliationStatus: PaymentReconciliationStatus.REQUIRED },
        ] }).exec();
        if (blocking) {
            const concurrent = await this.payments.findOne(key).select(INTERNAL).lean().exec();
            if (concurrent) return this.replay(concurrent, input, identity);
            throw new ConflictException('This order already has a payment attempt requiring attention');
        }
        const _id = new Types.ObjectId();
        const fingerprint = createHash('sha256').update(JSON.stringify({
            memberId: String(memberId), orderId: String(orderId), shopId: String(shopId),
            buyerCountry: input.buyerCountry, snapshot,
        })).digest('hex');
        let payment: PaymentRecord;
        try {
            const doc = await this.payments.create({
                _id, memberId, orderId, shopId, provider: identity.provider, merchantId: identity.merchantId,
                storeId: identity.storeId, channelId: identity.channelId, pgMerchantId: identity.pgMerchantId,
                environment: PaymentEnvironment.SANDBOX, currency: PaymentCurrency.USD,
                amountMinor: snapshot.totalMinor, snapshot, pricingPolicyVersion: 'usd-stored-order-v1',
                idempotencyKey: input.idempotencyKey, requestFingerprint: fingerprint, buyerCountry: input.buyerCountry,
                providerPaymentId: `gamenix-test-${_id}`, active: true, nextCheckAt: new Date(Date.now() + PAYMENT_LEASE_MS),
            });
            payment = doc.toObject();
        } catch (error) {
            if (error?.code !== 11000) throw error;
            const existing = await this.payments.findOne(key).select(INTERNAL).lean().exec();
            if (existing) return this.replay(existing, input, identity);
            throw new ConflictException('Another payment attempt already exists for this order');
        }
        try {
            // Only the insert winner creates a session; retries/recovery never repeat this call.
            const session = await providerDeadline(() => this.provider.createSession({
                paymentId: String(_id),
                providerPaymentId: payment.providerPaymentId, orderId: String(orderId), bindingKey: fingerprint,
                amountMinor: payment.amountMinor, currency: 'USD', buyerCountry: input.buyerCountry,
                idempotencyKey: String(_id),
            }));
            const url = new URL(session.url);
            if (!safeId(session.sessionId) || url.protocol !== 'https:' || url.hostname !== identity.checkoutHost
                || url.username || url.password || url.port || session.url.length > 2048
                || !(session.expiresAt instanceof Date) || !Number.isFinite(session.expiresAt.getTime())
                || session.expiresAt.getTime() <= Date.now()) {
                throw new Error('Invalid provider session');
            }
            // Never reset status here: verification can already have completed via a webhook.
            const stored = await this.payments.findOneAndUpdate({ _id }, { $set: {
                providerSessionId: session.sessionId, checkoutUrl: session.url, expiresAt: session.expiresAt,
                nextCheckAt: new Date(),
            } }, { new: true, runValidators: true }).select(INTERNAL).lean().exec();
            if (!stored) throw new Error('Payment persistence unavailable');
            return this.sessionView(stored);
        } catch {
            // The provider may have accepted the request. Keep the claim; never cancel/recreate on uncertainty.
            await this.payments.updateOne({ _id, status: { $ne: PaymentStatus.SUCCEEDED } }, { $set: {
                status: PaymentStatus.UNKNOWN, failureCode: 'SESSION_OUTCOME_UNKNOWN',
                reconciliationStatus: PaymentReconciliationStatus.REQUIRED,
                reconciliationReason: 'SESSION_OUTCOME_UNKNOWN', nextCheckAt: new Date(),
            } }).exec().catch(() => undefined); // Durable pre-call row remains recoverable if this write also fails.
            throw new ServiceUnavailableException('Checkout could not be confirmed; the existing payment attempt will be rechecked');
        }
    }

    private replay(payment: PaymentRecord, input: TestCheckoutInput, identity: SandboxIdentity): TestCheckoutSession {
        if (String(payment.orderId) !== input.orderId.toLowerCase() || payment.buyerCountry !== input.buyerCountry
            || payment.provider !== identity.provider || payment.merchantId !== identity.merchantId
            || payment.storeId !== identity.storeId || payment.channelId !== identity.channelId
            || payment.pgMerchantId !== identity.pgMerchantId) {
            throw new ConflictException('Idempotency key belongs to a different checkout request');
        }
        return this.sessionView(payment);
    }

    private sessionView(payment: PaymentRecord): TestCheckoutSession {
        return { paymentId: String(payment._id), status: payment.status, environment: payment.environment,
            currency: payment.currency, expiresAt: payment.expiresAt,
            ...(payment.status === PaymentStatus.PENDING && payment.expiresAt?.getTime() > Date.now()
                && payment.checkoutUrl ? { checkoutUrl: payment.checkoutUrl } : {}),
        };
    }

    public async receiveWebhook(raw: Buffer, headers: Record<string, unknown>): Promise<{ received: true }> {
        const identity = await this.requireIdentity();
        if (!Buffer.isBuffer(raw) || !raw.length || raw.length > 256 * 1024) throw new BadRequestException('Invalid webhook body');
        let event;
        try { event = await providerDeadline(() => this.provider.verifyWebhook(raw, headers), 10000); }
        catch { throw new UnauthorizedException('Invalid webhook signature'); }
        if (!event || ![event.eventId, event.eventType, event.providerPaymentId].every(safeId) || event.storeId !== identity.storeId) {
            throw new BadRequestException('Invalid sandbox event');
        }
        await this.requireUniqueIndexes();
        const scope = { provider: identity.provider, environment: PaymentEnvironment.SANDBOX,
            merchantId: identity.merchantId, providerEventId: event.eventId };
        const payloadHash = createHash('sha256').update(raw).digest('hex');
        try {
            await this.events.create({ ...scope, payloadHash, eventType: event.eventType,
                providerPaymentId: event.providerPaymentId, nextAttemptAt: new Date() });
        } catch (error) {
            if (error?.code !== 11000) throw error;
            const prior = await this.events.findOne(scope).lean().exec();
            if (!prior || prior.payloadHash !== payloadHash) {
                if (prior && safeId(prior.providerPaymentId)) await this.payments.updateOne({ provider: identity.provider, environment: PaymentEnvironment.SANDBOX,
                    merchantId: identity.merchantId, providerPaymentId: prior.providerPaymentId }, { $set: {
                    reconciliationStatus: PaymentReconciliationStatus.REQUIRED, reconciliationReason: 'CONFLICTING_WEBHOOK',
                } }).exec();
                throw new ConflictException('Conflicting webhook identity');
            }
        }
        // Receipt acknowledges durable acceptance only; batch performs trusted provider retrieval.
        return { received: true };
    }

    public async processDueEvents(limit = 20): Promise<number> {
        const identity = await this.identity();
        if (!identity) return 0;
        await this.events.updateMany({ provider: identity.provider, environment: PaymentEnvironment.SANDBOX,
            merchantId: identity.merchantId, state: PaymentEventState.RECEIVED, attempts: { $gte: PAYMENT_CHECK_LIMIT },
            lockedUntil: { $lte: new Date() },
        }, { $set: { state: PaymentEventState.FAILED, failureCode: 'EVENT_RETRY_LIMIT' },
            $unset: { leaseToken: 1, lockedUntil: 1 } }).exec();
        let count = 0;
        for (; count < Math.min(limit, 100); count++) {
            const now = new Date();
            const leaseToken = randomUUID();
            const event = await this.events.findOneAndUpdate({
                provider: identity.provider, environment: PaymentEnvironment.SANDBOX, merchantId: identity.merchantId,
                state: PaymentEventState.RECEIVED, attempts: { $lt: PAYMENT_CHECK_LIMIT }, nextAttemptAt: { $lte: now },
                $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
            }, { $set: { leaseToken, lockedUntil: new Date(Date.now() + PAYMENT_LEASE_MS) }, $inc: { attempts: 1 } },
            { new: true, sort: { nextAttemptAt: 1 } }).lean().exec();
            if (!event) break;
            try {
                const payment = await this.payments.findOneAndUpdate({ provider: identity.provider,
                    environment: PaymentEnvironment.SANDBOX, merchantId: identity.merchantId,
                    providerPaymentId: event.providerPaymentId, storeId: identity.storeId,
                }, { $set: { nextCheckAt: now, checkAttempts: 0 }, $inc: { checkRevision: 1 } }, { new: true }).lean().exec();
                await this.events.updateOne({ _id: event._id, leaseToken }, { $set: {
                    state: PaymentEventState.PROCESSED, processedAt: new Date(),
                    ...(payment ? { paymentId: payment._id } : { failureCode: 'NO_LOCAL_PAYMENT' }),
                }, $unset: { lockedUntil: 1, leaseToken: 1 } }).exec();
            } catch {
                await this.events.updateOne({ _id: event._id, leaseToken }, { $set: {
                    state: event.attempts >= PAYMENT_CHECK_LIMIT ? PaymentEventState.FAILED : PaymentEventState.RECEIVED,
                    nextAttemptAt: retryAt(event.attempts), failureCode: 'EVENT_PROCESSING_FAILED',
                }, $unset: { lockedUntil: 1, leaseToken: 1 } }).exec();
            }
        }
        return count;
    }

    public async processDuePayments(limit = 20): Promise<number> {
        const identity = await this.identity();
        if (!identity) return 0;
        // A crash on the final claim must reach manual review after its lease expires.
        await this.payments.updateMany({ provider: identity.provider, environment: PaymentEnvironment.SANDBOX,
            merchantId: identity.merchantId, checkAttempts: { $gte: PAYMENT_CHECK_LIMIT },
            lockedUntil: { $lte: new Date() }, status: { $ne: PaymentStatus.SUCCEEDED },
        }, { $set: { status: PaymentStatus.UNKNOWN, nextCheckAt: null,
            reconciliationStatus: PaymentReconciliationStatus.REQUIRED, reconciliationReason: 'PAYMENT_RETRY_LIMIT',
        }, $unset: { leaseToken: 1, lockedUntil: 1 } }).exec();
        await this.payments.updateMany({ provider: identity.provider, environment: PaymentEnvironment.SANDBOX,
            merchantId: identity.merchantId, checkAttempts: { $gte: PAYMENT_CHECK_LIMIT },
            lockedUntil: { $lte: new Date() }, status: PaymentStatus.SUCCEEDED,
        }, { $set: { nextCheckAt: null, reconciliationStatus: PaymentReconciliationStatus.REQUIRED,
            reconciliationReason: 'PAYMENT_RETRY_LIMIT',
        }, $unset: { leaseToken: 1, lockedUntil: 1 } }).exec();
        let count = 0;
        for (; count < Math.min(limit, 100); count++) {
            const now = new Date();
            const leaseToken = randomUUID();
            const payment = await this.payments.findOneAndUpdate({
                provider: identity.provider, environment: PaymentEnvironment.SANDBOX, merchantId: identity.merchantId,
                nextCheckAt: { $lte: now }, checkAttempts: { $lt: PAYMENT_CHECK_LIMIT },
                $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
            }, { $set: { leaseToken, lockedUntil: new Date(Date.now() + PAYMENT_LEASE_MS) }, $inc: { checkAttempts: 1 } },
            { new: true, sort: { nextCheckAt: 1 } }).select(INTERNAL).lean().exec();
            if (!payment) break;
            try {
                const facts = await providerDeadline(() => this.provider.getPayment(payment.providerPaymentId));
                if (!matchingFacts(payment, facts, identity)) {
                    await this.uncertain(payment, leaseToken, 'PROVIDER_FACTS_MISMATCH', true);
                    continue;
                }
                const set: Record<string, unknown> = { lastCheckedAt: new Date() };
                if (facts.status === PaymentStatus.SUCCEEDED && payment.status === PaymentStatus.SUCCEEDED && payment.verification) {
                    Object.assign(set, { nextCheckAt: null,
                        ...(payment.verification.transactionId !== facts.transactionId ? {
                            reconciliationStatus: PaymentReconciliationStatus.REQUIRED, reconciliationReason: 'CONFLICTING_CAPTURE',
                        } : {}),
                    });
                } else if (facts.status === PaymentStatus.SUCCEEDED) {
                    const { providerPaymentId, transactionId, amountMinor, currency, merchantId, storeId,
                        channelId, pgMerchantId, bindingKey, capturedAt } = facts;
                    Object.assign(set, { status: PaymentStatus.SUCCEEDED, verifiedAt: new Date(), succeededAt: capturedAt,
                        verification: { version: 1, providerPaymentId, transactionId, amountMinor, currency, merchantId,
                            storeId, channelId, pgMerchantId, bindingKey, capturedAt, environment: 'SANDBOX' },
                        nextCheckAt: null,
                    });
                } else if (payment.status === PaymentStatus.SUCCEEDED) {
                    // Stale cancellation/failure or a later refund cannot undo capture evidence.
                    Object.assign(set, { nextCheckAt: null,
                        ...(facts.status !== PaymentStatus.PENDING ? { reconciliationStatus: PaymentReconciliationStatus.REQUIRED,
                            reconciliationReason: 'CAPTURED_PAYMENT_CHANGED' } : {}),
                    });
                } else if (closed.includes(facts.status) && facts.checkoutClosed && !facts.captured) {
                    Object.assign(set, { status: facts.status, active: false, nextCheckAt: null,
                        ...(facts.status === PaymentStatus.CANCELLED ? { cancelledAt: new Date() } : { failedAt: new Date() }),
                    });
                } else {
                    await this.uncertain(payment, leaseToken, facts.status === PaymentStatus.PENDING
                        ? 'PAYMENT_PENDING' : 'PAYMENT_OUTCOME_UNKNOWN');
                    continue;
                }
                await this.saveCheck(payment, leaseToken, set);
            } catch {
                await this.uncertain(payment, leaseToken, 'PROVIDER_OR_DATABASE_UNAVAILABLE');
            }
        }
        return count;
    }

    private async uncertain(payment: PaymentRecord, leaseToken: string, code: string, stop = false): Promise<void> {
        const exhausted = stop || payment.checkAttempts >= PAYMENT_CHECK_LIMIT;
        await this.saveCheck(payment, leaseToken, {
            ...(payment.status !== PaymentStatus.SUCCEEDED ? { status: code === 'PAYMENT_PENDING' && !exhausted
                ? PaymentStatus.PENDING : PaymentStatus.UNKNOWN } : {}),
            failureCode: code, lastCheckedAt: new Date(), nextCheckAt: exhausted ? null : retryAt(payment.checkAttempts),
            ...(exhausted ? { reconciliationStatus: PaymentReconciliationStatus.REQUIRED, reconciliationReason: code } : {}),
        });
    }

    private async saveCheck(payment: PaymentRecord, leaseToken: string, set: Record<string, unknown>): Promise<void> {
        await this.payments.updateOne({ _id: payment._id, leaseToken,
            checkRevision: payment.checkRevision === undefined ? { $exists: false } : payment.checkRevision,
        }, { $set: set, $unset: { lockedUntil: 1, leaseToken: 1 } }, { runValidators: true }).exec();
        // A newly queued event invalidates the in-flight result. Preserve its due time and release only our lease.
        await this.payments.updateOne({ _id: payment._id, leaseToken }, { $unset: { lockedUntil: 1, leaseToken: 1 } }).exec();
    }

    /** Reporting only: callers must retain their original order outcome even if this write fails. */
    public async reportOrderProcessingFailure(orderId: Types.ObjectId): Promise<void> {
        await this.payments.updateMany({ orderId, environment: PaymentEnvironment.SANDBOX,
            $or: [{ active: true }, { status: PaymentStatus.SUCCEEDED }] }, { $set: {
            reconciliationStatus: PaymentReconciliationStatus.REQUIRED, reconciliationReason: 'ORDER_PROCESSING_FAILED',
        } }).exec();
    }
}
