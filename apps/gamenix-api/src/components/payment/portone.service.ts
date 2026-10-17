import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '../../libs/enums/payment.enum';

const PORTONE_API_BASE = 'https://api.portone.io';

export const PAYMENT_CHECK_LIMIT = 5;
export const PAYMENT_LEASE_MS = 5 * 60 * 1000;

/** An elapsed deadline is uncertainty; it never cancels an external financial operation. */
export async function providerDeadline<T>(operation: () => Promise<T>, timeoutMs = 65000): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    try {
        return await Promise.race([Promise.resolve().then(operation), new Promise<T>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Provider deadline exceeded')), timeoutMs);
        })]);
    } finally { clearTimeout(timer); }
}

/** Must come from an account-verified server adapter, never environment flags or clients. */
export interface SandboxIdentity {
    provider: string;
    merchantId: string;
    storeId: string;
    channelId: string;
    pgMerchantId: string;
    environment: 'SANDBOX';
    currency: 'USD';
    checkoutHost: string;
    buyerCountries: string[];
}

export interface ProviderPaymentFacts {
    providerPaymentId: string;
    status: PaymentStatus;
    amountMinor: number;
    currency: string;
    merchantId: string;
    storeId: string;
    channelId: string;
    pgMerchantId: string;
    environment: string;
    bindingKey: string;
    captured: boolean;
    /** True only when this provider payment can never capture again; session expiry alone is insufficient. */
    checkoutClosed: boolean;
    transactionId?: string;
    capturedAt?: Date;
}

export interface ProviderEvent {
    eventId: string;
    eventType: string;
    providerPaymentId: string;
    storeId: string;
}

/** The subset of PortOne's payment object this server actually reads. */
export interface PortonePayment {
    id: string;
    status: string;
    merchantId?: string;
    storeId?: string;
    version?: string;
    transactionId?: string;
    paidAt?: string;
    currency?: string;
    amount?: { total?: number; paid?: number; cancelled?: number };
    customData?: string;
    channel?: { type?: string; id?: string; pgMerchantId?: string; pgProvider?: string };
}

/** Adapted from Petora's PortOne V2 REST client; no charge/cancel endpoint is exposed. */
@Injectable()
export class PortoneService {
    constructor(private readonly http: HttpService, private readonly config: ConfigService) { }

    // Merchant/channel/hosted-profile compatibility is still unverified. Flags cannot open checkout.
    public async verifiedSandbox(): Promise<SandboxIdentity | null> { return null; }
    public async createSession(_input: {
        paymentId: string; providerPaymentId: string; orderId: string; bindingKey: string; amountMinor: number;
        currency: 'USD'; buyerCountry: string; idempotencyKey: string;
    }): Promise<{ sessionId: string; url: string; expiresAt: Date }> {
        throw new ServiceUnavailableException('Sandbox account is not verified');
    }
    public async verifyWebhook(_body: Buffer, _headers: Record<string, unknown>): Promise<ProviderEvent> { throw new ServiceUnavailableException('Sandbox account is not verified'); }

    public async getPayment(paymentId: string): Promise<ProviderPaymentFacts> {
        const apiSecret = this.config.get<string>('PORTONE_V2_API_SECRET');
        const merchantId = this.config.get<string>('PORTONE_MERCHANT_ID');
        const storeId = this.config.get<string>('PORTONE_STORE_ID');
        const channelId = this.config.get<string>('PORTONE_TEST_CHANNEL_ID');
        const pgMerchantId = this.config.get<string>('PORTONE_TEST_PG_MERCHANT_ID');
        if (this.config.get('NODE_ENV') === 'production' || this.config.get('PORTONE_ENVIRONMENT') !== 'SANDBOX' ||
            ![apiSecret, merchantId, storeId, channelId, pgMerchantId].every((value) => typeof value === 'string' && value.trim().length > 0)) {
            throw new ServiceUnavailableException('PortOne sandbox lookup is not configured');
        }
        if (!/^gamenix-test-[a-f0-9]{24}$/.test(paymentId)) throw new BadRequestException('Invalid payment reference');

        let payment: PortonePayment;
        try {
            const { data } = await this.http.axiosRef.get<PortonePayment>(
                `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
                {
                    headers: { Authorization: `PortOne ${apiSecret}` },
                    params: { storeId }, timeout: 60000, maxRedirects: 0, maxContentLength: 65536,
                },
            );
            payment = data;
        } catch (err) {
            if (err?.response?.status === 404) throw new BadRequestException('Payment not found');
            // Axios errors may contain the Authorization header and full provider response.
            throw new ServiceUnavailableException('Payment lookup failed');
        }
        if (!payment || payment.id !== paymentId || payment.version !== 'V2' || payment.merchantId !== merchantId ||
            payment.storeId !== storeId || payment.channel?.type !== 'TEST' || payment.channel.id !== channelId ||
            payment.channel.pgMerchantId !== pgMerchantId || payment.currency !== 'USD' ||
            !Number.isSafeInteger(payment.amount?.total) || payment.amount.total <= 0) {
            throw new BadRequestException('Payment identity, environment or currency mismatch');
        }
        let bindingKey: string;
        try { bindingKey = JSON.parse(payment.customData).bindingKey; }
        catch { throw new BadRequestException('Payment order binding is missing'); }
        if (typeof bindingKey !== 'string' || !/^[a-f0-9]{64}$/.test(bindingKey)) throw new BadRequestException('Invalid payment order binding');

        let status = PaymentStatus.UNKNOWN;
        switch (payment.status) {
            case 'READY': case 'PENDING': status = PaymentStatus.PENDING; break;
            case 'PAID': status = PaymentStatus.SUCCEEDED; break;
            case 'FAILED': status = PaymentStatus.FAILED; break;
        }
        const captured = status === PaymentStatus.SUCCEEDED;
        const capturedAt = captured ? new Date(payment.paidAt) : undefined;
        if (captured && (payment.amount.paid !== payment.amount.total || payment.amount.cancelled !== 0 ||
            typeof payment.transactionId !== 'string' || !payment.transactionId || payment.transactionId.length > 200 ||
            typeof payment.paidAt !== 'string' || !Number.isFinite(capturedAt.getTime()))) {
            throw new BadRequestException('Payment capture evidence is incomplete');
        }
        // Workflow compares these facts to the persisted immutable order snapshot before any status write.
        return {
            providerPaymentId: payment.id, status, amountMinor: payment.amount.total, currency: payment.currency,
            merchantId: payment.merchantId, storeId: payment.storeId, channelId: payment.channel.id,
            pgMerchantId: payment.channel.pgMerchantId, environment: 'SANDBOX', bindingKey, captured,
            // A failed attempt or hosted-link expiry does not prove this payment ID cannot capture later.
            checkoutClosed: false, ...(captured ? { transactionId: payment.transactionId, capturedAt } : {}),
        };
    }
}
