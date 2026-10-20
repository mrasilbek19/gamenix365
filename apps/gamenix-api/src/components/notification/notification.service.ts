import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, Notifications } from '../../libs/dto/notification/notification';
import { NotificationInput, NotificationsInquiry } from '../../libs/dto/notification/notification.input';
import { NotificationUpdate } from '../../libs/dto/notification/notification.update';
import { NotificationStatus } from '../../libs/enums/notification.enum';
import { Direction } from '../../libs/enums/common.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { T } from '../../libs/types/common';
import { SocketGateway } from '../../socket/socket.gateway';

@Injectable()
export class NotificationService {
	constructor(
		@InjectModel('Notification') private readonly notificationModel: Model<Notification>,
		private readonly socketGateway: SocketGateway,
	) {}

	/** EMISSION **/

	/**
	 * Called by the services that own the underlying event (shop, order, event),
	 * never by a resolver.
	 *
	 * A notification is a side effect: if writing it fails, the business operation
	 * that triggered it must still succeed. So this swallows its own errors and
	 * reports success as a boolean instead of throwing into the caller.
	 */
	public async createNotification(input: NotificationInput): Promise<boolean> {
		// Nobody should be notified about their own action.
		if (input.authorId && String(input.authorId) === String(input.receiverId)) return false;

		try {
			const created = await this.notificationModel.create(input);
			this.socketGateway.sendNotification(input.receiverId, created);
			return true;
		} catch (err) {
			console.log('Error, Notification.model:', err instanceof Error ? err.message : err);
			return false;
		}
	}

	/** QUERIES **/

	public async getNotifications(receiverId: Types.ObjectId, input: NotificationsInquiry): Promise<Notifications> {
		receiverId = shapeIntoMongoObjectId(receiverId);
		const match: T = { receiverId: receiverId };
		if (input.search?.notificationGroup) match.notificationGroup = input.search.notificationGroup;
		if (input.search?.notificationStatus) match.notificationStatus = input.search.notificationStatus;
		const { createdAtFrom, createdAtTo } = input.search ?? {};
		if (createdAtFrom && createdAtTo && createdAtFrom > createdAtTo) {
			throw new BadRequestException('createdAtFrom must be before createdAtTo');
		}
		if (createdAtFrom || createdAtTo) {
			match.createdAt = {};
			if (createdAtFrom) match.createdAt.$gte = createdAtFrom;
			if (createdAtTo) match.createdAt.$lte = createdAtTo;
		}

		const sort: T = { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC, _id: -1 };

		const result = await this.notificationModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		// An empty inbox is a normal state, not an error — unlike the older list
		// queries here, this returns an empty list rather than throwing.
		return result[0] ?? { list: [], metaCounter: [] };
	}

	public async getUnreadNotificationsCount(receiverId: Types.ObjectId): Promise<number> {
		receiverId = shapeIntoMongoObjectId(receiverId);
		return await this.notificationModel
			.countDocuments({ receiverId: receiverId, notificationStatus: NotificationStatus.WAIT })
			.exec();
	}

	/** MUTATIONS **/

	public async updateNotification(receiverId: Types.ObjectId, input: NotificationUpdate): Promise<Notification> {
		receiverId = shapeIntoMongoObjectId(receiverId);
		const notificationId = shapeIntoMongoObjectId(input.notificationId);

		// receiverId in the filter keeps a member from touching someone else's inbox.
		const result: Notification = await this.notificationModel
			.findOneAndUpdate(
				{ _id: notificationId, receiverId: receiverId },
				{ $set: { notificationStatus: input.notificationStatus } },
				{ new: true, runValidators: true },
			)
			.exec();
		if (!result) throw new NotFoundException('Notification not found');

		return result;
	}

	public async markAllNotificationsRead(receiverId: Types.ObjectId): Promise<number> {
		receiverId = shapeIntoMongoObjectId(receiverId);
		const result = await this.notificationModel
			.updateMany(
				{ receiverId: receiverId, notificationStatus: NotificationStatus.WAIT },
				{ $set: { notificationStatus: NotificationStatus.READ } },
			)
			.exec();

		return result.modifiedCount;
	}
}
