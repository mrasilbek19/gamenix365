import { OrderEmailSnapshot } from '../../libs/dto/mail/email-delivery';
import { EmailDeliveryTemplate } from '../../libs/enums/email-delivery.enum';
import { OrderDeliveryType, OrderStatus } from '../../libs/enums/order.enum';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export const emailVerificationMessage = (name: string, link: string) => ({
    subject: 'Gamenix365 — Verify your email',
    html: `<p>Hello ${escapeHtml(name)},</p><p>Verify your Gamenix365 email address:</p>
<p><a href="${escapeHtml(link)}">Verify email</a></p>
<p>This link expires in 15 minutes and can be used once. If you did not request it, ignore this email.</p>`,
    text: `Hello ${name},\n\nVerify your Gamenix365 email address:\n${link}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.`,
});

const usd = (value: number): string => `$${value.toFixed(2)}`;
const statusLabel: Record<OrderStatus, string> = {
    [OrderStatus.PAUSE]: 'Received (PAUSE)',
    [OrderStatus.PROCESS]: 'Processing (PROCESS)',
    [OrderStatus.FINISHED]: 'Finished (FINISHED)',
};

export const orderEmailMessage = (template: EmailDeliveryTemplate, order: OrderEmailSnapshot) => {
    const title = template === EmailDeliveryTemplate.ORDER_CREATED ? 'Order confirmation' : 'Order status update';
    const status = statusLabel[order.status];
    const fulfillment = order.deliveryType === OrderDeliveryType.PICKUP
        ? 'Pickup at the shop'
        : `Delivery to: ${order.address}`;
    const rows = order.lines.map((line) => `<tr>
<td>${escapeHtml(line.name)}</td><td>${line.quantity}</td>
<td>${usd(line.price)}</td><td>${usd(line.price * line.quantity)}</td></tr>`).join('');
    const paymentNote = 'Order-processing status does not confirm payment.';

    return {
        subject: `Gamenix365 — ${title} (${order.reference})`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:auto;color:#111827">
<h1>Gamenix365 — ${title}</h1>
<p>Order reference: <strong>${escapeHtml(order.reference)}</strong></p>
<p>Status: ${escapeHtml(status)}</p><p>${escapeHtml(fulfillment)}</p>
<table style="width:100%;text-align:left;border-collapse:collapse" cellpadding="8">
<thead><tr><th>Product</th><th>Quantity</th><th>Unit price (USD)</th><th>Line total (USD)</th></tr></thead>
<tbody>${rows}</tbody></table>
<p>Shipping fee: ${usd(order.shippingFee)}</p><p><strong>Order total: ${usd(order.total)} USD</strong></p>
<p>${paymentNote}</p></div>`,
        text: `Gamenix365 — ${title}\nOrder reference: ${order.reference}\nStatus: ${status}\n${fulfillment}\n\n` +
            order.lines.map((line) => `${line.name} — ${line.quantity} × ${usd(line.price)} = ${usd(line.price * line.quantity)}`).join('\n') +
            `\n\nShipping fee: ${usd(order.shippingFee)}\nOrder total: ${usd(order.total)} USD\n${paymentNote}`,
    };
};
