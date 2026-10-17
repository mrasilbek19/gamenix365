import { registerEnumType } from '@nestjs/graphql';

export enum NotificationType {
	LIKE = 'LIKE',
	COMMENT = 'COMMENT',
	ORDER_CREATED = 'ORDER_CREATED',
	ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
	SHOP_APPROVED = 'SHOP_APPROVED',
	SHOP_REJECTED = 'SHOP_REJECTED',
	EVENT_APPROVED = 'EVENT_APPROVED',
	EVENT_REJECTED = 'EVENT_REJECTED',
	EMAIL_VERIFIED = 'EMAIL_VERIFIED',
}
registerEnumType(NotificationType, {
	name: 'NotificationType',
});

export enum NotificationStatus {
	WAIT = 'WAIT',
	READ = 'READ',
}
registerEnumType(NotificationStatus, {
	name: 'NotificationStatus',
});

export enum NotificationGroup {
	MEMBER = 'MEMBER',
	ARTICLE = 'ARTICLE',
	PRODUCT = 'PRODUCT',
	ORDER = 'ORDER',
	SHOP = 'SHOP',
	EVENT = 'EVENT',
	ACCOUNT = 'ACCOUNT',
}
registerEnumType(NotificationGroup, {
	name: 'NotificationGroup',
});
