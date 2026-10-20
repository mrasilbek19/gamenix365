import { Types } from 'mongoose';
import { OrderService } from './order.service';
import { OrderDeliveryType, OrderStatus } from '../../libs/enums/order.enum';
import { ProductStatus, ProductType } from '../../libs/enums/product.enum';

const query = (read: () => any) => ({ select: jest.fn().mockReturnThis(), exec: jest.fn(async () => read()) });

describe('Petora order invoice hooks and original order behavior', () => {
    const buyerId = new Types.ObjectId();
    const shopId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const productId = new Types.ObjectId();
    let orders: any;
    let items: any;
    let products: any;
    let members: any;
    let memberService: any;
    let email: any;
    let service: OrderService;
    let targetOrder: any;
    let product: any;

    beforeEach(() => {
        targetOrder = { _id: orderId, memberId: buyerId, shopId, orderStatus: OrderStatus.PAUSE,
            orderTotal: 85, orderDelivery: 5, orderDeliveryType: OrderDeliveryType.DELIVERY, orderAddress: '123 Gaming Street' };
        product = { _id: productId, memberId: shopId, productName: 'Keyboard', productType: ProductType.KEYBOARD,
            productStatus: ProductStatus.PROCESS, productPrice: 40, productLeftCount: 10 };
        orders = {
            create: jest.fn(async (input) => ({ ...targetOrder, ...input })),
            findOne: jest.fn(() => query(() => ({ ...targetOrder }))),
            findOneAndUpdate: jest.fn((search, update) => query(() => { targetOrder.orderStatus = update.orderStatus; return { ...targetOrder }; })),
        };
        items = {
            create: jest.fn(async (input) => input),
            find: jest.fn(() => query(() => [{ productId, itemQuantity: 2, itemPrice: 40 }])),
        };
        products = { find: jest.fn(() => query(() => [product])), findOneAndUpdate: jest.fn(() => query(() => product)) };
        members = { exists: jest.fn(() => query(() => ({ _id: buyerId }))),
            findById: jest.fn(() => query(() => ({ memberEmail: 'buyer@example.test' }))) };
        memberService = { memberStatsEditor: jest.fn(async () => ({ _id: buyerId })) };
        email = { sendOrderInvoice: jest.fn(async () => true) };
        service = new OrderService(orders, items, products, members, memberService, email);
    });

    it.each([
        [OrderDeliveryType.PICKUP, ProductType.KEYBOARD, 2, 0, 80],
        [OrderDeliveryType.DELIVERY, ProductType.KEYBOARD, 2, 5, 85],
        [OrderDeliveryType.DELIVERY, ProductType.KEYBOARD, 3, 0, 120],
        [OrderDeliveryType.DELIVERY, ProductType.CHAIR, 2, 15, 95],
    ])('preserves %s/%s shipping and totals, then emails the buyer an invoice', async (type, category, quantity, fee, total) => {
        product.productType = category;
        email.sendOrderInvoice.mockImplementation(async () => {
            expect(items.create).toHaveBeenCalledTimes(1);
            return true;
        });
        const result = await service.createOrder(buyerId as any, {
            orderDeliveryType: type as OrderDeliveryType, orderAddress: type === OrderDeliveryType.DELIVERY ? '123 Gaming Street' : undefined,
            orderItems: [{ productId: productId as any, itemQuantity: quantity as number }],
        });
        expect(result).toMatchObject({ memberId: buyerId, shopId, orderDelivery: fee, orderTotal: total, orderStatus: OrderStatus.PAUSE });
        expect(email.sendOrderInvoice).toHaveBeenCalledWith('buyer@example.test', result, [
            { name: 'Keyboard', quantity, price: 40 },
        ]);
        expect(products.findOneAndUpdate).not.toHaveBeenCalled();
        expect(memberService.memberStatsEditor).not.toHaveBeenCalled();
    });

    it('keeps checkout successful without email', async () => {
        members.findById.mockReturnValue(query(() => ({})));
        await expect(service.createOrder(buyerId as any, {
            orderDeliveryType: OrderDeliveryType.PICKUP, orderItems: [{ productId: productId as any, itemQuantity: 1 }],
        })).resolves.toMatchObject({ _id: orderId });
        expect(email.sendOrderInvoice).not.toHaveBeenCalled();
    });

    it('keeps checkout successful when the optional recipient lookup fails', async () => {
        members.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), exec: jest.fn().mockRejectedValue(new Error('Unavailable')) });
        await expect(service.createOrder(buyerId as any, {
            orderDeliveryType: OrderDeliveryType.PICKUP, orderItems: [{ productId: productId as any, itemQuantity: 1 }],
        })).resolves.toMatchObject({ _id: orderId });
        expect(email.sendOrderInvoice).not.toHaveBeenCalled();
    });

    it.each(['order', 'items'])('does not send an invoice after %s persistence fails', async (failure) => {
        (failure === 'order' ? orders.create : items.create).mockRejectedValue(new Error('Order write failed'));
        await expect(service.createOrder(buyerId as any, {
            orderDeliveryType: OrderDeliveryType.PICKUP, orderItems: [{ productId: productId as any, itemQuantity: 1 }],
        })).rejects.toThrow('Order write failed');
        expect(email.sendOrderInvoice).not.toHaveBeenCalled();
    });

    it('does not send an invoice for rejected mixed-shop orders', async () => {
        const otherProduct = { ...product, _id: new Types.ObjectId(), memberId: new Types.ObjectId() };
        products.find.mockReturnValue(query(() => [product, otherProduct]));
        await expect(service.createOrder(buyerId as any, { orderDeliveryType: OrderDeliveryType.PICKUP,
            orderItems: [{ productId: productId as any, itemQuantity: 1 }, { productId: otherProduct._id as any, itemQuantity: 1 }] }))
            .rejects.toThrow('same shop');
        expect(email.sendOrderInvoice).not.toHaveBeenCalled();
    });

    it('processes stock and points once and keeps status emails absent as in Petora', async () => {
        await service.updateOrder(buyerId as any, { _id: orderId as any, orderStatus: OrderStatus.PROCESS });
        await service.updateOrder(buyerId as any, { _id: orderId as any, orderStatus: OrderStatus.PROCESS });
        expect(email.sendOrderInvoice).not.toHaveBeenCalled();
        expect(products.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(memberService.memberStatsEditor).toHaveBeenCalledTimes(1);
        expect(memberService.memberStatsEditor).toHaveBeenCalledWith({ _id: buyerId, targetKey: 'memberPoints', modifier: 1 });
    });

    it.each(['stock', 'points'])('does not send a successful-status email after %s failure or a same-status retry of that partial write', async (failure) => {
        if (failure === 'stock') products.findOneAndUpdate.mockReturnValue(query(() => null));
        else memberService.memberStatsEditor.mockResolvedValue(null);
        await expect(service.updateOrder(buyerId as any, { _id: orderId as any, orderStatus: OrderStatus.PROCESS })).rejects.toThrow();
        expect(targetOrder.orderStatus).toBe(OrderStatus.PROCESS); // Existing separate-write behavior is preserved.
        await service.updateOrder(buyerId as any, { _id: orderId as any, orderStatus: OrderStatus.PROCESS });
        expect(email.sendOrderInvoice).not.toHaveBeenCalled();
    });

    it('finishes without changing stock or points', async () => {
        targetOrder.orderStatus = OrderStatus.PROCESS;
        await service.updateOrder(buyerId as any, { _id: orderId as any, orderStatus: OrderStatus.FINISHED });
        expect(email.sendOrderInvoice).not.toHaveBeenCalled();
        expect(products.findOneAndUpdate).not.toHaveBeenCalled();
        expect(memberService.memberStatsEditor).not.toHaveBeenCalled();
    });

    it('does not email a skipped/invalid transition or an unowned order', async () => {
        await expect(service.updateOrder(buyerId as any, { _id: orderId as any, orderStatus: OrderStatus.FINISHED })).rejects.toThrow('Invalid order status transition');
        orders.findOne.mockReturnValue(query(() => null));
        await expect(service.updateOrder(new Types.ObjectId() as any, { _id: orderId as any, orderStatus: OrderStatus.PROCESS })).rejects.toThrow('Order not found');
        expect(email.sendOrderInvoice).not.toHaveBeenCalled();
    });
});
