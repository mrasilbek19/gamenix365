import { Types } from 'mongoose';
import { DirectKakaoCheckoutService } from './direct-kakao-checkout.service';
import { DirectKakaoPayService } from './direct-kakaopay.service';
import { PaymentService } from './payment.service';
import KakaoPayPaymentSchema from '../../libs/schemas/KakaoPayPayment.model';

const buyer = new Types.ObjectId();
const shop = new Types.ObjectId();
const orderId = new Types.ObjectId();
const productId = new Types.ObjectId();
const query = (callback: () => any) => { const value = { lean: () => value, exec: async () => callback() }; return value; };

describe('Direct KakaoPay durable order flow', () => {
    const original = { ...process.env };
    let direct: DirectKakaoCheckoutService, common: PaymentService;
    let record: any, facts: any, payments: any, orders: any, members: any, post: jest.Mock, order: any, legacy: any, indexes: any[];
    let readyInput: any, approveAction: (() => Promise<any>) | undefined, readyAction: (() => Promise<any>) | undefined, cancelAction: (() => Promise<any>) | undefined;
    const readyResponse = { tid: 'T1234567890123456789', next_redirect_pc_url: 'https://mockup-pg-web.kakao.com/v1/test/info',
        next_redirect_mobile_url: 'https://mockup-pg-web.kakao.com/v1/test/mInfo' };
    const matches = (search: any, current: any) => Object.entries(search).every(([key, expected]: [string, any]) => {
        if (key === '$or') return expected.some(condition => matches(condition, current));
        if (expected && '$exists' in Object(expected)) return expected.$exists === (current[key] !== undefined);
        return String(current[key]) === String(expected);
    });
    const markPaid = () => {
        facts = { ...facts, status: 'SUCCESS_PAYMENT', approved_at: '2026-10-28T12:00:00', canceled_amount: { total: 0 },
            payment_action_details: [{ aid: 'capture-one', payment_action_type: 'PAYMENT', amount: 1050, approved_at: '2026-10-28T12:00:00+09:00' }] };
    };
    const state = () => new URL(readyInput.approval_url).searchParams.get('kakaoState');
    const calls = (operation: string) => post.mock.calls.filter(([url]) => url.endsWith(`/${operation}`));
    const failPreparation = async () => {
        readyAction = async () => { throw new Error('network timeout with offline-dev-secret'); };
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow('ready request failed');
        readyAction = undefined;
    };
    const applyUpdate = (update: any) => {
        record = { ...record, ...update.$set, __v: record.__v + (update.$inc?.__v ?? 0) };
        for (const key of Object.keys(update.$unset ?? {})) delete record[key];
    };

    beforeEach(() => {
        process.env = { ...original, NODE_ENV: 'test', KAKAOPAY_ENVIRONMENT: 'SANDBOX', KAKAOPAY_PROVIDER: 'DIRECT',
            KAKAOPAY_SECRET_KEY: 'offline-dev-secret', KAKAOPAY_API_URL: 'https://open-api.kakaopay.com', KAKAOPAY_FRONTEND_ORIGIN: 'http://localhost:3000' };
        delete process.env.KAKAOPAY_CID;
        record = null; readyInput = null; approveAction = readyAction = cancelAction = undefined; legacy = null;
        order = { _id: orderId, memberId: buyer, shopId: shop, currency: 'KRW', orderTotal: 1050,
            orderSubtotal: 1000, orderDelivery: 50, orderStatus: 'PAUSE' };
        indexes = [{ key: { orderId: 1 }, unique: true }, { key: { paymentId: 1 }, unique: true }];
        payments = {
            db: { collection: jest.fn(() => ({ findOne: jest.fn(async () => legacy) })) },
            collection: { listIndexes: jest.fn(() => ({ toArray: async () => indexes })) },
            findOne: jest.fn(search => query(() => record && matches(search, record) ? { ...record } : null)),
            findOneAndUpdate: jest.fn((search, update, options) => query(() => {
                if (options.upsert) {
                    if (!record) record = { _id: new Types.ObjectId(), ...update.$setOnInsert, status: update.$setOnInsert.status ?? 'READY', verifiedSuccess: false, __v: 0 };
                } else {
                    if (!record || !matches(search, record)) return null;
                    applyUpdate(update);
                }
                return { ...record };
            })),
            updateOne: jest.fn((search, update) => query(() => {
                if (!record || !matches(search, record)) return { modifiedCount: 0 };
                applyUpdate(update);
                return { modifiedCount: 1 };
            })),
        };
        orders = { findOne: jest.fn(search => query(() => matches(search, order) ? { ...order } : null)) };
        const items = { find: jest.fn(() => query(() => [{ orderId, productId, currency: 'KRW', itemQuantity: 2, itemPrice: 500 }])) };
        members = { exists: jest.fn(() => query(() => ({ _id: buyer }))) };
        const products = { find: jest.fn(() => query(() => [{ _id: productId, memberId: shop, productLeftCount: 5 }])) };
        common = new PaymentService(payments, orders, items as any, members, products as any);
        facts = { tid: readyResponse.tid, cid: 'TC0ONETIME', status: 'READY', partner_order_id: `gamenix-test-kakao-${orderId}`,
            partner_user_id: '', amount: { total: 1050, tax_free: 0 }, canceled_amount: { total: 0 } };
        post = jest.fn(async (url, input) => {
            if (url.endsWith('/ready')) {
                readyInput = input; facts.partner_user_id = input.partner_user_id;
                return { data: readyAction ? await readyAction() : readyResponse };
            }
            if (url.endsWith('/approve')) {
                if (approveAction) return { data: await approveAction() };
                markPaid(); return { data: facts };
            }
            if (url.endsWith('/cancel')) {
                if (cancelAction) return { data: await cancelAction() };
                facts = { ...facts, status: 'CANCEL_PAYMENT', canceled_amount: { total: 1050 }, canceled_at: '2026-10-28T12:01:00+09:00' };
                return { data: { ...facts } };
            }
            if (url.endsWith('/order')) return { data: { ...facts } };
            throw new Error('Unexpected external endpoint');
        });
        direct = new DirectKakaoCheckoutService(payments, common, new DirectKakaoPayService({ axiosRef: { post } } as any));
    });
    afterEach(() => { process.env = { ...original }; });

    it('persists one TEST TID and hashed callback nonce, then reuses the same provider URLs', async () => {
        const session = await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        expect(session).toEqual({ orderId: String(orderId), paymentId: `gamenix-test-kakao-${orderId}`,
            nextRedirectPcUrl: readyResponse.next_redirect_pc_url, nextRedirectMobileUrl: readyResponse.next_redirect_mobile_url });
        expect(record).toMatchObject({ provider: 'DIRECT', cid: 'TC0ONETIME', tid: readyResponse.tid, readyState: 'READY', approvalState: 'WAITING' });
        expect(record.callbackStateHash).not.toBe(state());
        expect(record.callbackStateHash).toMatch(/^[a-f\d]{64}$/);
        expect(record.partnerUserId).not.toContain(String(buyer));
        const callback = new URL(readyInput.approval_url);
        expect(callback.origin).toBe('http://localhost:3000');
        expect(callback.pathname).toBe('/orders/process');
        expect(callback.searchParams.get('orderId')).toBe(String(orderId));
        expect(callback.searchParams.get('kakaoReturn')).toBe('approve');
        expect(readyInput).toMatchObject({ total_amount: 1050, quantity: 2, cid: 'TC0ONETIME', tax_free_amount: 0 });
        expect(await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).toEqual(session);
        expect(calls('ready')).toHaveLength(1);
    });

    it('claims readiness before concurrent tabs can issue another ready request', async () => {
        let resolve: (response: any) => void;
        readyAction = () => new Promise(done => { resolve = done; });
        const first = direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        await new Promise(done => setImmediate(done));
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow('pending');
        expect(calls('ready')).toHaveLength(1);
        resolve(readyResponse);
        await expect(first).resolves.toMatchObject({ paymentId: `gamenix-test-kakao-${orderId}` });
    });

    it('shows a sanitized preparation network error while retaining uncertainty and the saved order', async () => {
        readyAction = async () => { throw Object.assign(new Error('offline-dev-secret private-token'), { code: 'ETIMEDOUT' }); };
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow('Could not reach KakaoPay during TEST ready');
        expect(record).toMatchObject({ readyState: 'UNCERTAIN', status: 'PENDING', verifiedSuccess: false });
        expect(record.preparationError).not.toContain('offline-dev-secret');
        expect(record.preparationError).not.toContain('private-token');
        expect(record.tid).toBeUndefined();
        expect(calls('ready')).toHaveLength(1);
        expect(order.orderStatus).toBe('PAUSE');
    });

    it('queries an uncertain preparation without automatically posting another payment session', async () => {
        await failPreparation();
        expect(record).toMatchObject({ readyState: 'UNCERTAIN', status: 'PENDING' });
        expect(record.tid).toBeUndefined();
        for (let check = 0; check < 3; check++) {
            expect(await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId))).toMatchObject({
                status: 'PENDING', verifiedSuccess: false, preparationRetryable: true,
            });
        }
        expect(calls('ready')).toHaveLength(1);
        expect(calls('order')).toHaveLength(0);
    });

    it('explicitly retries an unopened uncertain session using the same payment record and immutable order snapshot', async () => {
        await failPreparation();
        const previous = { ...record }, previousState = state();
        const session = await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        expect(calls('ready')).toHaveLength(2);
        expect(String(record._id)).toBe(String(previous._id));
        for (const key of ['provider', 'orderId', 'memberId', 'shopId', 'paymentId', 'totalAmount', 'currency', 'orderName', 'customData', 'cid', 'partnerUserId']) {
            expect(record[key]).toEqual(previous[key]);
        }
        expect(session.paymentId).toBe(previous.paymentId);
        expect(record.readyClaimId).not.toBe(previous.readyClaimId);
        expect(record.callbackStateHash).not.toBe(previous.callbackStateHash);
        expect(state()).not.toBe(previousState);
        expect(record.preparationError).toBeUndefined();
        expect(record.preparationHttpStatus).toBeUndefined();
        expect(record.preparationErrorCode).toBeUndefined();
        await expect(direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), previousState, 'private-token')).rejects.toThrow('state is invalid');
        expect(calls('approve')).toHaveLength(0);
        expect(await direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'private-token')).toMatchObject({
            status: 'PAID', verifiedSuccess: true, preparationRetryable: false,
        });
        expect(calls('approve')).toHaveLength(1);
    });

    it('rotates an expired unopened session before exposing another checkout URL', async () => {
        await failPreparation();
        const previousState = state();
        record.callbackExpiresAt = new Date(Date.now() - 60_000);
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        expect(record.callbackExpiresAt.getTime()).toBeGreaterThan(Date.now());
        await expect(direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), previousState, 'private-token')).rejects.toThrow('state is invalid');
        expect(await direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'private-token')).toMatchObject({ verifiedSuccess: true });
        expect(calls('ready')).toHaveLength(2);
    });

    it('claims one explicit retry when several tabs retry the same unopened session concurrently', async () => {
        await failPreparation();
        const paymentId = record.paymentId, recordId = record._id;
        let release: (response: any) => void;
        readyAction = () => new Promise(resolve => { release = resolve; });
        const retries = Array.from({ length: 4 }, () => direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId)));
        const settled = Promise.allSettled(retries);
        await new Promise(resolve => setImmediate(resolve));
        expect(calls('ready')).toHaveLength(2);
        release(readyResponse);
        const results = await settled;
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(result => result.status === 'rejected')).toHaveLength(3);
        expect(record.paymentId).toBe(paymentId);
        expect(record._id).toEqual(recordId);
        expect(calls('ready')).toHaveLength(2);
    });

    it('preserves a definitive rejected preparation and permits one explicit retry after configuration is corrected', async () => {
        readyAction = async () => { throw { response: { status: 400, data: { error_code: -400,
            error_message: '\ub4f1\ub85d\ub41c \ub3c4\uba54\uc778\uc774 \uc5c6\uc2b5\ub2c8\ub2e4 private-provider-message offline-dev-secret' } } }; };
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow('Platform > Web > Site domains');
        expect(record).toMatchObject({ readyState: 'REJECTED', status: 'FAILED', preparationHttpStatus: 400, preparationErrorCode: -400 });
        const failed = await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId));
        expect(failed).toMatchObject({ status: 'FAILED', verifiedSuccess: false, preparationRetryable: true });
        expect(failed.preparationError).toContain('Platform > Web > Site domains');
        expect(JSON.stringify(record)).not.toContain('offline-dev-secret');
        expect(JSON.stringify(record)).not.toContain('private-provider-message');
        expect(calls('ready')).toHaveLength(1);
        const paymentId = record.paymentId, recordId = record._id;
        readyAction = undefined;
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        expect(record.paymentId).toBe(paymentId); expect(record._id).toEqual(recordId);
        expect(record.preparationError).toBeUndefined();
        expect(record.preparationHttpStatus).toBeUndefined();
        expect(record.preparationErrorCode).toBeUndefined();
        expect(await direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'private-token')).toMatchObject({ status: 'PAID', verifiedSuccess: true });
        expect(calls('ready')).toHaveLength(2);
        expect(calls('approve')).toHaveLength(1);
    });

    it.each([
        { tid: 'saved-tid' }, { transactionId: 'capture-reference' }, { paidAt: new Date() },
        { approvalClaimId: 'approval-reference' }, { approvalState: 'CLAIMED' }, { approvalState: 'UNCERTAIN' },
        { cancellationRequestedAt: new Date() }, { cancelledAt: new Date() },
        { nextRedirectPcUrl: readyResponse.next_redirect_pc_url }, { nextRedirectMobileUrl: readyResponse.next_redirect_mobile_url },
        { status: 'PAID' }, { status: 'CANCELLED' }, { verifiedSuccess: true },
    ])('does not retry a preparation containing prior payment or exposed checkout evidence %j', async evidence => {
        await failPreparation();
        Object.assign(record, evidence);
        expect((await common.getKakaoPayPaymentStatus(buyer as any, String(orderId))).preparationRetryable).toBe(false);
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow();
        expect(calls('ready')).toHaveLength(1);
    });

    it('rejects a stale preparation response without overwriting a newer retry claim or callback state', async () => {
        let release: (response: any) => void;
        readyAction = () => new Promise(resolve => { release = resolve; });
        const stale = direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        const staleResult = stale.catch(err => err);
        await new Promise(resolve => setImmediate(resolve));
        const staleClaim = record.readyClaimId;
        // Simulate an earlier process finishing its uncertainty write while its provider result is delayed.
        record.readyState = 'UNCERTAIN'; record.__v++;
        readyAction = undefined;
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        const current = { ...record };
        expect(current.readyClaimId).not.toBe(staleClaim);
        release({ ...readyResponse, tid: 'T-stale-provider-reference',
            next_redirect_pc_url: 'https://mockup-pg-web.kakao.com/v1/stale/info' });
        expect((await staleResult).message).toContain('uncertain');
        expect(record).toEqual(current);
        expect(calls('ready')).toHaveLength(2);
    });

    it('does not replace or execute an existing PortOne payment claim', async () => {
        record = { provider: 'PORTONE', orderId, memberId: buyer, shopId: shop, currency: 'KRW', totalAmount: 1050,
            paymentId: `gamenix-test-kakao-${orderId}`, status: 'READY', verifiedSuccess: false, __v: 0 };
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow();
        await expect(direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId))).rejects.toThrow();
        expect(post).not.toHaveBeenCalled();
        expect(KakaoPayPaymentSchema.indexes()).toEqual(expect.arrayContaining([
            [{ orderId: 1 }, expect.objectContaining({ unique: true })],
        ]));
    });

    it('preserves a retired payment claim and blocks a new provider request', async () => {
        legacy = { _id: new Types.ObjectId() };
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow('historical');
        expect(post).not.toHaveBeenCalled();
        expect(record).toBeNull();
    });

    it('rejects foreign owners, forged callback state and expired callbacks before approval', async () => {
        await expect(direct.prepareDirectKakaoPayCheckout(new Types.ObjectId() as any, String(orderId))).rejects.toThrow('Order not found');
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        await expect(direct.approveDirectKakaoPayPayment(new Types.ObjectId() as any, String(orderId), state(), 'token')).rejects.toThrow('Order not found');
        await expect(direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), 'forged', 'token')).rejects.toThrow('state is invalid');
        record.callbackExpiresAt = new Date(Date.now() - 1);
        await expect(direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'token')).rejects.toThrow('expired');
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow('expired');
        expect(calls('approve')).toHaveLength(0);
    });

    it('approves at most once across duplicate callbacks, then confirms with authoritative order queries', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        const results = await Promise.all(Array.from({ length: 5 }, () => direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'private-token')));
        expect(calls('approve')).toHaveLength(1);
        expect(calls('approve')[0][1]).toMatchObject({ cid: 'TC0ONETIME', tid: readyResponse.tid, pg_token: 'private-token',
            total_amount: 1050, partner_order_id: record.paymentId, partner_user_id: record.partnerUserId });
        expect(results.some(result => result.verifiedSuccess)).toBe(true);
        expect(await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId))).toMatchObject({ provider: 'DIRECT', status: 'PAID', verifiedSuccess: true });
        expect(record.providerApprovedAt).toBe('2026-10-28T12:00:00');
        expect(record.paidAt.toISOString()).toBe('2026-10-28T03:00:00.000Z');
        expect(record.approvalState).toBe('COMPLETE');
        await direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'private-token');
        expect(calls('approve')).toHaveLength(1);
        expect(Object.keys(orders)).toEqual(['findOne']);
        expect(Object.keys(members)).toEqual(['exists']);
    });

    it('recovers a lost approval response by querying the saved TID without another approval POST', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        approveAction = async () => { markPaid(); throw new Error('lost response'); };
        expect(await direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'token')).toMatchObject({ verifiedSuccess: true, status: 'PAID' });
        expect(calls('approve')).toHaveLength(1);
    });

    it('leaves uncertain approvals pending and accepts only query retries thereafter', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        facts.status = 'AUTH_PASSWORD';
        approveAction = async () => { throw new Error('timeout'); };
        await expect(direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'token')).rejects.toThrow('approve request failed');
        expect(record.approvalState).toBe('UNCERTAIN');
        expect(record).toMatchObject({ verifiedSuccess: false, status: 'PENDING' });
        await direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'token');
        await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId));
        expect(calls('approve')).toHaveLength(1);
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow('pending');
    });

    it('shows a sanitized approval rejection after lookup while retaining the original TID and approval claim', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        approveAction = async () => { throw { response: { status: 401, data: {
            error_code: -401, error_message: 'offline-dev-secret private-token',
        } } }; };
        const error = await direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'private-token').catch(err => err);
        expect(error.message).toContain('development Secret key');
        expect(error.message).not.toContain('offline-dev-secret');
        expect(error.message).not.toContain('private-token');
        expect(record).toMatchObject({ tid: readyResponse.tid, approvalState: 'UNCERTAIN', status: 'PENDING', verifiedSuccess: false });
        expect(await direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'private-token')).toMatchObject({ status: 'PENDING', verifiedSuccess: false });
        expect(calls('ready')).toHaveLength(1);
        expect(calls('approve')).toHaveLength(1);
    });

    it.each(['READY', 'SEND_TMS', 'OPEN_PAYMENT', 'SELECT_METHOD', 'ARS_WAITING', 'AUTH_PASSWORD'])('keeps known preapproval %s resumable with the same TID', async status => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        facts.status = status;
        expect(await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId))).toMatchObject({ status: 'READY', verifiedSuccess: false });
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        expect(calls('ready')).toHaveLength(1);
        expect(calls('approve')).toHaveLength(0);
    });

    it.each(['PART_CANCEL_PAYMENT', 'QUIT_PAYMENT', 'FAIL_PAYMENT', 'FAIL_AUTH_PASSWORD', 'UNKNOWN'])('does not claim success for provider %s', async status => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId)); facts.status = status;
        const result = await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId));
        expect(result.verifiedSuccess).toBe(false);
        expect(result.status).toBe(['UNKNOWN', 'PART_CANCEL_PAYMENT'].includes(status) ? 'PENDING' : status.startsWith('FAIL_') ? 'FAILED' : 'CANCELLED');
        await direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'token');
        expect(calls('approve')).toHaveLength(0);
    });

    it.each([
        { tid: 'foreign' }, { cid: 'LIVE-CID' }, { partner_order_id: 'foreign' }, { partner_user_id: 'foreign' },
        { amount: { total: 1051, tax_free: 0 } }, { canceled_amount: { total: 1 } }, { approved_at: 'invalid' },
        { payment_action_details: [] },
    ])('rejects forged or mismatched provider capture %j', async override => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId)); markPaid(); facts = { ...facts, ...override };
        await expect(direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId))).rejects.toThrow();
        expect(record.verifiedSuccess).toBe(false);
    });

    it('never marks paid from an approval response when the authoritative order remains pending', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        approveAction = async () => ({ ...facts, status: 'SUCCESS_PAYMENT' });
        expect(await direct.approveDirectKakaoPayPayment(buyer as any, String(orderId), state(), 'token')).toMatchObject({ verifiedSuccess: false, status: 'PENDING' });
    });

    it('does not let a stale paid lookup overwrite a newer authoritative cancellation', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId)); markPaid();
        await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId));
        const paid = { ...facts };
        let resolve: (response: any) => void;
        post.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const stale = direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId));
        await new Promise(done => setImmediate(done));
        facts = { ...facts, status: 'CANCEL_PAYMENT', canceled_amount: { total: 1050 }, canceled_at: '2026-10-28T12:01:00+09:00' };
        expect(await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId))).toMatchObject({ status: 'CANCELLED', verifiedSuccess: false });
        resolve({ data: paid });
        expect(await stale).toMatchObject({ status: 'CANCELLED', verifiedSuccess: false });
        expect(record.transactionId).toBe('capture-one');
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow('cannot be restarted');
    });

    it('requires durable capture evidence before reporting paid and recovers after a failed status write', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId)); markPaid();
        payments.findOneAndUpdate.mockReturnValueOnce(query(() => { throw new Error('storage unavailable'); }));
        await expect(direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId))).rejects.toThrow('storage unavailable');
        expect(record.verifiedSuccess).toBe(false);
        expect(await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId))).toMatchObject({ status: 'PAID', verifiedSuccess: true });
        expect(calls('approve')).toHaveLength(0);
    });

    it('fails closed on missing unique indexes and leaves no provider ready request', async () => {
        indexes = [];
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow('indexes');
        expect(calls('ready')).toHaveLength(0);
    });
    it('cancels a verified owner payment once and confirms the result by order inquiry', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        markPaid(); await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId));
        const result = await direct.cancelDirectKakaoPayPayment(buyer as any, String(orderId));
        expect(calls('cancel')).toHaveLength(1);
        expect(calls('cancel')[0][1]).toMatchObject({ cid: 'TC0ONETIME', tid: readyResponse.tid, cancel_amount: 1050, cancel_tax_free_amount: 0 });
        expect(result).toMatchObject({ status: 'CANCELLED', verifiedSuccess: false, cancellationPending: false });
        await direct.cancelDirectKakaoPayPayment(buyer as any, String(orderId));
        expect(calls('cancel')).toHaveLength(1);
        expect(order.orderStatus).toBe('PAUSE');
        expect(Object.keys(orders)).toEqual(['findOne']);
        expect(Object.keys(members)).toEqual(['exists']);
    });

    it('claims cancellation before concurrent owner requests can post another refund', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        markPaid(); await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId));
        let release: () => void;
        cancelAction = () => new Promise(resolve => { release = () => {
            facts = { ...facts, status: 'CANCEL_PAYMENT', canceled_amount: { total: 1050 }, canceled_at: '2026-10-28T12:01:00+09:00' };
            resolve({ ...facts });
        }; });
        const first = direct.cancelDirectKakaoPayPayment(buyer as any, String(orderId));
        await new Promise(resolve => setImmediate(resolve));
        expect(record.cancellationRequestedAt).toBeInstanceOf(Date);
        const second = await direct.cancelDirectKakaoPayPayment(buyer as any, String(orderId));
        expect(second.cancellationPending).toBe(true);
        expect(calls('cancel')).toHaveLength(1);
        release();
        expect((await first).status).toBe('CANCELLED');
    });

    it('does not automatically repeat a cancellation after an ambiguous provider response', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        markPaid(); await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId));
        cancelAction = async () => { throw new Error('offline-dev-secret uncertain timeout'); };
        const result = await direct.cancelDirectKakaoPayPayment(buyer as any, String(orderId));
        expect(result.cancellationPending).toBe(true);
        await direct.cancelDirectKakaoPayPayment(buyer as any, String(orderId));
        expect(calls('cancel')).toHaveLength(1);
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow();
    });

    it('requires full refund evidence and treats a partial refund as pending manual review', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        markPaid(); await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId));
        facts = { ...facts, status: 'CANCEL_PAYMENT', canceled_amount: { total: 1 }, canceled_at: '2026-10-28T12:01:00+09:00' };
        await expect(direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId))).rejects.toThrow();
        facts = { ...facts, status: 'PART_CANCEL_PAYMENT' };
        expect((await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId))).status).toBe('PENDING');
        expect(record.transactionId).toBe('capture-one');
        await expect(direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId))).rejects.toThrow();
    });

    it('does not refund another owner or an already processing/finished order', async () => {
        await direct.prepareDirectKakaoPayCheckout(buyer as any, String(orderId));
        markPaid(); await direct.verifyDirectKakaoPayPayment(buyer as any, String(orderId));
        await expect(direct.cancelDirectKakaoPayPayment(new Types.ObjectId() as any, String(orderId))).rejects.toThrow('Order not found');
        for (const status of ['PROCESS', 'FINISHED']) {
            order.orderStatus = status;
            await expect(direct.cancelDirectKakaoPayPayment(buyer as any, String(orderId))).rejects.toThrow();
        }
        expect(calls('cancel')).toHaveLength(0);
    });

});
