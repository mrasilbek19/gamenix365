import { Field, InputType, Int } from '@nestjs/graphql';
import { IsDate, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Types } from 'mongoose';
import { Direction } from '../../enums/common.enum';
import { NotificationGroup, NotificationStatus, NotificationType } from '../../enums/notification.enum';
import { availableNotificationSorts } from '../../config';

/** Internal input only. Notification creation is reserved for trusted services. */
export interface NotificationInput {
	notificationType: NotificationType;
	notificationGroup: NotificationGroup;
	notificationTitle: string;
	notificationDesc?: string;
	authorId?: Types.ObjectId;
	receiverId: Types.ObjectId;
	productId?: Types.ObjectId;
	articleId?: Types.ObjectId;
	orderId?: Types.ObjectId;
	eventId?: Types.ObjectId;
}

@InputType()
export class NotificationSearch {
	@IsOptional()
	@Field(() => NotificationGroup, { nullable: true })
	notificationGroup?: NotificationGroup;

	@IsOptional()
	@Field(() => NotificationStatus, { nullable: true })
	notificationStatus?: NotificationStatus;

	@IsOptional()
	@IsDate()
	@Field(() => Date, { nullable: true })
	createdAtFrom?: Date;

	@IsOptional()
	@IsDate()
	@Field(() => Date, { nullable: true })
	createdAtTo?: Date;
}

@InputType()
export class NotificationsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableNotificationSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@Field(() => NotificationSearch, { nullable: true })
	search?: NotificationSearch;
}
