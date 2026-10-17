import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Notification, Notifications } from '../../libs/dto/notification/notification';
import { NotificationInput, NotificationsInquiry } from '../../libs/dto/notification/notification.input';
import { NotificationUpdate } from '../../libs/dto/notification/notification.update';
import { NotificationGroup, NotificationStatus, NotificationType } from '../../libs/enums/notification.enum';
import { Direction } from '../../libs/enums/common.enum';
import { OrderStatus } from '../../libs/enums/order.enum';
import { EventStatus } from '../../libs/enums/event.enum';
import { MemberStatus } from '../../libs/enums/member.enum';
import { SocketGateway } from '../../socket/socket.gateway';
import { Member } from '../../libs/dto/member/member';

@Injectable()
export class NotificationService {
	private readonly logger = new Logger(NotificationService.name);

	constructor(
		@InjectModel('Notification') private readonly notificationModel: Model<Notification>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		private readonly socketGateway: SocketGateway,
	) {}

	/** Internal business-service hook. Notification failures never fail the operation that caused them. */
	public async createNotification(input: NotificationInput, deduplicationSuffix?: string): Promise<boolean> {
		try {
			const recipientExists = await this.memberModel.exists({ _id: input.receiverId }).exec();
			if (!recipientExists) return false;

			const referenceId = input.orderId ?? input.eventId ?? input.articleId ?? input.productId ?? input.receiverId;
			const deduplicationKey = `${input.notificationType}:${referenceId}:${input.receiverId}${deduplicationSuffix ? `:${deduplicationSuffix}` : ''}`;
			const created = await this.notificationModel.create({
				...input,
				notificationStatus: NotificationStatus.WAIT,
				deduplicationKey,
			});
			try {
				this.socketGateway.sendNotification(input.receiverId, created);
			} catch {
				this.logger.warn('Notification saved; socket delivery failed');
			}
			return true;
		} catch (error) {
			// Duplicate delivery is expected when a caller retries after an uncertain result.
			if (error?.code !== 11000) {
				this.logger.warn(`Notification write failed: ${error instanceof Error ? error.message : String(error)}`);
			}
			return false;
		}
	}

	public async notifyOrderCreated(orderId: Types.ObjectId, buyerId: Types.ObjectId, shopId: Types.ObjectId): Promise<void> {
		await this.createNotification({
			notificationType: NotificationType.ORDER_CREATED,
			notificationGroup: NotificationGroup.ORDER,
			notificationTitle: 'New order received',
			notificationDesc: 'A customer placed an order with your shop.',
			authorId: buyerId,
			receiverId: shopId,
			orderId,
		});
	}

	public async notifyOrderStatusChanged(orderId: Types.ObjectId, buyerId: Types.ObjectId, shopId: Types.ObjectId, status: OrderStatus): Promise<void> {
		await this.createNotification({
			notificationType: NotificationType.ORDER_STATUS_CHANGED,
			notificationGroup: NotificationGroup.ORDER,
			notificationTitle: 'Order status changed',
			notificationDesc: `The customer changed the order status to ${status}.`,
			authorId: buyerId,
			receiverId: shopId,
			orderId,
		}, status);
	}

	public async notifyShopModeration(memberId: Types.ObjectId, approved: boolean): Promise<void> {
		await this.createNotification({
			notificationType: approved ? NotificationType.SHOP_APPROVED : NotificationType.SHOP_REJECTED,
			notificationGroup: NotificationGroup.SHOP,
			notificationTitle: approved ? 'Shop approved' : 'Shop application rejected',
			notificationDesc: approved ? 'Your shop can now use the marketplace.' : 'Your shop application was rejected.',
			receiverId: memberId,
		});
	}

	public async notifyEventModeration(eventId: Types.ObjectId, shopId: Types.ObjectId, approved: boolean): Promise<void> {
		await this.createNotification({
			notificationType: approved ? NotificationType.EVENT_APPROVED : NotificationType.EVENT_REJECTED,
			notificationGroup: NotificationGroup.EVENT,
			notificationTitle: approved ? 'Event approved' : 'Event rejected',
			notificationDesc: approved ? 'Your event has been approved.' : 'Your event was rejected.',
			receiverId: shopId,
			eventId,
		});
	}

	public async notifyEmailVerified(memberId: Types.ObjectId): Promise<void> {
		await this.createNotification({
			notificationType: NotificationType.EMAIL_VERIFIED,
			notificationGroup: NotificationGroup.ACCOUNT,
			notificationTitle: 'Email verified',
			notificationDesc: 'Your email address has been verified.',
			receiverId: memberId,
		});
	}

	public async getNotifications(receiverId: Types.ObjectId, input: NotificationsInquiry): Promise<Notifications> {
		receiverId = new Types.ObjectId(String(receiverId));
		const match: FilterQuery<Notification> = { receiverId };
		const { notificationGroup, notificationStatus, createdAtFrom, createdAtTo } = input.search ?? {};
		if (notificationGroup) match.notificationGroup = notificationGroup;
		if (notificationStatus) match.notificationStatus = notificationStatus;
		if (createdAtFrom || createdAtTo) {
			match.createdAt = {};
			if (createdAtFrom) match.createdAt.$gte = createdAtFrom;
			if (createdAtTo) match.createdAt.$lte = createdAtTo;
		}
		if (createdAtFrom && createdAtTo && createdAtFrom > createdAtTo) {
			throw new BadRequestException('createdAtFrom must be before createdAtTo');
		}

		const result = await this.notificationModel.aggregate<Notifications>([
			{ $match: match },
			{ $sort: { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC, _id: -1 } },
			{
				$facet: {
					list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
					metaCounter: [{ $count: 'total' }],
				},
			},
		]).exec();
		return result[0] ?? { list: [], metaCounter: [] };
	}

	public async getUnreadNotificationsCount(receiverId: Types.ObjectId): Promise<number> {
		receiverId = new Types.ObjectId(String(receiverId));
		return await this.notificationModel.countDocuments({ receiverId, notificationStatus: NotificationStatus.WAIT }).exec();
	}

	public async updateNotification(receiverId: Types.ObjectId, input: NotificationUpdate): Promise<Notification> {
		receiverId = new Types.ObjectId(String(receiverId));
		const result = await this.notificationModel.findOneAndUpdate(
			{ _id: new Types.ObjectId(input.notificationId), receiverId },
			{ $set: { notificationStatus: input.notificationStatus } },
			{ new: true, runValidators: true },
		).exec();
		if (!result) throw new NotFoundException('Notification not found');
		return result;
	}

	public async markAllNotificationsRead(receiverId: Types.ObjectId): Promise<number> {
		receiverId = new Types.ObjectId(String(receiverId));
		const result = await this.notificationModel.updateMany(
			{ receiverId, notificationStatus: NotificationStatus.WAIT },
			{ $set: { notificationStatus: NotificationStatus.READ } },
		).exec();
		return result.modifiedCount;
	}
}
