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
import { SocketGateway } from '../../socket/socket.gateway';
import * as WebSocket from 'ws';
import NotificationSchema from '../../schemas/Notification.model';

jest.mock('apps/gamenix-api/src/libs/enums/common.enum',
	() => jest.requireActual('../../libs/enums/common.enum'), { virtual: true });

const exec = (value: any) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('NotificationService', () => {
	const recipientId = new Types.ObjectId();
	const otherMemberId = new Types.ObjectId();
	const orderId = new Types.ObjectId();
	let notifications: any;
	let service: NotificationService;
	let socket: any;

	beforeEach(() => {
		notifications = {
			create: jest.fn().mockResolvedValue({}),
			aggregate: jest.fn(() => exec([{ list: [], metaCounter: [{ total: 0 }] }])),
			countDocuments: jest.fn(() => exec(3)),
			findOneAndUpdate: jest.fn(() => exec({ _id: orderId })),
			updateMany: jest.fn(() => exec({ modifiedCount: 2 })),
		};
		socket = { sendNotification: jest.fn() };
		service = new NotificationService(notifications, socket);
	});

	it('preserves WAIT/READ and recipient/status/date indexes', () => {
		expect(NotificationSchema.path('notificationStatus').options.default).toBe(NotificationStatus.WAIT);
		expect(NotificationSchema.path('notificationStatus').options.enum).toEqual(NotificationStatus);
		const indexes = NotificationSchema.indexes();
		expect(indexes.map(([fields]) => fields)).toEqual(expect.arrayContaining([
			{ receiverId: 1, createdAt: -1 },
			{ receiverId: 1, notificationStatus: 1, createdAt: -1 },
		]));
	});

	it('persists the server notification and then sends it to its recipient', async () => {
		const input = {
			notificationType: NotificationType.ORDER_CREATED,
			notificationGroup: NotificationGroup.ORDER,
			notificationTitle: 'New order',
			receiverId: recipientId,
			orderId,
		};
		await expect(service.createNotification(input)).resolves.toBe(true);

		expect(notifications.create).toHaveBeenCalledWith(input);
		expect(socket.sendNotification).toHaveBeenCalledWith(recipientId, {});
		expect(notifications.create.mock.invocationCallOrder[0]).toBeLessThan(socket.sendNotification.mock.invocationCallOrder[0]);
	});

	it('keeps notification delivery failure from rejecting the business operation', async () => {
		const created = { _id: orderId, notificationStatus: NotificationStatus.WAIT };
		notifications.create.mockResolvedValueOnce(created);
		socket.sendNotification.mockImplementationOnce(() => { throw new Error('socket offline'); });
		await expect(service.createNotification({
			notificationType: NotificationType.ORDER_CREATED, notificationGroup: NotificationGroup.ORDER,
			notificationTitle: 'New order', receiverId: recipientId, orderId,
		})).resolves.toBe(false);
		expect(socket.sendNotification).toHaveBeenCalledWith(recipientId, created);
	});

	it('does not notify a member about their own action', async () => {
		await expect(service.createNotification({
			notificationType: NotificationType.ORDER_CREATED,
			notificationGroup: NotificationGroup.ORDER,
			notificationTitle: 'New order',
			receiverId: recipientId,
			authorId: recipientId,
			orderId,
		})).resolves.toBe(false);

		expect(notifications.create).not.toHaveBeenCalled();
		expect(socket.sendNotification).not.toHaveBeenCalled();
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


describe('Petora recipient-scoped socket delivery', () => {
	const recipient = { _id: new Types.ObjectId(), memberNick: 'recipient', memberImage: '', exp: Math.floor(Date.now() / 1000) + 60 };
	const client = (readyState: number = WebSocket.OPEN) => ({ readyState, send: jest.fn() });

	it('delivers to all open recipient tabs, excluding other users, guests and expired sessions', () => {
		const gateway = new SocketGateway({} as any);
		const first = client(), second = client(), other = client(), guest = client(), expired = client(), closed = client(WebSocket.CLOSED);
		(gateway as any).clientsAuthMap = new Map([
			[first, recipient], [second, recipient], [other, { ...recipient, _id: new Types.ObjectId() }],
			[guest, null], [expired, { ...recipient, exp: 1 }], [closed, recipient],
		]);
		const notification = { _id: new Types.ObjectId(), notificationTitle: 'Private order' };
		gateway.sendNotification(recipient._id, notification as any);
		for (const tab of [first, second]) expect(JSON.parse(tab.send.mock.calls[0][0])).toMatchObject({ event: 'notification', notification: { notificationTitle: 'Private order' } });
		for (const tab of [other, guest, expired, closed]) expect(tab.send).not.toHaveBeenCalled();
		expect((gateway as any).messagesList).toEqual([]);
	});

	it('continues delivery when one recipient connection fails', () => {
		const gateway = new SocketGateway({} as any);
		const first = client(), second = client();
		first.send.mockImplementation(() => { throw new Error('closed during send'); });
		(gateway as any).clientsAuthMap = new Map([[first, recipient], [second, recipient]]);
		expect(() => gateway.sendNotification(recipient._id, {} as any)).not.toThrow();
		expect(second.send).toHaveBeenCalledTimes(1);
	});

	it('keeps credentials and personal details out of public presence, chat and history', async () => {
		const gateway = new SocketGateway({ verifyToken: jest.fn().mockResolvedValue({
			...recipient, memberEmail: 'private@example.test', memberPhone: 'private-phone', memberAddress: 'private-address', memberPassword: 'hash', accessToken: 'secret',
		}) } as any);
		const tab = client();
		gateway.server = { clients: new Set([tab]) } as any;
		const log = jest.spyOn(console, 'log').mockImplementation(() => {});
		try {
			await gateway.handleConnection(tab as any, { url: '/?token=private-token' });
			await gateway.handleMessage(tab as any, 'Hello');
			gateway.handleDisconnect(tab as any);
			const payload = JSON.stringify(tab.send.mock.calls) + JSON.stringify((gateway as any).messagesList);
			for (const privateValue of ['private@example', 'private-phone', 'private-address', 'hash', 'secret', 'private-token']) expect(payload).not.toContain(privateValue);
			expect(JSON.stringify(log.mock.calls)).not.toContain('private-token');
			expect((gateway as any).clientsAuthMap.size).toBe(0);
		} finally { log.mockRestore(); }
	});
});
