import { Types } from 'mongoose';
import { PaymentSnapshotService, usdCents } from './payment-snapshot.service';

const read = (value: () => unknown) => ({ sort: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn(async () => value()) });

describe('Trusted persisted USD order snapshot', () => {
    const buyer = new Types.ObjectId();
    const shop = new Types.ObjectId();
    const id = new Types.ObjectId();
    const productId = new Types.ObjectId();
    let order: any, items: any[], products: any[], member: any, orders: any, service: PaymentSnapshotService;
    beforeEach(() => {
        order = { _id: id, memberId: buyer, shopId: shop, orderStatus: 'PAUSE', orderDeliveryType: 'DELIVERY',
            orderDelivery: 5, orderTotal: 55, orderAddress: 'Synthetic test address' };
        items = [{ productId, orderId: id, itemQuantity: 2, itemPrice: 25 }];
        products = [{ _id: productId, memberId: shop, productName: 'Mouse', productPrice: 99,
            productStatus: 'PROCESS', productLeftCount: 5 }];
        member = { exists: jest.fn(() => read(() => true)) };
        orders = { findOne: jest.fn((filter) => read(() => String(filter.memberId) === String(buyer) ? order : null)) };
        service = new PaymentSnapshotService(orders, { find: () => read(() => items) } as any,
            { find: () => read(() => products) } as any, member);
    });

    it.each([[0, 0], [0.01, 1], [0.1, 10], [10.29, 1029], [12345.67, 1234567]])('converts exact USD %s to %s cents', (dollars, cents) => {
        expect(usdCents(dollars)).toBe(cents);
    });
    it.each([-1, 0.001, 0.1 + 0.2, Infinity, NaN, Number.MAX_SAFE_INTEGER, '12' as any])('rejects invalid/fractional cents %s', (value) => {
        expect(() => usdCents(value)).toThrow();
    });
    it.each([['DELIVERY', 5, 55], ['PICKUP', 0, 50], ['DELIVERY', 15, 65], ['DELIVERY', 0, 50]])('uses stored %s shipping and prices, not current product prices', async (type, shipping, total) => {
        Object.assign(order, { orderDeliveryType: type, orderDelivery: shipping, orderTotal: total });
        const result = await service.build(buyer, id);
        expect(result.snapshot).toMatchObject({ sourceCurrency: 'USD', subtotalMinor: 5000,
            shippingMinor: Number(shipping) * 100, totalMinor: Number(total) * 100,
            lines: [{ unitAmountMinor: 2500, quantity: 2 }] });
    });
    it('denies another buyer before reading any payment facts', async () => {
        await expect(service.build(new Types.ObjectId(), id)).rejects.toThrow('Order not found');
    });
    it.each(['missing items', 'missing product', 'mixed shop', 'stock', 'repeated lines', 'total', 'pickup fee',
        'delivery address', 'inactive buyer', 'inactive shop', 'processing order', 'fractional quantity', 'fractional price'])
    ('rejects inconsistent %s', async (failure) => {
        if (failure === 'missing items') items = [];
        if (failure === 'missing product') products = [];
        if (failure === 'mixed shop') products[0].memberId = new Types.ObjectId();
        if (failure === 'stock') products[0].productLeftCount = 1;
        if (failure === 'repeated lines') { items.push({ ...items[0], itemQuantity: 4 }); order.orderTotal = 155; }
        if (failure === 'total') order.orderTotal = 54.99;
        if (failure === 'pickup fee') order.orderDeliveryType = 'PICKUP';
        if (failure === 'delivery address') order.orderAddress = '';
        if (failure === 'inactive buyer') member.exists.mockReturnValue(read(() => null));
        if (failure === 'inactive shop') member.exists.mockReturnValueOnce(read(() => true)).mockReturnValueOnce(read(() => null));
        if (failure === 'processing order') order.orderStatus = 'PROCESS';
        if (failure === 'fractional quantity') items[0].itemQuantity = 1.5;
        if (failure === 'fractional price') items[0].itemPrice = 25.001;
        await expect(service.build(buyer, id)).rejects.toThrow();
    });
});
