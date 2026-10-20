import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotificationService } from './notification.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Notification, Notifications } from '../../libs/dto/notification/notification';
import { NotificationsInquiry } from '../../libs/dto/notification/notification.input';
import { NotificationUpdate } from '../../libs/dto/notification/notification.update';

/**
 * Every operation is scoped to the authenticated member's own inbox — the
 * receiver always comes from the token, never from the arguments. There is no
 * create mutation: notifications are emitted by the existing business services.
 */
@Resolver()
export class NotificationResolver {
	constructor(private readonly notificationService: NotificationService) {}

	@UseGuards(AuthGuard)
	@Query(() => Notifications)
	public async getNotifications(
		@Args('input') input: NotificationsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Notifications> {
		console.log('Query: getNotifications');
		return await this.notificationService.getNotifications(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Int)
	public async getUnreadNotificationsCount(@AuthMember('_id') memberId: Types.ObjectId): Promise<number> {
		console.log('Query: getUnreadNotificationsCount');
		return await this.notificationService.getUnreadNotificationsCount(memberId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Notification)
	public async updateNotification(
		@Args('input') input: NotificationUpdate,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Notification> {
		console.log('Mutation: updateNotification');
		return await this.notificationService.updateNotification(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Int)
	public async markAllNotificationsRead(@AuthMember('_id') memberId: Types.ObjectId): Promise<number> {
		console.log('Mutation: markAllNotificationsRead');
		return await this.notificationService.markAllNotificationsRead(memberId);
	}
}
