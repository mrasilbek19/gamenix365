import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotificationService } from './notification.service';
import { NotificationResolver } from './notification.resolver';
import { AuthService } from '../auth/auth.service';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { Test } from '@nestjs/testing';
import { GraphQLObjectType } from 'graphql';
import { NotificationGroup, NotificationStatus, NotificationType } from '../../libs/enums/notification.enum';
import { OrderStatus } from '../../libs/enums/order.enum';
import NotificationSchema from '../../schemas/Notification.model';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum',
	() => jest.requireActual('../../libs/enums/common.enum'), { virtual: true });

const exec = (value: any) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('NotificationService', () => {
	const recipientId = new Types.ObjectId();
	const otherMemberId = new Types.ObjectId();
	const orderId = new Types.ObjectId();
	const eventId = new Types.ObjectId();
	let notifications: any;
	let members: any;
	let service: NotificationService;

	beforeEach(() => {
		notifications = {
			create: jest.fn().mockResolvedValue({}),
			aggregate: jest.fn(() => exec([{ list: [], metaCounter: [{ total: 0 }] }])),
			countDocuments: jest.fn(() => exec(3)),
			findOneAndUpdate: jest.fn(() => exec({ _id: orderId })),
			updateMany: jest.fn(() => exec({ modifiedCount: 2 })),
		};
		members = { exists: jest.fn(() => exec({ _id: recipientId })) };
		service = new NotificationService(notifications, members);
	});

	it('preserves WAIT/READ and installs recipient, status/date and unique dedupe indexes', () => {
		expect(NotificationSchema.path('notificationStatus').options.default).toBe(NotificationStatus.WAIT);
		expect(NotificationSchema.path('notificationStatus').options.enum).toEqual(NotificationStatus);
		const indexes = NotificationSchema.indexes();
		expect(indexes.map(([fields]) => fields)).toEqual(expect.arrayContaining([
			{ receiverId: 1, createdAt: -1 },
			{ receiverId: 1, notificationStatus: 1, createdAt: -1 },
			{ deduplicationKey: 1 },
		]));
		expect(indexes.find(([fields]) => 'deduplicationKey' in fields)?.[1]).toMatchObject({ unique: true });
	});

	it('creates server-only records with WAIT status and a deterministic server key', async () => {
		await service.createNotification({
			notificationType: NotificationType.ORDER_CREATED,
			notificationGroup: NotificationGroup.ORDER,
			notificationTitle: 'New order',
			receiverId: recipientId,
			orderId,
		});

		expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
			notificationStatus: NotificationStatus.WAIT,
			deduplicationKey: `ORDER_CREATED:${orderId}:${recipientId}`,
		}));
	});

	it('ignores duplicate delivery and missing recipients without throwing', async () => {
		const duplicate = Object.assign(new Error('duplicate'), { code: 11000 });
		notifications.create.mockRejectedValueOnce(duplicate);
		await expect(service.createNotification({
			notificationType: NotificationType.ORDER_CREATED,
			notificationGroup: NotificationGroup.ORDER,
			notificationTitle: 'New order',
			receiverId: recipientId,
			orderId,
		})).resolves.toBe(false);

		members.exists.mockReturnValueOnce(exec(null));
		await expect(service.createNotification({
			notificationType: NotificationType.EMAIL_VERIFIED,
			notificationGroup: NotificationGroup.ACCOUNT,
			notificationTitle: 'Email verified',
			receiverId: otherMemberId,
		})).resolves.toBe(false);
		expect(notifications.create).toHaveBeenCalledTimes(1);
	});

	it('treats notification storage outages as a failed side effect', async () => {
		notifications.create.mockRejectedValueOnce(new Error('database unavailable'));
		await expect(service.createNotification({
			notificationType: NotificationType.EMAIL_VERIFIED,
			notificationGroup: NotificationGroup.ACCOUNT,
			notificationTitle: 'Email verified',
			receiverId: recipientId,
		})).resolves.toBe(false);
	});

	it('scopes paginated inbox queries by recipient and supports status/date filters', async () => {
		const from = new Date('2026-01-01T00:00:00Z');
		const to = new Date('2026-01-31T23:59:59Z');
		await service.getNotifications(recipientId, {
			page: 3,
			limit: 10,
			search: { notificationStatus: NotificationStatus.WAIT, createdAtFrom: from, createdAtTo: to },
		} as any);

		const pipeline = notifications.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match).toEqual({
			receiverId: recipientId,
			notificationStatus: NotificationStatus.WAIT,
			createdAt: { $gte: from, $lte: to },
		});
		expect(pipeline[2].$facet.list).toEqual([{ $skip: 20 }, { $limit: 10 }]);
	});

	it('rejects inverted date bounds', async () => {
		await expect(service.getNotifications(recipientId, {
			page: 1,
			limit: 10,
			search: { createdAtFrom: new Date('2026-02-01'), createdAtTo: new Date('2026-01-01') },
		} as any)).rejects.toBeInstanceOf(BadRequestException);
	});

	it('counts WAIT notifications and scopes mark-read updates to the owner', async () => {
		await expect(service.getUnreadNotificationsCount(recipientId)).resolves.toBe(3);
		expect(notifications.countDocuments).toHaveBeenCalledWith({ receiverId: recipientId, notificationStatus: NotificationStatus.WAIT });

		await service.updateNotification(recipientId, { notificationId: String(orderId), notificationStatus: NotificationStatus.READ });
		expect(notifications.findOneAndUpdate).toHaveBeenCalledWith(
			{ _id: new Types.ObjectId(String(orderId)), receiverId: recipientId },
			expect.objectContaining({ $set: { notificationStatus: NotificationStatus.READ } }),
			expect.any(Object),
		);
		notifications.findOneAndUpdate.mockReturnValueOnce(exec(null));
		await expect(service.updateNotification(otherMemberId, {
			notificationId: String(orderId), notificationStatus: NotificationStatus.READ,
		})).rejects.toBeInstanceOf(NotFoundException);
	});

	it('marks only the authenticated recipient’s WAIT notifications as read', async () => {
		await expect(service.markAllNotificationsRead(recipientId)).resolves.toBe(2);
		expect(notifications.updateMany).toHaveBeenCalledWith(
			{ receiverId: recipientId, notificationStatus: NotificationStatus.WAIT },
			{ $set: { notificationStatus: NotificationStatus.READ } },
		);
	});

	it('routes each supported trigger to the intended member and reference', async () => {
		const create = jest.spyOn(service, 'createNotification').mockResolvedValue(true);
		await service.notifyOrderCreated(orderId, otherMemberId, recipientId);
		await service.notifyOrderStatusChanged(orderId, otherMemberId, recipientId, OrderStatus.PROCESS);
		await service.notifyShopModeration(recipientId, true);
		await service.notifyEventModeration(eventId, recipientId, false);
		await service.notifyEmailVerified(recipientId);

		expect(create).toHaveBeenNthCalledWith(1, expect.objectContaining({ receiverId: recipientId, authorId: otherMemberId, orderId }));
		expect(create).toHaveBeenNthCalledWith(2, expect.objectContaining({ receiverId: recipientId, authorId: otherMemberId, orderId }), OrderStatus.PROCESS);
		expect(create).toHaveBeenNthCalledWith(3, expect.objectContaining({ receiverId: recipientId, notificationType: NotificationType.SHOP_APPROVED }));
		expect(create).toHaveBeenNthCalledWith(4, expect.objectContaining({ receiverId: recipientId, eventId, notificationType: NotificationType.EVENT_REJECTED }));
		expect(create).toHaveBeenNthCalledWith(5, expect.objectContaining({ receiverId: recipientId, notificationType: NotificationType.EMAIL_VERIFIED }));
	});

	it('exposes only the authenticated inbox operations in GraphQL', async () => {
		const module = await Test.createTestingModule({
			imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
			providers: [
				NotificationResolver,
				{ provide: NotificationService, useValue: service },
				{ provide: AuthService, useValue: { verifyToken: jest.fn() } },
			],
		}).compile();
		const app = module.createNestApplication();
		await app.init();
		try {
			const schema = app.get(GraphQLSchemaHost).schema;
			const queryFields = (schema.getQueryType() as GraphQLObjectType).getFields();
			const mutationFields = (schema.getMutationType() as GraphQLObjectType).getFields();
			expect(Object.keys(queryFields)).toEqual(expect.arrayContaining(['getNotifications', 'getUnreadNotificationsCount']));
			expect(Object.keys(mutationFields)).toEqual(expect.arrayContaining(['updateNotification', 'markAllNotificationsRead']));
			expect(mutationFields.createNotification).toBeUndefined();
		} finally {
			await app.close();
		}
	});
});
