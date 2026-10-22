import { BadRequestException } from '@nestjs/common';
import { OrderDeliveryType } from './enums/order.enum';

export const shippingPolicy = {
    currency: 'KRW', freeDeliveryThreshold: 50000, standardDeliveryFee: 50, furnitureDeliveryFee: 70,
};

export function assertKrwAmount(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new BadRequestException('KRW amounts must be nonnegative safe integers.');
}

export function deliveryFee(subtotal: number, type: OrderDeliveryType, hasFurniture: boolean): number {
    assertKrwAmount(subtotal);
    if (type === OrderDeliveryType.PICKUP || subtotal >= shippingPolicy.freeDeliveryThreshold) return 0;
    return hasFurniture ? shippingPolicy.furnitureDeliveryFee : shippingPolicy.standardDeliveryFee;
}
