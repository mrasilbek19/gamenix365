import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsMongoId } from 'class-validator';
import { NotificationStatus } from '../../enums/notification.enum';

@InputType()
export class NotificationUpdate {
	@IsMongoId()
	@Field(() => String)
	notificationId: string;

	@IsEnum(NotificationStatus)
	@Field(() => NotificationStatus)
	notificationStatus: NotificationStatus;
}
