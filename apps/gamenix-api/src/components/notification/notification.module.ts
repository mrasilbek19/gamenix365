import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationResolver } from './notification.resolver';
import { NotificationService } from './notification.service';
import NotificationSchema from '../../schemas/Notification.model';
import { AuthModule } from '../auth/auth.module';
import { SocketModule } from '../../socket/socket.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{
				name: 'Notification',
				schema: NotificationSchema,
			},
		]),
		AuthModule,
		SocketModule,
	],
	providers: [NotificationResolver, NotificationService],
	exports: [NotificationService],
})
export class NotificationModule {}
