import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PaymentStatus } from '../../libs/enums/payment.enum';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
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

/** Provider-independent port. No runtime adapter or simulated provider is enabled. */
export interface PaymentProvider {
    verifiedSandbox(): Promise<SandboxIdentity | null>;
    createSession(input: {
        paymentId: string;
        providerPaymentId: string; orderId: string; bindingKey: string; amountMinor: number;
        currency: 'USD'; buyerCountry: string; idempotencyKey: string;
    }): Promise<{ sessionId: string; url: string; expiresAt: Date }>;
    getPayment(providerPaymentId: string): Promise<ProviderPaymentFacts>;
    verifyWebhook(body: Buffer, headers: Record<string, unknown>): Promise<ProviderEvent>;
}

/** No SDK, credentials, HTTP calls or environment flag can turn this into checkout. */
@Injectable()
export class UnconfiguredPaymentProvider implements PaymentProvider {
    public async verifiedSandbox(): Promise<null> { return null; }
    public async createSession(): Promise<never> { throw new ServiceUnavailableException('Sandbox account is not verified'); }
    public async getPayment(): Promise<never> { throw new ServiceUnavailableException('Sandbox account is not verified'); }
    public async verifyWebhook(): Promise<never> { throw new ServiceUnavailableException('Sandbox account is not verified'); }
}
