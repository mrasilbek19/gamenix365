import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventResolver } from './event.resolver';
import { EventService } from './event.service';
import EventSchema from '../../schemas/Event.model';
import EventParticipantSchema from '../../schemas/EventParticipant.model';
import MemberSchema from '../../schemas/Member.model';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    AuthModule,
    NotificationModule,
    MongooseModule.forFeature([
      {
        name: 'Event',
        schema: EventSchema,
      },
      { name: 'EventParticipant', schema: EventParticipantSchema },
      { name: 'Member', schema: MemberSchema },
    ]),
  ],
  providers: [EventResolver, EventService],
  exports: [EventService],
})
export class EventModule { }
