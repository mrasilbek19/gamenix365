import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

const KAKAOPAY_API = 'https://open-api.kakaopay.com/online/v1/payment';
export const KAKAOPAY_TEST_CID = 'TC0ONETIME';

export class DirectKakaoPayRequestError extends ServiceUnavailableException {
    constructor(
        public readonly reason: string,
        message: string,
        public readonly providerHttpStatus?: number,
        public readonly providerErrorCode?: number,
        public readonly definitiveReadyRejection: boolean = false,
    ) { super(message); }
}

export interface DirectKakaoPayOrder {
    tid: string;
    cid: string;
    status: string;
    partner_order_id: string;
    partner_user_id: string;
    amount?: { total?: number; tax_free?: number };
    canceled_amount?: { total?: number; tax_free?: number };
    canceled_at?: string;
    approved_at?: string;
    payment_action_details?: { aid?: string; payment_action_type?: string; amount?: number; approved_at?: string }[];
}

@Injectable()
export class DirectKakaoPayService {
    constructor(private readonly http: HttpService) { }

    public getAvailability() {
        const blockers: string[] = [];
        try { this.requireConfiguration(); } catch (err) { blockers.push(err.message); }
        return { provider: 'DIRECT', enabled: blockers.length === 0, currency: 'KRW', requiredCurrency: 'KRW', blockers };
    }

    public requireConfiguration(): { frontendOrigin: string } {
        if (process.env.NODE_ENV === 'production' || (process.env.KAKAOPAY_ENVIRONMENT ?? 'SANDBOX') !== 'SANDBOX' ||
            !process.env.KAKAOPAY_SECRET_KEY?.trim()) {
            throw new ServiceUnavailableException('DIRECT_TEST_NOT_CONFIGURED');
        }
        if (process.env.KAKAOPAY_CID && process.env.KAKAOPAY_CID !== KAKAOPAY_TEST_CID) {
            throw new ServiceUnavailableException('DIRECT_TEST_CID_REQUIRED');
        }
        if ((process.env.KAKAOPAY_API_URL ?? 'https://open-api.kakaopay.com').replace(/\/$/, '') !== 'https://open-api.kakaopay.com') {
            throw new ServiceUnavailableException('DIRECT_API_URL_INVALID');
        }
        let origin: URL;
        try { origin = new URL(process.env.KAKAOPAY_FRONTEND_ORIGIN || process.env.FRONTEND_ORIGIN || 'http://localhost:3000'); } catch {
            throw new ServiceUnavailableException('DIRECT_RETURN_ORIGIN_NOT_CONFIGURED');
        }
        if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
            !(origin.protocol === 'https:' || origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) {
            throw new ServiceUnavailableException('DIRECT_RETURN_ORIGIN_NOT_CONFIGURED');
        }
        return { frontendOrigin: origin.origin };
    }

    public async ready(input: {
        partner_order_id: string; partner_user_id: string; item_name: string; quantity: number;
        total_amount: number; approval_url: string; cancel_url: string; fail_url: string;
    }): Promise<{ tid: string; next_redirect_pc_url: string; next_redirect_mobile_url: string }> {
        const result = await this.post('ready', { ...input, cid: KAKAOPAY_TEST_CID, tax_free_amount: 0 });
        if (typeof result?.tid !== 'string' || !result.tid.trim() || result.tid.length > 100) {
            throw new ServiceUnavailableException('KakaoPay TEST ready response is invalid');
        }
        this.requireRedirectUrl(result.next_redirect_pc_url);
        this.requireRedirectUrl(result.next_redirect_mobile_url);
        return { tid: result.tid, next_redirect_pc_url: result.next_redirect_pc_url,
            next_redirect_mobile_url: result.next_redirect_mobile_url };
    }

    public async approve(input: { tid: string; partner_order_id: string; partner_user_id: string; pg_token: string; total_amount: number }): Promise<void> {
        const result = await this.post('approve', { ...input, cid: KAKAOPAY_TEST_CID });
        if (result?.tid !== input.tid || result.cid !== KAKAOPAY_TEST_CID ||
            result.partner_order_id !== input.partner_order_id || result.partner_user_id !== input.partner_user_id ||
            result.amount?.total !== input.total_amount) {
            throw new BadRequestException('KakaoPay TEST approval does not match the saved checkout');
        }
    }

    public async getOrder(tid: string): Promise<DirectKakaoPayOrder> {
        if (typeof tid !== 'string' || !tid.trim() || tid.length > 100) throw new BadRequestException('Invalid direct payment reference');
        return this.post('order', { cid: KAKAOPAY_TEST_CID, tid });
    }

    public async cancel(tid: string, totalAmount: number): Promise<void> {
        if (!tid || tid.length > 100 || !Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
            throw new BadRequestException('Invalid payment cancellation details');
        }
        const result = await this.post('cancel', { cid: KAKAOPAY_TEST_CID, tid, cancel_amount: totalAmount,
            cancel_tax_free_amount: 0, cancel_available_amount: totalAmount });
        if (result?.tid !== tid || result.cid !== KAKAOPAY_TEST_CID) {
            throw new BadRequestException('KakaoPay TEST cancellation does not match the saved checkout');
        }
    }

    public requireRedirectUrl(value: string): void {
        let url: URL;
        try { url = new URL(value); } catch { throw new ServiceUnavailableException('KakaoPay TEST redirect is invalid'); }
        if (url.protocol !== 'https:' || !['mockup-pg-web.kakao.com', 'online-pay.kakao.com', 'online-pay.kakaopay.com', 'online-payment.kakaopay.com'].includes(url.hostname) || url.port ||
            url.username || url.password) {
            throw new ServiceUnavailableException('KakaoPay TEST redirect is not allowed');
        }
    }

    private async post(operation: 'ready' | 'approve' | 'order' | 'cancel', input: object): Promise<any> {
        const { frontendOrigin } = this.requireConfiguration();
        try {
            const { data } = await this.http.axiosRef.post(`${KAKAOPAY_API}/${operation}`, input, {
                headers: { Authorization: `SECRET_KEY ${process.env.KAKAOPAY_SECRET_KEY.trim()}`, 'Content-Type': 'application/json' },
                timeout: 15_000, maxRedirects: 0, maxContentLength: 65536,
            });
            return data;
        } catch (err) {
            // Provider errors can contain the dev secret, pg_token and complete payment details.
            if (err instanceof DirectKakaoPayRequestError) throw err;
            const providerHttpStatus = Number.isInteger(err?.response?.status) && err.response.status >= 400 && err.response.status <= 599
                ? err.response.status : undefined;
            const data = err?.response?.data;
            const providerErrorCode = Number.isSafeInteger(data?.error_code) ? data.error_code : undefined;
            const knownRejection = [400, 401, 403, 404].includes(providerHttpStatus) && providerErrorCode === -providerHttpStatus;
            const providerMessage = typeof data?.error_message === 'string' ? data.error_message.slice(0, 2048) : '';
            let reason = 'DIRECT_PROVIDER_REQUEST_FAILED';
            let message = `KakaoPay TEST ${operation} request failed; check payment status before retrying`;
            if (knownRejection && providerHttpStatus === 400) {
                if (/domain|\ub3c4\uba54\uc778/i.test(providerMessage)) {
                    const missing = /(?:no|without)\s+(?:registered\s+)?(?:web\s+|site\s+|web\s+site\s+)?domains?|domains?.{0,100}(?:not registered|not configured|missing)|\ub4f1\ub85d\ub41c.{0,100}(?:\uc5c6|\uc874\uc7ac\ud558\uc9c0)/i.test(providerMessage);
                    reason = missing ? 'DIRECT_RETURN_DOMAIN_NOT_REGISTERED' : 'DIRECT_RETURN_DOMAIN_MISMATCH';
                    message = missing
                        ? `Register ${frontendOrigin} in KakaoPay Developers > Application > Platform > Web > Site domains for the application issuing your Secret key(dev), then try again`
                        : `KakaoPay rejected the callback domain. Check that ${frontendOrigin} is registered in KakaoPay Developers > Application > Platform > Web > Site domains for the application issuing your Secret key(dev)`;
                } else if (/\b(?:approval_url|cancel_url|fail_url)\b/i.test(providerMessage)) {
                    reason = 'DIRECT_RETURN_URL_INVALID';
                    message = `KakaoPay rejected a checkout callback URL; check the approval, cancel and fail URLs for ${frontendOrigin}`;
                } else if (/\bcid\b|\uac00\ub9f9\uc810\s*(?:\ucf54\ub4dc|\ubc88\ud638)/i.test(providerMessage)) {
                    reason = 'DIRECT_TEST_CID_INVALID';
                    message = 'KakaoPay rejected the TEST CID; use KAKAOPAY_CID=TC0ONETIME with the selected application\'s Secret key(dev)';
                } else if (/\b(?:total_amount|tax_free_amount|vat_amount|amount)\b|(?:\uacb0\uc81c|\uc0c1\ud488)\s*(?:\uae08\uc561|\ucd1d\uc561)/i.test(providerMessage)) {
                    reason = 'DIRECT_AMOUNT_INVALID';
                    message = 'KakaoPay rejected the KRW payment amount; check the saved order total and tax amounts';
                } else {
                    reason = 'DIRECT_REQUEST_INVALID';
                    message = 'KakaoPay rejected the payment request; check the TEST payment configuration';
                }
            } else if (knownRejection && providerHttpStatus === 401) {
                reason = 'DIRECT_TEST_KEY_INVALID';
                message = 'KakaoPay rejected the development Secret key; check the selected application\'s Secret key(dev)';
            } else if (knownRejection && providerHttpStatus === 403) {
                reason = 'DIRECT_TEST_API_NOT_ENABLED';
                message = 'Enable the Online Payment API for the selected KakaoPay Developers application';
            } else if (knownRejection && providerHttpStatus === 404) {
                reason = 'DIRECT_API_NOT_FOUND';
                message = 'KakaoPay did not recognize the payment API request; check the TEST payment configuration';
            } else if (operation === 'approve' && providerHttpStatus === 400 && providerErrorCode === -780) {
                reason = 'DIRECT_APPROVAL_FAILED';
                message = 'KakaoPay TEST payment approval failed; check payment status before retrying';
            } else if (providerHttpStatus === 429 && providerErrorCode === -429) {
                reason = 'DIRECT_TEST_QUOTA_EXCEEDED';
                message = 'KakaoPay TEST API request quota was exceeded; try checking payment status later';
            } else if (providerHttpStatus >= 500) {
                reason = 'DIRECT_PROVIDER_UNAVAILABLE';
                message = 'KakaoPay is temporarily unavailable; check payment status before retrying';
            } else if (!err?.response && ['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ERR_NETWORK'].includes(err?.code)) {
                reason = 'DIRECT_PROVIDER_NETWORK_ERROR';
                message = `Could not reach KakaoPay during TEST ${operation}; check payment status before retrying`;
            }
            throw new DirectKakaoPayRequestError(reason, message, providerHttpStatus, providerErrorCode,
                operation === 'ready' && knownRejection);
        }
    }
}
