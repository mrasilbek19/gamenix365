import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import NotificationSchema from '../../schemas/Notification.model';
import MemberSchema from '../../schemas/Member.model';
import { SocketModule } from '../../socket/socket.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationResolver } from './notification.resolver';
import { NotificationService } from './notification.service';

@Module({
	imports: [
		AuthModule,
		SocketModule,
		MongooseModule.forFeature([
			{ name: 'Notification', schema: NotificationSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
	],
	providers: [NotificationResolver, NotificationService],
	exports: [NotificationService],
})
export class NotificationModule {}
