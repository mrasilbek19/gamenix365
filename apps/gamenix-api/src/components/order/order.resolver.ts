import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver, ResolveField, Parent } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { shippingPolicy } from '../../libs/money';
import { ShippingPolicy } from '../../libs/dto/order/shipping-policy';
import { OrderService } from './order.service';
import { Order } from '../../libs/dto/order/order';
import { OrderInput, OrdersInquiry } from '../../libs/dto/order/order.input';
import { OrderUpdate } from '../../libs/dto/order/order.update';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';

@Resolver(() => Order)
export class OrderResolver {
    constructor(private readonly orderService: OrderService) { }

    @Query(() => ShippingPolicy)
    public getShippingPolicy(): ShippingPolicy { return shippingPolicy; }

    @ResolveField(() => String)
    public currency(@Parent() order: Order): string { return order.currency ?? 'USD'; }

    @ResolveField(() => Number)
    public orderSubtotal(@Parent() order: Order): number { return order.orderSubtotal ?? order.orderTotal - order.orderDelivery; }

    @UseGuards(AuthGuard)
    @Mutation(() => Order)
    public async createOrder(
        @Args('input') input: OrderInput,
        @AuthMember('_id') memberId: ObjectId,
    ): Promise<Order> {
        console.log('Mutation: createOrder');
        return await this.orderService.createOrder(memberId, input);
    }

    @UseGuards(AuthGuard)
    @Query(() => [Order])
    public async getMyOrders(
        @Args('input') input: OrdersInquiry,
        @AuthMember('_id') memberId: ObjectId,
    ): Promise<Order[]> {
        console.log('Query: getMyOrders');
        return await this.orderService.getMyOrders(memberId, input);
    }

    @UseGuards(AuthGuard)
    @Mutation(() => Order)
    public async updateOrder(
        @Args('input') input: OrderUpdate,
        @AuthMember('_id') memberId: ObjectId,
    ): Promise<Order> {
        console.log('Mutation: updateOrder');
        return await this.orderService.updateOrder(memberId, input);
    }
}
