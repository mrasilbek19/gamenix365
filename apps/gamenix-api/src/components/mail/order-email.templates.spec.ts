import { ConfigService } from '@nestjs/config';
import { OrderEmailSnapshot } from '../../libs/dto/mail/email-delivery';
import { EmailDeliveryTemplate } from '../../libs/enums/email-delivery.enum';
import { OrderDeliveryType, OrderStatus } from '../../libs/enums/order.enum';
import { MailService } from './mail.service';
import { orderEmailMessage } from './mail.templates';

const snapshot = (changes: Partial<OrderEmailSnapshot> = {}): OrderEmailSnapshot => ({
    reference: '507f1f77bcf86cd799439011', status: OrderStatus.PAUSE,
    deliveryType: OrderDeliveryType.DELIVERY, address: '123 Gaming Street',
    lines: [{ name: 'Keyboard', quantity: 2, price: 39.95 }, { name: 'Mouse', quantity: 1, price: 10 }],
    shippingFee: 5, total: 94.9, ...changes,
});

describe('Order email templates', () => {
    it('includes the stored reference, quantities, unit prices, shipping and total in USD', () => {
        const message = orderEmailMessage(EmailDeliveryTemplate.ORDER_CREATED, snapshot());
        expect(message.subject).toContain('Order confirmation (507f1f77bcf86cd799439011)');
        expect(message.text).toContain('Keyboard — 2 × $39.95 = $79.90');
        expect(message.text).toContain('Mouse — 1 × $10.00 = $10.00');
        expect(message.text).toContain('Shipping fee: $5.00');
        expect(message.text).toContain('Order total: $94.90 USD');
        expect(message.html).toContain('123 Gaming Street');
        expect(message.html).not.toContain('₩');
    });

    it('handles pickup without a delivery address or shipping charge', () => {
        const message = orderEmailMessage(EmailDeliveryTemplate.ORDER_CREATED,
            snapshot({ deliveryType: OrderDeliveryType.PICKUP, address: undefined, shippingFee: 0, total: 89.9 }));
        expect(message.text).toContain('Pickup at the shop');
        expect(message.text).toContain('Shipping fee: $0.00');
        expect(message.text).toContain('Order total: $89.90 USD');
        expect(message.html).not.toContain('undefined');
        expect(message.text).not.toContain('Delivery to:');
    });

    it.each(Object.values(OrderStatus))('describes %s as processing status without claiming payment or delivery', (status) => {
        const message = orderEmailMessage(EmailDeliveryTemplate.ORDER_STATUS_CHANGED, snapshot({ status }));
        expect(message.subject).toContain('Order status update');
        expect(message.text).toContain(`(${status})`);
        expect(message.text).toContain('does not confirm payment');
        expect(message.text).not.toMatch(/\b(paid|shipped|delivered|card|cvv)\b/i);
    });

    it('escapes dynamic HTML in product names, reference and address', () => {
        const attack = `<img src=x onerror="alert('x')">&`;
        const message = orderEmailMessage(EmailDeliveryTemplate.ORDER_CREATED,
            snapshot({ reference: attack, address: attack, lines: [{ name: attack, price: 1, quantity: 1 }] }));
        expect(message.html).not.toContain('<img');
        expect(message.html).toContain('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
        expect(message.text).toContain(attack);
    });

    it('reuses MailService capture and a stable delivery Message-ID for retries', async () => {
        const mail = new MailService({ get: (key: string) => ({ NODE_ENV: 'test', MAIL_TRANSPORT: 'capture' })[key] } as ConfigService);
        try {
            await mail.sendOrderEmail('buyer@example.test', EmailDeliveryTemplate.ORDER_CREATED, snapshot(), 'delivery-fixture');
            await mail.sendOrderEmail('buyer@example.test', EmailDeliveryTemplate.ORDER_CREATED, snapshot(), 'delivery-fixture');
            const [first, retry] = mail.getCapturedMessages();
            expect(first.to).toBe('buyer@example.test');
            expect(first.messageId).toBe(retry.messageId);
            expect(first.messageId).toContain('gamenix-order-delivery-fixture@');
        } finally { mail.onModuleDestroy(); }
    });
});
