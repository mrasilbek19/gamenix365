import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { EmailDelivery, OrderEmailSnapshot } from '../../libs/dto/mail/email-delivery';
import { EmailDeliveryState, EmailDeliveryTemplate } from '../../libs/enums/email-delivery.enum';
import { MemberStatus } from '../../libs/enums/member.enum';
import { OrderDeliveryType, OrderStatus } from '../../libs/enums/order.enum';
import { ORDER_EMAIL_MAX_ATTEMPTS, ORDER_EMAIL_RETRY_DELAYS_MS } from '../../libs/order-email.config';
import { OrderEmailService } from './order-email.service';

const query = (value: any) => ({
    select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(),
    exec: jest.fn(async () => value),
});

describe('Durable order email queue', () => {
    const buyerId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const productId = new Types.ObjectId();
    const now = new Date('2026-10-17T00:00:00Z');
    let deliveries: any;
    let members: any;
    let orders: any;
    let items: any;
    let products: any;
    let mail: any;
    let service: OrderEmailService;
    let delivery: EmailDelivery;

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(now);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
        delivery = {
            _id: new Types.ObjectId(), memberId: buyerId, orderId, recipient: 'buyer@example.test', emailVersion: 2,
            eventKey: `order:${orderId}:created`, template: EmailDeliveryTemplate.ORDER_CREATED,
            orderStatus: OrderStatus.PAUSE, state: EmailDeliveryState.SENDING, attempts: 1,
            lockToken: 'lease-token', nextAttemptAt: now, lockedUntil: new Date(now.getTime() + 300000),
            createdAt: now, updatedAt: now,
        };
        deliveries = {
            init: jest.fn(async () => {}),
            updateMany: jest.fn(() => query({ modifiedCount: 0 })),
            updateOne: jest.fn(() => query({ matchedCount: 1, modifiedCount: 1, upsertedCount: 1 })),
            findOneAndUpdate: jest.fn().mockImplementationOnce(() => query(delivery)).mockImplementation(() => query(null)),
        };
        members = {
            findOne: jest.fn(() => query({ _id: buyerId, memberEmail: 'buyer@example.test', memberEmailVersion: 2 })),
            exists: jest.fn(() => query({ _id: buyerId })),
        };
        orders = { findOne: jest.fn(() => query({ _id: orderId, memberId: buyerId, orderStatus: OrderStatus.FINISHED,
            orderDeliveryType: OrderDeliveryType.DELIVERY, orderAddress: '123 Gaming Street', orderDelivery: 5, orderTotal: 84.9 })) };
        items = { find: jest.fn(() => query([{ _id: new Types.ObjectId(), productId, itemQuantity: 2, itemPrice: 39.95 }])) };
        products = { find: jest.fn(() => query([{ _id: productId, productName: 'Keyboard', productPrice: 999 }])) };
        mail = { sendOrderEmail: jest.fn(async () => {}) };
        service = new OrderEmailService(deliveries, members, orders, items, products, mail);
    });

    afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

    it('waits for the delivery indexes before startup', async () => {
        await service.onModuleInit();
        expect(deliveries.init).toHaveBeenCalledTimes(1);
    });

    it('queues only the authenticated buyer’s verified database email without sending SMTP or loading an invoice', async () => {
        await expect(service.enqueueOrderEmail(buyerId as any, orderId as any, EmailDeliveryTemplate.ORDER_CREATED, OrderStatus.PAUSE)).resolves.toBe(true);
        expect(members.findOne).toHaveBeenCalledWith(expect.objectContaining({ _id: buyerId, memberEmailVerified: true, memberStatus: MemberStatus.ACTIVE }));
        expect(deliveries.updateOne).toHaveBeenCalledWith({ eventKey: `order:${orderId}:created` }, { $setOnInsert: expect.objectContaining({
            memberId: buyerId, recipient: 'buyer@example.test', emailVersion: 2,
            template: EmailDeliveryTemplate.ORDER_CREATED, state: EmailDeliveryState.PENDING, attempts: 0, nextAttemptAt: now,
        }) }, expect.objectContaining({ upsert: true }));
        expect(mail.sendOrderEmail).not.toHaveBeenCalled();
        expect(orders.findOne).not.toHaveBeenCalled();
    });

    it.each([null, { memberEmail: undefined }, { memberEmail: 'invalid' }])('skips absent/unverified/missing/invalid email %j', async (member) => {
        members.findOne.mockReturnValue(query(member));
        await expect(service.enqueueOrderEmail(buyerId as any, orderId as any, EmailDeliveryTemplate.ORDER_CREATED, OrderStatus.PAUSE)).resolves.toBe(false);
        expect(deliveries.updateOne).not.toHaveBeenCalled();
    });

    it('keeps repeated event records intact and uses separate keys for successful statuses', async () => {
        deliveries.updateOne.mockReturnValue(query({ upsertedCount: 0 }));
        await expect(service.enqueueOrderEmail(buyerId as any, orderId as any, EmailDeliveryTemplate.ORDER_CREATED, OrderStatus.PAUSE)).resolves.toBe(false);
        for (const status of [OrderStatus.PROCESS, OrderStatus.FINISHED]) {
            await service.enqueueOrderEmail(buyerId as any, orderId as any, EmailDeliveryTemplate.ORDER_STATUS_CHANGED, status);
            expect(deliveries.updateOne).toHaveBeenLastCalledWith({ eventKey: `order:${orderId}:status:${status}` },
                { $setOnInsert: expect.any(Object) }, expect.any(Object));
        }
    });

    it.each([11000, 123])('never fails checkout when queue insertion fails with code %s', async (code) => {
        deliveries.updateOne.mockReturnValue({ exec: async () => { throw Object.assign(new Error('private address or provider details'), { code }); } });
        await expect(service.enqueueOrderEmail(buyerId as any, orderId as any, EmailDeliveryTemplate.ORDER_CREATED, OrderStatus.PAUSE)).resolves.toBe(false);
        expect(JSON.stringify((Logger.prototype.error as jest.Mock).mock.calls)).not.toContain('private address');
    });

    it('loads persisted item prices and totals, freezes a snapshot, and sends the event status even after a later status', async () => {
        await expect(service.processDueEmails()).resolves.toBe(1);
        expect(orders.findOne).toHaveBeenCalledWith({ _id: orderId, memberId: buyerId });
        const snapshot: OrderEmailSnapshot = {
            reference: String(orderId), status: OrderStatus.PAUSE, deliveryType: OrderDeliveryType.DELIVERY,
            address: '123 Gaming Street', lines: [{ name: 'Keyboard', quantity: 2, price: 39.95 }], shippingFee: 5, total: 84.9,
        };
        expect(mail.sendOrderEmail).toHaveBeenCalledWith('buyer@example.test', EmailDeliveryTemplate.ORDER_CREATED, snapshot, String(delivery._id));
        expect(deliveries.updateOne).toHaveBeenCalledWith(expect.objectContaining({ lockToken: 'lease-token' }), { $set: { snapshot } }, { runValidators: true });
        expect(deliveries.updateOne).toHaveBeenLastCalledWith(expect.objectContaining({ lockToken: 'lease-token' }), { $set: expect.objectContaining({ state: EmailDeliveryState.SENT, sentAt: now, nextAttemptAt: null }) });
    });

    it('uses stored pickup data without requiring an address or recomputing shipping', async () => {
        orders.findOne.mockReturnValue(query({ _id: orderId, orderDeliveryType: OrderDeliveryType.PICKUP, orderDelivery: 0, orderTotal: 79.9 }));
        await service.processDueEmails();
        expect(mail.sendOrderEmail.mock.calls[0][2]).toMatchObject({ deliveryType: OrderDeliveryType.PICKUP, address: undefined, shippingFee: 0, total: 79.9 });
    });

    it.each([1, 2, 3, 4])('schedules the bounded retry delay after SMTP attempt %s fails', async (attempts) => {
        delivery.attempts = attempts;
        mail.sendOrderEmail.mockRejectedValue(new Error('smtp-private-details'));
        await service.processDueEmails();
        expect(deliveries.updateOne).toHaveBeenLastCalledWith(expect.objectContaining({ lockToken: 'lease-token' }), { $set: expect.objectContaining({
            state: EmailDeliveryState.PENDING, nextAttemptAt: new Date(now.getTime() + ORDER_EMAIL_RETRY_DELAYS_MS[attempts - 1]),
            lockedUntil: null, lockToken: null, lastError: 'DELIVERY_FAILED',
        }) });
        expect(JSON.stringify((Logger.prototype.warn as jest.Mock).mock.calls)).not.toContain('smtp-private');
    });

    it('stops after five failed attempts and recovers exhausted crashed leases', async () => {
        delivery.attempts = ORDER_EMAIL_MAX_ATTEMPTS;
        mail.sendOrderEmail.mockRejectedValue(new Error('SMTP failed'));
        await service.processDueEmails();
        expect(deliveries.updateOne).toHaveBeenLastCalledWith(expect.any(Object), { $set: expect.objectContaining({ state: EmailDeliveryState.FAILED, nextAttemptAt: null }) });
        expect(deliveries.updateMany).toHaveBeenCalledWith(expect.objectContaining({ state: EmailDeliveryState.SENDING, attempts: { $gte: 5 } }),
            { $set: expect.objectContaining({ state: EmailDeliveryState.FAILED, lastError: 'ATTEMPTS_EXHAUSTED' }) });
        expect(deliveries.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ attempts: { $lt: 5 }, $or: expect.arrayContaining([
            { state: EmailDeliveryState.SENDING, lockedUntil: { $lte: now } },
        ]) }), expect.objectContaining({ $inc: { attempts: 1 } }), expect.any(Object));
    });

    it('suppresses queued mail when the verified address or email version no longer matches', async () => {
        members.exists.mockReturnValue(query(null));
        await service.processDueEmails();
        expect(members.exists).toHaveBeenCalledWith(expect.objectContaining({ memberEmail: 'buyer@example.test', memberEmailVerified: true,
            $expr: { $eq: [{ $ifNull: ['$memberEmailVersion', 0] }, 2] } }));
        expect(mail.sendOrderEmail).not.toHaveBeenCalled();
        expect(deliveries.updateOne).toHaveBeenLastCalledWith(expect.any(Object), { $set: expect.objectContaining({ state: EmailDeliveryState.SKIPPED, nextAttemptAt: null }) });
    });

    it.each([null, { orderTotal: 80, orderDelivery: 5, orderDeliveryType: OrderDeliveryType.DELIVERY, orderAddress: 'Street' }])('does not email unavailable or inconsistent order data %j', async (order) => {
        orders.findOne.mockReturnValue(query(order));
        await service.processDueEmails();
        expect(mail.sendOrderEmail).not.toHaveBeenCalled();
        expect(deliveries.updateOne).toHaveBeenLastCalledWith(expect.any(Object), { $set: expect.objectContaining({ state: EmailDeliveryState.PENDING, lastError: 'DELIVERY_FAILED' }) });
    });

    it('reuses the frozen invoice on retry rather than current product prices or names', async () => {
        delivery.snapshot = { reference: String(orderId), status: OrderStatus.PAUSE, deliveryType: OrderDeliveryType.PICKUP,
            lines: [{ name: 'Original name', quantity: 1, price: 12 }], shippingFee: 0, total: 12 };
        await service.processDueEmails();
        expect(orders.findOne).not.toHaveBeenCalled();
        expect(products.find).not.toHaveBeenCalled();
        expect(mail.sendOrderEmail).toHaveBeenCalledWith(delivery.recipient, delivery.template, delivery.snapshot, String(delivery._id));
    });

    it('does not send after losing its lease', async () => {
        deliveries.updateOne.mockImplementation((search, update) => query({ matchedCount: update.$set.lockedUntil ? 0 : 1 }));
        await service.processDueEmails();
        expect(mail.sendOrderEmail).not.toHaveBeenCalled();
    });

    it('leaves uncertain acknowledgements for lease recovery rather than immediately scheduling another send', async () => {
        deliveries.updateOne.mockImplementation((search, update) => update.$set.state === EmailDeliveryState.SENT
            ? { exec: async () => { throw new Error('database disconnected'); } } : query({ matchedCount: 1 }));
        await service.processDueEmails();
        expect(mail.sendOrderEmail).toHaveBeenCalledTimes(1);
        expect(deliveries.updateOne.mock.calls.some(([, update]) => update.$set.state === EmailDeliveryState.PENDING)).toBe(false);
    });
});
