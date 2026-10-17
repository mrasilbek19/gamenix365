import { PaymentRecord } from '../../libs/dto/payment/payment-record';
import { PaymentStatus } from '../../libs/enums/payment.enum';
import { ProviderPaymentFacts, SandboxIdentity } from './payment-provider';

const text = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200;

export function matchingFacts(payment: PaymentRecord, facts: ProviderPaymentFacts, identity: SandboxIdentity): boolean {
    return !!facts && payment.environment === 'SANDBOX' && payment.currency === 'USD'
        && facts.environment === 'SANDBOX' && facts.currency === 'USD'
        && Object.values(PaymentStatus).includes(facts.status)
        && Number.isSafeInteger(facts.amountMinor) && facts.amountMinor === payment.amountMinor
        && facts.providerPaymentId === payment.providerPaymentId && text(facts.providerPaymentId)
        && facts.merchantId === payment.merchantId && facts.merchantId === identity.merchantId
        && facts.storeId === payment.storeId && facts.storeId === identity.storeId
        && facts.channelId === payment.channelId && facts.channelId === identity.channelId
        && facts.pgMerchantId === payment.pgMerchantId && facts.pgMerchantId === identity.pgMerchantId
        && payment.provider === identity.provider && facts.bindingKey === payment.requestFingerprint
        && typeof facts.captured === 'boolean' && typeof facts.checkoutClosed === 'boolean'
        && (facts.status !== PaymentStatus.SUCCEEDED || (facts.captured === true && text(facts.transactionId)
            && facts.capturedAt instanceof Date && Number.isFinite(facts.capturedAt.getTime())
            && facts.capturedAt.getTime() <= Date.now() + 60000))
        && (!facts.captured || facts.status === PaymentStatus.SUCCEEDED);
}

/** Legacy SUCCEEDED rows/dates alone are insufficient for receipts or payment confirmations. */
export function hasVerifiedCapture(payment: Partial<PaymentRecord>): boolean {
    const proof = payment.verification;
    return !!proof && proof.version === 1 && payment.status === PaymentStatus.SUCCEEDED
        && payment.environment === 'SANDBOX' && proof.environment === 'SANDBOX' && payment.currency === 'USD'
        && proof.currency === payment.currency && proof.amountMinor === payment.amountMinor
        && Number.isSafeInteger(proof.amountMinor) && proof.amountMinor > 0
        && text(proof.providerPaymentId) && proof.providerPaymentId === payment.providerPaymentId
        && text(proof.transactionId) && text(proof.merchantId) && proof.merchantId === payment.merchantId
        && text(proof.storeId) && proof.storeId === payment.storeId
        && text(proof.channelId) && proof.channelId === payment.channelId
        && text(proof.pgMerchantId) && proof.pgMerchantId === payment.pgMerchantId
        && /^[a-f0-9]{64}$/.test(proof.bindingKey) && proof.bindingKey === payment.requestFingerprint
        && !!payment.verifiedAt && Number.isFinite(new Date(payment.verifiedAt).getTime())
        && Number.isFinite(new Date(proof.capturedAt).getTime());
}
