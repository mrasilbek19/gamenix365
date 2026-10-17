import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { model, Types } from 'mongoose';
import { EmailDeliveryState, EmailDeliveryTemplate } from '../../libs/enums/email-delivery.enum';
import { OrderDeliveryType, OrderStatus } from '../../libs/enums/order.enum';
import EmailDeliverySchema from '../../schemas/EmailDelivery.model';
import { MailService } from '../mail/mail.service';
import { OrderEmailModule } from './order-email.module';
import { OrderEmailService } from './order-email.service';

const initialize = jest.fn(async () => {});
@Global()
@Module({
    providers: [{ provide: getConnectionToken(), useValue: { models: {
        EmailDelivery: { init: initialize }, Member: {}, Order: {}, OrderItem: {}, Product: {},
    } } }],
    exports: [getConnectionToken()],
})
class QueueConnectionFixture {}

describe('Order email persistence and module wiring', () => {
    it('resolves the reusable queue/mail module without MongoDB or SMTP and initializes its indexes', async () => {
        const fixture = await Test.createTestingModule({ imports: [QueueConnectionFixture, OrderEmailModule] })
            .overrideProvider(ConfigService).useValue({ get: (key: string) => ({ NODE_ENV: 'test', MAIL_TRANSPORT: 'capture' })[key] })
            .compile();
        try {
            await fixture.init();
            expect(fixture.get(OrderEmailService)).toBeDefined();
            expect(fixture.get(MailService).getCapturedMessages()).toEqual([]);
            expect(initialize).toHaveBeenCalled();
        } finally { await fixture.close(); }
    });

    it('enforces event uniqueness and provides due-work and expired-lease indexes', () => {
        const indexes = EmailDeliverySchema.indexes();
        expect(indexes.find(([fields]) => 'eventKey' in fields)?.[1]).toMatchObject({ unique: true });
        expect(indexes.map(([fields]) => fields)).toEqual(expect.arrayContaining([
            { state: 1, nextAttemptAt: 1 }, { state: 1, lockedUntil: 1 },
        ]));
    });

    it('stores only explicit mail fields and excludes payment card data', () => {
        const DeliveryModel = model('EmailDeliverySchemaFixture', EmailDeliverySchema);
        const record = new DeliveryModel({
            memberId: new Types.ObjectId(), orderId: new Types.ObjectId(), recipient: 'buyer@example.test', emailVersion: 0,
            template: EmailDeliveryTemplate.ORDER_CREATED, orderStatus: OrderStatus.PAUSE, eventKey: 'order:fixture:created',
            cardNumber: 'forbidden-card-fixture',
            snapshot: { reference: 'fixture', status: OrderStatus.PAUSE, deliveryType: OrderDeliveryType.PICKUP,
                lines: [{ name: 'Keyboard', quantity: 1, price: 10 }], shippingFee: 0, total: 10, cvv: 'forbidden-cvv-fixture' },
        });
        expect(record.validateSync()).toBeUndefined();
        expect(record.state).toBe(EmailDeliveryState.PENDING);
        expect(record.attempts).toBe(0);
        expect(record.nextAttemptAt).toBeInstanceOf(Date);
        expect(JSON.stringify(record.toObject())).not.toContain('forbidden-');
    });
});
