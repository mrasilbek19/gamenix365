import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Connection, createConnection, Model, Types } from 'mongoose';
import { EmailDelivery } from '../../libs/dto/mail/email-delivery';
import { Member } from '../../libs/dto/member/member';
import { Order } from '../../libs/dto/order/order';
import { OrderItem } from '../../libs/dto/order-item/order-item';
import { Product } from '../../libs/dto/product/product';
import { EmailDeliveryState, EmailDeliveryTemplate } from '../../libs/enums/email-delivery.enum';
import { OrderDeliveryType, OrderStatus } from '../../libs/enums/order.enum';
import { ProductType } from '../../libs/enums/product.enum';
import EmailDeliverySchema from '../../schemas/EmailDelivery.model';
import MemberSchema from '../../schemas/Member.model';
import OrderSchema from '../../schemas/Order.model';
import OrderItemSchema from '../../schemas/OrderItem.model';
import ProductSchema from '../../schemas/Product.model';
import { MailService } from '../mail/mail.service';
import { OrderEmailService } from './order-email.service';

// Opt in with a test server. Always override its database and guard exact-name cleanup.
const testUri = process.env.ORDER_EMAIL_TEST_MONGO_URI;
const describeMongo = testUri ? describe : describe.skip;

describeMongo('Order email MongoDB queue and competing workers', () => {
    const databaseName = `gx_order_mail_test_${randomBytes(8).toString('hex')}`;
    let connection: Connection;
    let deliveries: Model<EmailDelivery>;
    let members: Model<Member>;
    let orders: Model<Order>;
    let items: Model<OrderItem>;
    let products: Model<Product>;
    let mail: MailService;
    let queue: OrderEmailService;
    let buyerId: Types.ObjectId;
    let orderId: Types.ObjectId;

    beforeAll(async () => {
        connection = await createConnection(testUri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 }).asPromise();
        deliveries = connection.model<EmailDelivery>('EmailDelivery', EmailDeliverySchema);
        members = connection.model<Member>('Member', MemberSchema);
        orders = connection.model<Order>('Order', OrderSchema);
        items = connection.model<OrderItem>('OrderItem', OrderItemSchema);
        products = connection.model<Product>('Product', ProductSchema);
        await Promise.all([deliveries.init(), members.init(), orders.init(), items.init(), products.init()]);
    }, 20000);

    beforeEach(async () => {
        await Promise.all([deliveries.deleteMany({}), members.deleteMany({}), orders.deleteMany({}), items.deleteMany({}), products.deleteMany({})]);
        const member = await members.create({ memberNick: 'buyer', memberPhone: '010-test', memberPassword: 'test-only-hash',
            memberEmail: 'buyer@example.test', memberEmailVerified: true });
        buyerId = member._id as any;
        const shopId = new Types.ObjectId();
        const product = await products.create({ memberId: shopId, productType: ProductType.KEYBOARD, productName: 'Original keyboard',
            productPrice: 999, productLeftCount: 10, productImages: [] });
        const order = await orders.create({ memberId: buyerId, shopId, orderDeliveryType: OrderDeliveryType.DELIVERY,
            orderAddress: '123 Gaming Street', orderDelivery: 5, orderTotal: 55 });
        orderId = order._id as any;
        await items.create({ orderId, productId: product._id, itemQuantity: 2, itemPrice: 25 });
        mail = new MailService({ get: (key: string) => ({ NODE_ENV: 'test', MAIL_TRANSPORT: 'capture' })[key] } as ConfigService);
        queue = new OrderEmailService(deliveries, members, orders, items, products, mail);
    });

    afterEach(() => { mail?.onModuleDestroy(); jest.restoreAllMocks(); });
    afterAll(async () => {
        if (!connection) return;
        try {
            if (connection.name !== databaseName || !connection.name.startsWith('gx_order_mail_test_')) throw new Error('Refusing non-test database cleanup');
            await connection.dropDatabase();
        } finally { await connection.close(); }
    });

    const enqueue = () => queue.enqueueOrderEmail(buyerId as any, orderId as any, EmailDeliveryTemplate.ORDER_CREATED, OrderStatus.PAUSE);

    it('creates one durable delivery under concurrent duplicate triggers and never resets a sent record', async () => {
        const inserted = await Promise.all(Array.from({ length: 10 }, enqueue));
        expect(inserted.filter(Boolean)).toHaveLength(1);
        expect(await deliveries.countDocuments()).toBe(1);
        await queue.processDueEmails();
        expect(await enqueue()).toBe(false);
        expect((await deliveries.findOne({}).lean()).state).toBe(EmailDeliveryState.SENT);
        expect(mail.getCapturedMessages()).toHaveLength(1);
    });

    it('atomically claims work across two workers and uses MongoDB item prices instead of current product prices', async () => {
        await enqueue();
        const second = new OrderEmailService(deliveries, members, orders, items, products, mail);
        expect((await Promise.all([queue.processDueEmails(), second.processDueEmails()])).reduce((total, value) => total + value, 0)).toBe(1);
        const [message] = mail.getCapturedMessages();
        expect(message.text).toContain('2 × $25.00 = $50.00');
        expect(message.text).toContain('Order total: $55.00 USD');
        expect(message.text).not.toContain('$999.00');
        expect((await deliveries.findOne({}).lean()).attempts).toBe(1);
    });

    it('persists retries across worker restarts and keeps the original snapshot', async () => {
        await enqueue();
        const sender = jest.spyOn(mail, 'sendOrderEmail').mockRejectedValueOnce(new Error('SMTP unavailable'));
        await queue.processDueEmails();
        const pending = await deliveries.findOne({}).lean();
        expect(pending.state).toBe(EmailDeliveryState.PENDING);
        expect(pending.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
        expect(await queue.processDueEmails()).toBe(0);
        await products.updateMany({}, { productName: 'Renamed later' });
        await deliveries.updateOne({ _id: pending._id }, { nextAttemptAt: new Date(0) });
        const restarted = new OrderEmailService(deliveries, members, orders, items, products, mail);
        await restarted.processDueEmails();
        expect(sender).toHaveBeenCalledTimes(2);
        expect(mail.getCapturedMessages()[0].text).toContain('Original keyboard');
        expect((await deliveries.findOne({}).lean()).state).toBe(EmailDeliveryState.SENT);
    });

    it('suppresses an old queued recipient after email verification is reset', async () => {
        await enqueue();
        await members.updateOne({ _id: buyerId }, { $set: { memberEmailVerified: false }, $inc: { memberEmailVersion: 1 } });
        await queue.processDueEmails();
        expect((await deliveries.findOne({}).lean()).state).toBe(EmailDeliveryState.SKIPPED);
        expect(mail.getCapturedMessages()).toEqual([]);
    });

    it('recovers a crashed worker lease', async () => {
        await enqueue();
        await deliveries.updateOne({}, { state: EmailDeliveryState.SENDING, attempts: 1, lockedUntil: new Date(0), lockToken: 'crashed' });
        await queue.processDueEmails();
        expect((await deliveries.findOne({}).lean())).toMatchObject({ state: EmailDeliveryState.SENT, attempts: 2 });
        expect(mail.getCapturedMessages()).toHaveLength(1);
    });

    it('terminates exhausted crashed leases without another send', async () => {
        await enqueue();
        await deliveries.updateOne({}, { state: EmailDeliveryState.SENDING, attempts: 5, lockedUntil: new Date(0), lockToken: 'crashed' });
        expect(await queue.processDueEmails()).toBe(0);
        expect((await deliveries.findOne({}).lean())).toMatchObject({ state: EmailDeliveryState.FAILED, nextAttemptAt: null });
        expect(mail.getCapturedMessages()).toEqual([]);
    });

    it.each(['missing', 'unverified'])('skips %s buyer email without creating a delivery', async (kind) => {
        await members.updateOne({ _id: buyerId }, kind === 'missing' ? { $unset: { memberEmail: 1 } } : { memberEmailVerified: false });
        expect(await enqueue()).toBe(false);
        expect(await deliveries.countDocuments()).toBe(0);
    });
});
