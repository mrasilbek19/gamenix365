import { HttpService } from '@nestjs/axios';
import { DirectKakaoPayRequestError, DirectKakaoPayService } from './direct-kakaopay.service';
import { kakaoPayDate } from './direct-kakao-checkout.service';
import { Logger } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { LoggingInterceptor } from '../../libs/interceptor/Logging.interceptor';
import { firstValueFrom, of } from 'rxjs';

describe('Direct KakaoPay TEST provider boundary', () => {
    const original = { ...process.env };
    let post: jest.Mock;
    let service: DirectKakaoPayService;
    const input = { partner_order_id: 'order-ref', partner_user_id: 'opaque-user', item_name: 'Gaming order', quantity: 1,
        total_amount: 1050, approval_url: 'http://localhost:3000/approve', cancel_url: 'http://localhost:3000/cancel',
        fail_url: 'http://localhost:3000/fail' };
    const response = { tid: 'T1234567890123456789', next_redirect_pc_url: 'https://mockup-pg-web.kakao.com/v1/example/info',
        next_redirect_mobile_url: 'https://mockup-pg-web.kakao.com/v1/example/mInfo' };

    beforeEach(() => {
        process.env = { ...original, NODE_ENV: 'test', KAKAOPAY_ENVIRONMENT: 'SANDBOX',
            KAKAOPAY_SECRET_KEY: 'offline-dev-secret', KAKAOPAY_API_URL: 'https://open-api.kakaopay.com', KAKAOPAY_FRONTEND_ORIGIN: 'http://localhost:3000' };
        delete process.env.KAKAOPAY_CID; delete process.env.KAKAOPAY_PROVIDER;
        post = jest.fn().mockResolvedValue({ data: response });
        service = new DirectKakaoPayService({ axiosRef: { post } } as unknown as HttpService);
    });
    afterEach(() => { process.env = { ...original }; });

    it('uses the existing direct key without PortOne credentials or a provider selector', () => {
        delete process.env.PORTONE_V2_API_SECRET;
        process.env.KAKAOPAY_PROVIDER = 'PORTONE';
        expect(service.getAvailability()).toMatchObject({ provider: 'DIRECT', enabled: true });
        delete process.env.KAKAOPAY_SECRET_KEY;
        process.env.KAKAOPAY_SECRET_KEY_DEV = 'unused-old-variable';
        expect(service.getAvailability()).toMatchObject({ provider: 'DIRECT', enabled: false });
    });

    it('supports the three requested environment names with development defaults', () => {
        delete process.env.KAKAOPAY_ENVIRONMENT;
        delete process.env.KAKAOPAY_FRONTEND_ORIGIN;
        expect(service.getAvailability()).toMatchObject({ provider: 'DIRECT', enabled: true });
    });

    it('uses the documented JSON API, dev secret header and hard-pinned one-time TEST CID', async () => {
        expect(service.getAvailability()).toEqual({ provider: 'DIRECT', enabled: true, currency: 'KRW', requiredCurrency: 'KRW', blockers: [] });
        expect(post).not.toHaveBeenCalled();
        await service.ready(input);
        expect(post).toHaveBeenCalledWith('https://open-api.kakaopay.com/online/v1/payment/ready',
            { ...input, cid: 'TC0ONETIME', tax_free_amount: 0 }, expect.objectContaining({
                headers: { Authorization: 'SECRET_KEY offline-dev-secret', 'Content-Type': 'application/json' }, maxRedirects: 0, timeout: 15000,
            }));
        expect(JSON.stringify(post.mock.calls)).not.toContain('KakaoAK');
    });

    it.each([
        { NODE_ENV: 'production' }, { KAKAOPAY_ENVIRONMENT: 'LIVE' }, { KAKAOPAY_SECRET_KEY: '' },
        { KAKAOPAY_CID: 'TCSEQUENCE' }, { KAKAOPAY_CID: 'LIVE123456' },
        { KAKAOPAY_API_URL: 'https://attacker.example' }, { KAKAOPAY_API_URL: 'http://open-api.kakaopay.com' },
        { KAKAOPAY_API_URL: 'https://user:secret@open-api.kakaopay.com' }, { KAKAOPAY_API_URL: 'https://open-api.kakaopay.com/other-path' }, { KAKAOPAY_FRONTEND_ORIGIN: 'http://external.example' },
        { KAKAOPAY_FRONTEND_ORIGIN: 'https://user:password@example.com' },
        { KAKAOPAY_FRONTEND_ORIGIN: 'https://example.com/untrusted-path' },
    ])('rejects unsafe or unconfigured environments %j before any provider request', async override => {
        Object.assign(process.env, override);
        expect(service.getAvailability().enabled).toBe(false);
        await expect(service.ready(input)).rejects.toThrow();
        await expect(service.getOrder('saved-tid')).rejects.toThrow();
        expect(post).not.toHaveBeenCalled();
    });

    it.each(['https://mockup-pg-web.kakao.com/v1/test/info', 'https://online-pay.kakao.com/mock/test', 'https://online-pay.kakaopay.com/mockup/v1/test/info',
        'https://online-payment.kakaopay.com/test'])('accepts documented provider web origin %s', url => {
        expect(() => service.requireRedirectUrl(url)).not.toThrow();
    });

    it.each(['http://mockup-pg-web.kakao.com/v1/a', 'https://mockup-pg-web.kakao.com.evil.example/v1/a',
        'https://evil.example/v1/a', 'https://user:password@mockup-pg-web.kakao.com/v1/a',
        'https://mockup-pg-web.kakao.com:8443/v1/a', 'javascript:alert(1)', 'not-a-url'])('rejects unsafe provider redirect %s', url => {
        expect(() => service.requireRedirectUrl(url)).toThrow();
    });

    it('sanitizes provider errors and rejects approval response binding mismatches', async () => {
        post.mockRejectedValueOnce(new Error('offline-dev-secret pg-token private provider response'));
        await expect(service.ready(input)).rejects.toThrow('KakaoPay TEST ready request failed');
        post.mockResolvedValueOnce({ data: { tid: 'foreign', cid: 'TC0ONETIME' } });
        await expect(service.approve({ tid: response.tid, partner_order_id: 'order-ref', partner_user_id: 'opaque-user',
            pg_token: 'pg-token', total_amount: 1050 })).rejects.toThrow('does not match');
    });

    it.each([
        ['\ud50c\ub7ab\ud3fc > Web > \uc0ac\uc774\ud2b8 \ub3c4\uba54\uc778\uc5d0 \ub4f1\ub85d\ub41c \ub3c4\uba54\uc778\uc774 \uc5c6\uc5b4 \ub3c4\uba54\uc778 \uac80\uc99d\uc774 \ubd88\uac00\ub2a5\ud569\ub2c8\ub2e4', 'DIRECT_RETURN_DOMAIN_NOT_REGISTERED'],
        ['\ub4f1\ub85d\ub41c \ub3c4\uba54\uc778(\ud50c\ub7ab\ud3fc > Web > \uc0ac\uc774\ud2b8\ub3c4\uba54\uc778)\uc774 \uc874\uc7ac\ud558\uc9c0 \uc54a\uc544 \ub3c4\uba54\uc778 \uac80\uc99d\uc774 \ubd88\uac00\ub2a5\ud569\ub2c8\ub2e4', 'DIRECT_RETURN_DOMAIN_NOT_REGISTERED'],
        ['No registered Web site domains exist', 'DIRECT_RETURN_DOMAIN_NOT_REGISTERED'],
        ['body.approval_url: \uc0ac\uc774\ud2b8\ub3c4\uba54\uc778\uc73c\ub85c \ub4f1\ub85d\ub41c \ub3c4\uba54\uc778\uc774 \ud3ec\ud568\ub41c URL\uc774 \uc544\ub2d9\ub2c8\ub2e4', 'DIRECT_RETURN_DOMAIN_MISMATCH'],
        ['The callback domain does not match a registered site domain', 'DIRECT_RETURN_DOMAIN_MISMATCH'],
    ])('reports a definitive domain rejection without exposing provider details: %s', async (domainMessage, reason) => {
        process.env.KAKAOPAY_FRONTEND_ORIGIN = 'http://localhost:3100';
        post.mockRejectedValueOnce({ response: { status: 400, data: { error_code: -400,
            error_message: `${domainMessage}: https://private.example/callback?pg_token=private-token&secret=offline-dev-secret` } },
            config: { headers: { Authorization: 'SECRET_KEY offline-dev-secret' } } });
        const error = await service.ready(input).catch(err => err);
        expect(error).toBeInstanceOf(DirectKakaoPayRequestError);
        expect(error).toMatchObject({ reason, providerHttpStatus: 400,
            providerErrorCode: -400, definitiveReadyRejection: true });
        expect(error.message).toContain('http://localhost:3100');
        expect(error.message).not.toContain('http://localhost:3000');
        expect(error.message).toContain('Platform > Web > Site domains');
        const exposed = JSON.stringify({ message: error.message, response: error.getResponse(), error });
        for (const secret of ['offline-dev-secret', 'private-token', 'private.example', domainMessage]) expect(exposed).not.toContain(secret);
    });

    it.each([
        ['body.cid: invalid value', 'DIRECT_TEST_CID_INVALID', 'KAKAOPAY_CID=TC0ONETIME'],
        ['\uac00\ub9f9\uc810 \ucf54\ub4dc \uc624\ub958', 'DIRECT_TEST_CID_INVALID', 'KAKAOPAY_CID=TC0ONETIME'],
        ['body.approval_url: invalid URL', 'DIRECT_RETURN_URL_INVALID', 'approval, cancel and fail URLs'],
        ['body.cancel_url: exceeds 255 characters', 'DIRECT_RETURN_URL_INVALID', 'approval, cancel and fail URLs'],
        ['body.fail_url: invalid URL', 'DIRECT_RETURN_URL_INVALID', 'approval, cancel and fail URLs'],
        ['body.total_amount: invalid integer', 'DIRECT_AMOUNT_INVALID', 'saved order total'],
        ['body.tax_free_amount: invalid value', 'DIRECT_AMOUNT_INVALID', 'saved order total'],
        ['\uacb0\uc81c \uae08\uc561 \uc624\ub958', 'DIRECT_AMOUNT_INVALID', 'saved order total'],
    ])('distinguishes rejected request fields without exposing values: %s', async (providerMessage, reason, message) => {
        post.mockRejectedValueOnce({ response: { status: 400, data: { error_code: -400,
            error_message: `${providerMessage} private-token offline-dev-secret` } } });
        const error = await service.ready(input).catch(err => err);
        expect(error).toMatchObject({ reason, providerHttpStatus: 400, providerErrorCode: -400, definitiveReadyRejection: true });
        expect(error.message).toContain(message);
        const exposed = JSON.stringify({ message: error.message, response: error.getResponse(), error });
        for (const secret of ['private-token', 'offline-dev-secret', providerMessage]) expect(exposed).not.toContain(secret);
    });

    it.each([
        [400, -400, 'DIRECT_REQUEST_INVALID'], [401, -401, 'DIRECT_TEST_KEY_INVALID'],
        [403, -403, 'DIRECT_TEST_API_NOT_ENABLED'], [404, -404, 'DIRECT_API_NOT_FOUND'],
    ])('classifies documented preparation rejection HTTP %s / %s as safely retryable', async (status, code, reason) => {
        post.mockRejectedValueOnce({ response: { status, data: { error_code: code, error_message: 'private-provider-message offline-dev-secret' } } });
        const error = await service.ready(input).catch(err => err);
        expect(error).toBeInstanceOf(DirectKakaoPayRequestError);
        expect(error).toMatchObject({ reason, providerHttpStatus: status, providerErrorCode: code, definitiveReadyRejection: true });
        expect(error.message).not.toContain('private-provider-message');
        expect(error.message).not.toContain('offline-dev-secret');
    });

    it.each([
        [429, -429, 'DIRECT_TEST_QUOTA_EXCEEDED'], [500, -500, 'DIRECT_PROVIDER_UNAVAILABLE'],
        [503, -503, 'DIRECT_PROVIDER_UNAVAILABLE'], [400, -780, 'DIRECT_PROVIDER_REQUEST_FAILED'],
        [401, undefined, 'DIRECT_PROVIDER_REQUEST_FAILED'], [400, '-400', 'DIRECT_PROVIDER_REQUEST_FAILED'],
    ])('keeps HTTP %s / %s failures uncertain without the documented definitive rejection pair', async (status, code, reason) => {
        post.mockRejectedValueOnce({ response: { status, data: { error_code: code, error_message: 'private-provider-message' } } });
        const error = await service.ready(input).catch(err => err);
        expect(error).toBeInstanceOf(DirectKakaoPayRequestError);
        expect(error).toMatchObject({ reason, providerHttpStatus: status, definitiveReadyRejection: false });
        expect(error.providerErrorCode).toBe(typeof code === 'number' ? code : undefined);
    });

    it('leaves transport timeouts uncertain and never attaches the raw exception or request', async () => {
        post.mockRejectedValueOnce(Object.assign(new Error('timeout offline-dev-secret private-token'), {
            code: 'ECONNABORTED', config: { headers: { Authorization: 'SECRET_KEY offline-dev-secret' } },
        }));
        const error = await service.ready(input).catch(err => err);
        expect(error).toBeInstanceOf(DirectKakaoPayRequestError);
        expect(error).toMatchObject({ reason: 'DIRECT_PROVIDER_NETWORK_ERROR', definitiveReadyRejection: false });
        expect(error.message).toContain('Could not reach KakaoPay during TEST ready');
        expect(error.providerHttpStatus).toBeUndefined();
        expect(error.providerErrorCode).toBeUndefined();
        const exposed = JSON.stringify({ message: error.message, stack: error.stack, error });
        for (const secret of ['offline-dev-secret', 'private-token', 'ECONNABORTED', 'Authorization']) expect(exposed).not.toContain(secret);
    });

    it.each(['ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ERR_NETWORK'])('reports transport failure %s without releasing preparation protections', async code => {
        post.mockRejectedValueOnce({ code, message: 'private-token offline-dev-secret' });
        const error = await service.ready(input).catch(err => err);
        expect(error).toMatchObject({ reason: 'DIRECT_PROVIDER_NETWORK_ERROR', definitiveReadyRejection: false });
        expect(error.providerHttpStatus).toBeUndefined();
        expect(error.providerErrorCode).toBeUndefined();
        expect(JSON.stringify(error)).not.toContain(code);
        expect(JSON.stringify(error)).not.toContain('private-token');
        expect(JSON.stringify(error)).not.toContain('offline-dev-secret');
    });

    it('does not copy unexpected provider values into safe diagnostic fields', async () => {
        post.mockRejectedValueOnce({ response: { status: 'offline-dev-secret', data: {
            error_code: 'private-token', error_message: 'domain private-provider-message',
        } } });
        const error = await service.ready(input).catch(err => err);
        expect(error.providerHttpStatus).toBeUndefined();
        expect(error.providerErrorCode).toBeUndefined();
        expect(error.definitiveReadyRejection).toBe(false);
        expect(JSON.stringify(error)).not.toContain('offline-dev-secret');
        expect(JSON.stringify(error)).not.toContain('private-token');
    });

    it('preserves an already classified safe provider error', async () => {
        const classified = new DirectKakaoPayRequestError('DIRECT_TEST_KEY_INVALID', 'Check the development key', 401, -401, true);
        post.mockRejectedValueOnce(classified);
        await expect(service.ready(input)).rejects.toBe(classified);
    });

    it('never treats an approval rejection as permission to start another payment', async () => {
        post.mockRejectedValueOnce({ response: { status: 400, data: { error_code: -400, error_message: 'invalid request' } } });
        const error = await service.approve({ tid: response.tid, partner_order_id: 'order-ref', partner_user_id: 'opaque-user',
            pg_token: 'private-token', total_amount: 1050 }).catch(err => err);
        expect(error).toMatchObject({ providerHttpStatus: 400, providerErrorCode: -400, definitiveReadyRejection: false });
    });

    it('reports the documented approval failure without exposing payment-method details or allowing another charge', async () => {
        post.mockRejectedValueOnce({ response: { status: 400, data: { error_code: -780, error_message: 'approval failure! private-token',
            extras: { method_result_code: 'USER_LOCKED', method_result_message: 'offline-dev-secret private details' } } } });
        const error = await service.approve({ tid: response.tid, partner_order_id: 'order-ref', partner_user_id: 'opaque-user',
            pg_token: 'private-token', total_amount: 1050 }).catch(err => err);
        expect(error).toMatchObject({ reason: 'DIRECT_APPROVAL_FAILED', providerHttpStatus: 400, providerErrorCode: -780,
            definitiveReadyRejection: false });
        expect(error.message).toContain('payment approval failed');
        const exposed = JSON.stringify({ message: error.message, response: error.getResponse(), error });
        for (const secret of ['private-token', 'offline-dev-secret', 'USER_LOCKED', 'private details']) expect(exposed).not.toContain(secret);
    });

    it('accepts current official sandbox checkout URLs returned by preparation', async () => {
        const redirects = { ...response, next_redirect_pc_url: 'https://online-pay.kakaopay.com/mockup/v1/test/info',
            next_redirect_mobile_url: 'https://online-pay.kakaopay.com/mockup/v1/test/mInfo' };
        post.mockResolvedValueOnce({ data: redirects });
        await expect(service.ready(input)).resolves.toEqual(redirects);
    });

    it('does not turn an invalid successful preparation response into a definitive rejection', async () => {
        post.mockResolvedValueOnce({ data: { ...response, next_redirect_pc_url: 'https://untrusted.example/checkout' } });
        const error = await service.ready(input).catch(err => err);
        expect(error.message).toContain('redirect is not allowed');
        expect(error.definitiveReadyRejection).not.toBe(true);
    });

    it('retrieves orders by saved TID and fixed CID without any browser payment data', async () => {
        await service.getOrder(response.tid);
        expect(post.mock.calls[0][0]).toBe('https://open-api.kakaopay.com/online/v1/payment/order');
        expect(post.mock.calls[0][1]).toEqual({ cid: 'TC0ONETIME', tid: response.tid });
    });

    it('posts a full refund against the saved TID and never uses a browser price', async () => {
        post.mockResolvedValueOnce({ data: { tid: response.tid, cid: 'TC0ONETIME', status: 'CANCEL_PAYMENT' } });
        await service.cancel(response.tid, 1050);
        expect(post).toHaveBeenCalledWith('https://open-api.kakaopay.com/online/v1/payment/cancel',
            expect.objectContaining({ cid: 'TC0ONETIME', tid: response.tid, cancel_amount: 1050, cancel_tax_free_amount: 0 }),
            expect.objectContaining({ headers: { Authorization: 'SECRET_KEY offline-dev-secret', 'Content-Type': 'application/json' } }));
    });

    it('normalizes documented naive Korean dates independently of the host timezone', () => {
        const timestamps = ['UTC', 'Asia/Seoul', 'America/New_York'].map(zone => {
            process.env.TZ = zone;
            return kakaoPayDate('2026-10-28T12:00:00').toISOString();
        });
        expect(timestamps).toEqual(Array(3).fill('2026-10-28T03:00:00.000Z'));
        expect(kakaoPayDate('2026-10-28T12:00:00+09:00').toISOString()).toBe(timestamps[0]);
        for (const invalid of ['2026-10-28 12:00:00', '2026-10-28', '', 'invalid']) expect(() => kakaoPayDate(invalid)).toThrow();
    });

    it.each([
        { body: { query: 'mutation { callback: approveKakaoPayPayment(orderId:"o",state:"private-state",pgToken:"private-token") { status } }' } },
        { body: [{ query: 'query { getShippingPolicy { currency } }' }, { query: 'mutation { prepared: prepareKakaoPayCheckout(orderId:"o") { paymentId } }' }] },
        { body: { extensions: { persistedQuery: { sha256Hash: 'hash' } }, variables: { pgToken: 'private-token', state: 'private-state' } } },
    ])('redacts actual, aliased, batched and persisted payment requests/responses', async ({ body }) => {
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        const context = jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({ getInfo: () => ({ fieldName: 'getShippingPolicy' }),
            getContext: () => ({ req: { body } }) } as any);
        try {
            await firstValueFrom(new LoggingInterceptor().intercept({ getType: () => 'graphql' } as any,
                { handle: () => of({ private: 'private-token', redirect: 'opaque-provider-reference', state: 'private-state' }) }));
            const output = JSON.stringify(log.mock.calls);
            for (const secret of ['private-token', 'private-state', 'opaque-provider-reference']) expect(output).not.toContain(secret);
        } finally { log.mockRestore(); context.mockRestore(); }
    });
});
