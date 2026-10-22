jest.mock('apps/gamenix-api/src/libs/enums/common.enum', () => jest.requireActual('./enums/common.enum'), { virtual: true });
import { ProductService } from '../components/product/product.service';
import { Types, model } from 'mongoose';
import { validateSync } from 'class-validator';
import { ProductInput } from './dto/product/product.input';
import { ProductUpdate } from './dto/product/product.update';
import ProductSchema from '../schemas/Product.model';
import OrderSchema from '../schemas/Order.model';
import OrderItemSchema from '../schemas/OrderItem.model';
import { ProductResolver } from '../components/product/product.resolver';
import { OrderResolver } from '../components/order/order.resolver';
import { orderInvoiceHtml } from '../components/mail/mail.templates';

describe('Native KRW validation and legacy financial protection', () => {
    it.each([0, 49999, 50000, 75000, Number.MAX_SAFE_INTEGER])('accepts integer product price %s', (price) => {
        const dto = Object.assign(new ProductInput(), { productType: 'KEYBOARD', productName: 'Keyboard',
            productPrice: price, productLeftCount: 1, productImages: ['image.png'] });
        expect(validateSync(dto)).toEqual([]);
    });
    it.each([1.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid create/update price %s', (price) => {
        for (const Class of [ProductInput, ProductUpdate]) {
            const dto = Object.assign(new Class(), { productPrice: price });
            expect(validateSync(dto).some((error) => error.property === 'productPrice')).toBe(true);
        }
    });
    it('does not hydrate legacy records with a KRW default or change their amounts', () => {
        for (const [name, schema, amounts] of [
            ['CurrencyLegacyProduct', ProductSchema, { productPrice: 32.45 }],
            ['CurrencyLegacyOrder', OrderSchema, { orderTotal: 37.45, orderDelivery: 5 }],
            ['CurrencyLegacyItem', OrderItemSchema, { itemPrice: 32.45, itemQuantity: 1 }],
        ] as const) {
            const doc = model(name, schema).hydrate({ _id: new Types.ObjectId(), ...amounts });
            expect(doc.get('currency')).toBeUndefined();
            for (const [key, value] of Object.entries(amounts)) expect(doc.get(key)).toBe(value);
        }
        expect(new ProductResolver(null).currency({ productPrice: 32.45 } as any)).toBe('USD');
        expect(new OrderResolver(null).currency({ orderTotal: 37.45 } as any)).toBe('USD');
        expect(new OrderResolver(null).orderSubtotal({ orderTotal: 37.45, orderDelivery: 5 } as any)).toBeCloseTo(32.45);
    });
    it('creates only native KRW products and validates service callers before writes', async () => {
        const create = jest.fn(async (input) => ({ ...input, _id: new Types.ObjectId() }));
        const members: any = { assertActiveShop: jest.fn(), memberStatsEditor: jest.fn() };
        const service = new ProductService({ create } as any, members, null, null);
        await service.createProduct({ productPrice: 50000, currency: 'USD' } as any);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ productPrice: 50000, currency: 'KRW' }));
        create.mockClear();
        await expect(service.createProduct({ productPrice: 50.5 } as any)).rejects.toThrow('safe integers');
        expect(create).not.toHaveBeenCalled();
    });
    it('guards both SHOP and ADMIN legacy price edits with an atomic currency filter', async () => {
        const legacy = { _id: new Types.ObjectId(), productPrice: 32.45 };
        const update = jest.fn((search) => ({ exec: async () => search.currency === 'KRW' ? null : legacy }));
        const service = new ProductService({ findOneAndUpdate: update } as any,
            { assertActiveShop: jest.fn() } as any, null, null);
        await expect(service.updateProduct(new Types.ObjectId() as any, { _id: legacy._id, productPrice: 50000 } as any)).rejects.toThrow();
        await expect(service.updateProductByAdmin({ _id: legacy._id, productPrice: 50000 } as any)).rejects.toThrow();
        expect(update.mock.calls.every(([search]) => search.currency === 'KRW')).toBe(true);
        expect(legacy.productPrice).toBe(32.45);
        expect('currency' in legacy).toBe(false);
    });
    it('formats new KRW invoices and retains legacy USD invoice values', () => {
        const order: any = { _id: 'order', createdAt: new Date(), orderStatus: 'PAUSE', orderDeliveryType: 'PICKUP',
            orderTotal: 50000, orderDelivery: 0, currency: 'KRW' };
        const krw = orderInvoiceHtml(order, [{ name: 'Keyboard', quantity: 2, price: 25000 }]);
        expect(krw).toContain('₩50,000'); expect(krw).not.toContain('USD'); expect(krw).not.toContain('.00');
        const legacy = orderInvoiceHtml({ ...order, currency: undefined, orderTotal: 25.5 }, [{ name: 'Keyboard', quantity: 1, price: 25.5 }]);
        expect(legacy).toContain('USD 25.50'); expect(legacy).not.toContain('₩');
    });
});
