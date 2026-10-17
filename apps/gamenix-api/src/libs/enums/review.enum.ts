import { registerEnumType } from '@nestjs/graphql';

export enum ReviewStatus {
	ACTIVE = 'ACTIVE',
	HIDE = 'HIDE',
	DELETE = 'DELETE',
}
registerEnumType(ReviewStatus, { name: 'ReviewStatus' });

export enum ReviewGroup {
	PRODUCT = 'PRODUCT',
	SHOP = 'SHOP',
}
registerEnumType(ReviewGroup, { name: 'ReviewGroup' });
