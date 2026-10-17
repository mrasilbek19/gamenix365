import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { Notification, Notifications } from '../../libs/dto/notification/notification';
import { NotificationsInquiry } from '../../libs/dto/notification/notification.input';
import { NotificationUpdate } from '../../libs/dto/notification/notification.update';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { NotificationService } from './notification.service';

@Resolver()
export class NotificationResolver {
	constructor(private readonly notificationService: NotificationService) {}

	@UseGuards(AuthGuard)
	@Query(() => Notifications)
	public async getNotifications(
		@Args('input') input: NotificationsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Notifications> {
		return await this.notificationService.getNotifications(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Int)
	public async getUnreadNotificationsCount(@AuthMember('_id') memberId: Types.ObjectId): Promise<number> {
		return await this.notificationService.getUnreadNotificationsCount(memberId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Notification)
	public async updateNotification(
		@Args('input') input: NotificationUpdate,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Notification> {
		return await this.notificationService.updateNotification(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Int)
	public async markAllNotificationsRead(@AuthMember('_id') memberId: Types.ObjectId): Promise<number> {
		return await this.notificationService.markAllNotificationsRead(memberId);
	}
}
