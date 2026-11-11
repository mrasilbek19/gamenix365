import { model, Types } from 'mongoose';
import { OrderStatus } from '../../libs/enums/order.enum';
import { PaymentStatus } from '../../libs/enums/payment.enum';
import PaymentSchema from '../../libs/schemas/KakaoPayPayment.model';
import { PaymentService } from './payment.service';

const query = (read: () => any) => ({ lean: jest.fn().mockReturnThis(), exec: jest.fn(async () => read()) });

describe('Existing order validation shared by direct KakaoPay (offline persistence)', () => {
    const ownerId = new Types.ObjectId(), shopId = new Types.ObjectId(), orderId = new Types.ObjectId(), productId = new Types.ObjectId();
    let service: PaymentService, orders: any, items: any, members: any, products: any, payments: any;
    let order: any, lines: any[], listings: any[], record: any, legacy: any, indexes: any[];
    const snapshot = (extra = {}) => ({ provider: 'DIRECT', orderId, memberId: ownerId, shopId,
        paymentId: `gamenix-test-kakao-${orderId}`, totalAmount: 50050, currency: 'KRW', orderName: 'Gamenix order',
        customData: JSON.stringify({ memberId: String(ownerId), orderId: String(orderId) }),
        status: PaymentStatus.READY, verifiedSuccess: false, __v: 0, ...extra });

    beforeEach(() => {
        order = { _id: orderId, memberId: ownerId, shopId, currency: 'KRW', orderSubtotal: 50000, orderTotal: 50050,
            orderDelivery: 50, orderStatus: OrderStatus.PAUSE };
        lines = [{ orderId, productId, itemPrice: 25000, itemQuantity: 2, currency: 'KRW' }];
        listings = [{ _id: productId, memberId: shopId, productPrice: 99999, productLeftCount: 10 }];
        record = undefined; legacy = null;
        indexes = [{ key: { orderId: 1 }, unique: true }, { key: { paymentId: 1 }, unique: true }];
        orders = { findOne: jest.fn((search) => query(() => order && String(search.memberId) === String(order.memberId) &&
            String(search._id) === String(order._id) ? { ...order } : null)) };
        items = { find: jest.fn(() => query(() => lines)) };
        members = { exists: jest.fn(() => query(() => ({ _id: ownerId }))) };
        products = { find: jest.fn(() => query(() => listings)) };
        payments = {
            db: { collection: jest.fn(() => ({ findOne: jest.fn(async () => legacy) })) },
            collection: { listIndexes: jest.fn(() => ({ toArray: async () => indexes })) },
            findOne: jest.fn(() => query(() => record && { ...record })),
        };
        service = new PaymentService(payments, orders, items, members, products);
    });

    it('returns an existing owned order and authoritative saved item prices without order/stock/point writes', async () => {
        const result = await service.getPayableOrder(ownerId as any, String(orderId));
        expect(result).toMatchObject({ orderTotal: 50050, orderSubtotal: 50000, currency: 'KRW', shopId, orderItems: lines });
        expect(order.orderStatus).toBe(OrderStatus.PAUSE); expect(listings[0].productLeftCount).toBe(10);
        expect(Object.keys(orders)).toEqual(['findOne']); expect(Object.keys(items)).toEqual(['find']);
        expect(Object.keys(products)).toEqual(['find']); expect(Object.keys(members)).toEqual(['exists']);
    });

    it.each(['getOwnedOrder', 'getPayableOrder', 'getKakaoPayPaymentStatus'])('%s scopes reads to the authenticated order owner', async (method) => {
        await expect(service[method](new Types.ObjectId(), String(orderId))).rejects.toThrow('Order not found');
        expect(payments.findOne).not.toHaveBeenCalled();
    });

    it.each(['invalid', '', '507f1f77bcf86cd799439018extra'])('rejects malformed order ID %s before model access', async (value) => {
        await expect(service.getPayableOrder(ownerId as any, value)).rejects.toThrow('Invalid order reference');
        expect(orders.findOne).not.toHaveBeenCalled();
    });

    it.each([OrderStatus.PROCESS, OrderStatus.FINISHED])('does not initiate new payment for %s fulfillment', async (value) => {
        order.orderStatus = value;
        await expect(service.getPayableOrder(ownerId as any, String(orderId))).rejects.toThrow();
    });

    it('requires current active buyer and SHOP eligibility', async () => {
        members.exists.mockImplementation(() => query(() => null));
        await expect(service.getPayableOrder(ownerId as any, String(orderId))).rejects.toThrow('active buyer and shop');
    });

    it.each(['legacy currency', 'wrong total', 'missing items', 'fractional quantity', 'fractional price', 'mixed shops', 'missing product'])('rejects %s order snapshots', async (failure) => {
        if (failure === 'legacy currency') order.currency = undefined;
        if (failure === 'wrong total') order.orderTotal++;
        if (failure === 'missing items') lines = [];
        if (failure === 'fractional quantity') lines[0].itemQuantity = 1.5;
        if (failure === 'fractional price') lines[0].itemPrice = 1.5;
        if (failure === 'mixed shops') listings[0].memberId = new Types.ObjectId();
        if (failure === 'missing product') listings = [];
        await expect(service.getPayableOrder(ownerId as any, String(orderId))).rejects.toThrow();
    });

    it('blocks retired payment history without altering its records', async () => {
        legacy = { _id: new Types.ObjectId() };
        await expect(service.getPayableOrder(ownerId as any, String(orderId))).rejects.toThrow('historical');
        expect(record).toBeUndefined();
    });

    it.each(['missing', 'sparse', 'partial'])('fails closed on %s unique-index protection', async (failure) => {
        if (failure === 'missing') indexes = [];
        if (failure === 'sparse') indexes[0].sparse = true;
        if (failure === 'partial') indexes[0].partialFilterExpression = { provider: 'DIRECT' };
        await expect(service.requireUniqueIndexes()).rejects.toThrow('unique indexes');
    });

    it('reports DIRECT when not started and retains the provider of existing legacy history', async () => {
        expect(await service.getKakaoPayPaymentStatus(ownerId as any, String(orderId))).toMatchObject({
            provider: 'DIRECT', status: 'NOT_STARTED', verifiedSuccess: false, preparationRetryable: false,
        });
        record = snapshot({ provider: undefined });
        expect((await service.getKakaoPayPaymentStatus(ownerId as any, String(orderId))).provider).toBe('PORTONE');
    });

    it.each(['UNCERTAIN', 'REJECTED'])('offers an explicit retry for an unopened %s preparation without changing payment state', async readyState => {
        record = snapshot({ readyState, approvalState: 'WAITING', status: readyState === 'REJECTED' ? PaymentStatus.FAILED : PaymentStatus.PENDING });
        const previous = { ...record };
        const result = await service.getKakaoPayPaymentStatus(ownerId as any, String(orderId));
        expect(result).toMatchObject({ preparationRetryable: true, verifiedSuccess: false });
        expect(result.preparationError).toBe('Checkout was not opened. Retry payment for this saved order.');
        expect(record).toEqual(previous);
    });

    it('returns the saved actionable preparation error while keeping provider details private', async () => {
        record = snapshot({ readyState: 'REJECTED', approvalState: 'WAITING', status: PaymentStatus.FAILED,
            preparationError: 'Register the checkout origin in KakaoPay Developers > Application > Platform > Web > Site domains, then try again',
            preparationHttpStatus: 400, preparationErrorCode: -400, callbackStateHash: 'private-hash', readyClaimId: 'private-claim' });
        const result = await service.getKakaoPayPaymentStatus(ownerId as any, String(orderId));
        expect(result).toMatchObject({ preparationRetryable: true, preparationError: record.preparationError });
        for (const field of ['preparationHttpStatus', 'preparationErrorCode', 'callbackStateHash', 'readyClaimId']) {
            expect(result).not.toHaveProperty(field);
        }
    });

    it.each([
        { provider: 'PORTONE' }, { readyState: 'CLAIMED' }, { readyState: 'READY' },
        { tid: 'saved-tid' }, { transactionId: 'capture-reference' }, { paidAt: new Date() },
        { approvalClaimId: 'approval-reference' }, { approvalState: 'CLAIMED' }, { approvalState: 'UNCERTAIN' },
        { cancellationRequestedAt: new Date() }, { cancelledAt: new Date() },
        { nextRedirectPcUrl: 'https://mockup-pg-web.kakao.com/v1/test/info' },
        { nextRedirectMobileUrl: 'https://mockup-pg-web.kakao.com/v1/test/mInfo' },
        { status: PaymentStatus.PAID }, { status: PaymentStatus.CANCELLED }, { verifiedSuccess: true },
    ])('never offers preparation retry for retained payment or session evidence %j', async evidence => {
        record = snapshot({ readyState: 'UNCERTAIN', approvalState: 'WAITING', status: PaymentStatus.PENDING, ...evidence });
        expect((await service.getKakaoPayPaymentStatus(ownerId as any, String(orderId))).preparationRetryable).toBe(false);
    });

    it('does not report a stored PAID flag as verified without capture evidence', async () => {
        record = snapshot({ status: PaymentStatus.PAID, verifiedSuccess: true });
        expect((await service.getKakaoPayPaymentStatus(ownerId as any, String(orderId))).verifiedSuccess).toBe(false);
        record.transactionId = 'capture-fixture'; record.paidAt = new Date('2026-10-29T02:00:00Z');
        expect((await service.getKakaoPayPaymentStatus(ownerId as any, String(orderId))).verifiedSuccess).toBe(true);
    });

    it('reports cancellation pending separately from captured payment and fulfillment', async () => {
        record = snapshot({ status: PaymentStatus.PAID, verifiedSuccess: true, transactionId: 'capture-fixture',
            paidAt: new Date('2026-10-29T02:00:00Z'), cancellationRequestedAt: new Date() });
        expect(await service.getKakaoPayPaymentStatus(ownerId as any, String(orderId))).toMatchObject({ verifiedSuccess: true, cancellationPending: true });
        expect(order.orderStatus).toBe(OrderStatus.PAUSE);
        record.status = PaymentStatus.CANCELLED; record.verifiedSuccess = false;
        expect((await service.getKakaoPayPaymentStatus(ownerId as any, String(orderId))).cancellationPending).toBe(false);
    });

    it.each(['shop', 'amount', 'owner', 'order'])('rejects mismatched saved %s identity', async (field) => {
        record = snapshot();
        if (field === 'shop') record.shopId = new Types.ObjectId();
        if (field === 'amount') record.totalAmount++;
        if (field === 'owner') record.memberId = new Types.ObjectId();
        if (field === 'order') record.orderId = new Types.ObjectId();
        await expect(service.getKakaoPayPaymentStatus(ownerId as any, String(orderId))).rejects.toThrow('does not match');
    });
});

describe('Direct payment schema compatibility without a database connection', () => {
    const Payment = model('DirectEnvPaymentSchemaContract', PaymentSchema);
    it('retains collection/index identities and prevents automatic startup index/collection writes', () => {
        expect(PaymentSchema.get('collection')).toBe('kakaoPayPayments');
        expect(PaymentSchema.get('autoIndex')).toBe(false); expect(PaymentSchema.get('autoCreate')).toBe(false);
        expect(PaymentSchema.indexes()).toContainEqual([{ orderId: 1 }, expect.objectContaining({ unique: true, name: 'kakao_order_unique' })]);
        expect(PaymentSchema.indexes()).toContainEqual([{ paymentId: 1 }, expect.objectContaining({ unique: true, name: 'kakao_payment_unique' })]);
    });
    it('casts IDs and validates integer server-owned amounts while preserving immutable bindings', () => {
        const data = { provider: 'DIRECT', orderId: new Types.ObjectId(), memberId: new Types.ObjectId(), shopId: new Types.ObjectId(),
            paymentId: 'schema-fixture', totalAmount: 50000, currency: 'KRW', orderName: 'Fixture', customData: '{}' };
        expect(new Payment(data).validateSync()).toBeUndefined();
        expect(new Payment({ ...data, totalAmount: 0.5 }).validateSync()).toBeDefined();
        expect(PaymentSchema.path('orderId').options.immutable).toBe(true);
        expect(PaymentSchema.path('totalAmount').options.immutable).toBe(true);
    });
    it('casts callback rotation updates while preventing order and amount rebinding through actual Mongoose update casting', () => {
        const expiresAt = '2026-10-29T14:00:00.000Z';
        const update = Payment.findOneAndUpdate({ _id: new Types.ObjectId(), readyState: 'UNCERTAIN', tid: { $exists: false } }, {
            $set: { callbackStateHash: 'rotated-callback-hash', callbackExpiresAt: expiresAt,
                orderId: new Types.ObjectId(), totalAmount: 1, paymentId: 'forged-payment' },
            $unset: { preparationError: 1, preparationHttpStatus: 1, preparationErrorCode: 1 },
        }, { runValidators: true }) as any;
        const cast = update._castUpdate(update.getUpdate());
        expect(cast.$set.callbackStateHash).toBe('rotated-callback-hash');
        expect(cast.$set.callbackExpiresAt).toBeInstanceOf(Date);
        expect(cast.$set.callbackExpiresAt.toISOString()).toBe(expiresAt);
        for (const field of ['orderId', 'totalAmount', 'paymentId']) expect(cast.$set).not.toHaveProperty(field);
        expect(cast.$unset).toEqual({ preparationError: 1, preparationHttpStatus: 1, preparationErrorCode: 1 });
    });
});
