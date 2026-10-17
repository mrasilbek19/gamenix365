import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, ObjectId, Types } from 'mongoose';
import { Event, Events } from '../../libs/dto/event/event';
import { AllEventsInquiry, EventInput, EventsInquiry, ShopEventsInquiry } from '../../libs/dto/event/event.input';
import { EventUpdate } from '../../libs/dto/event/event.update';
import { EventParticipant, EventParticipants } from '../../libs/dto/event-participant/event-participant';
import { EventParticipantInput, EventParticipantsInquiry } from '../../libs/dto/event-participant/event-participant.input';
import { EventParticipantUpdate } from '../../libs/dto/event-participant/event-participant.update';
import { Member } from '../../libs/dto/member/member';
import { EventStatus, EventType } from '../../libs/enums/event.enum';
import { ParticipantStatus } from '../../libs/enums/participant.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Direction } from '../../libs/enums/common.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class EventService {
    constructor(
        @InjectModel('Event')
        private readonly eventModel: Model<Event>,
        @InjectModel('EventParticipant')
        private readonly eventParticipantModel: Model<EventParticipant>,
        @InjectModel('Member')
        private readonly memberModel: Model<Member>,
        @Optional() private readonly notificationService?: NotificationService,
    ) { }

    public async createEvent(
        memberId: ObjectId,
        input: EventInput
    ): Promise<Event> {
        await this.getActiveMember(memberId, [MemberType.SHOP]);

        const eventStatus = EventStatus.PENDING;

        this.validateEvent({ ...input, eventStatus }, true);

        const result = await this.eventModel.create({
            ...input,
            eventStatus,
            eventOrganizer: shapeIntoMongoObjectId(memberId),
        });

        return result;
    }

    public async getEvent(eventId: ObjectId): Promise<Event> {
        const result = await this.eventModel
            .findOne({
                _id: shapeIntoMongoObjectId(eventId),
                eventStatus: EventStatus.PROCESS,
                deletedAt: null,
            })
            .exec();

        if (!result) throw new NotFoundException('Event not found');

        return result;
    }

    public async getEvents(input: EventsInquiry): Promise<Events> {
        return await this.findEvents(input, { eventStatus: EventStatus.PROCESS, deletedAt: null });
    }

    public async getMyEvents(
        memberId: ObjectId,
        input: ShopEventsInquiry
    ): Promise<Events> {
        await this.getActiveMember(memberId, [MemberType.SHOP]);

        const match: FilterQuery<Event> = { eventOrganizer: shapeIntoMongoObjectId(memberId) };
        if (!input.includeDeleted) match.deletedAt = null;

        return await this.findEvents(input, match);
    }

    public async updateEvent(
        memberId: ObjectId,
        input: EventUpdate
    ): Promise<Event> {
        const { _id, ...changes } = input;

        if (changes.eventStatus === EventStatus.FINISHED) {
            throw new BadRequestException('Use finishEvent to finish an event');
        }

        return await this.updateTargetEvent(memberId, _id, changes);
    }

    public async finishEvent(
        memberId: ObjectId,
        eventId: ObjectId
    ): Promise<Event> {
        return await this.updateTargetEvent(memberId, eventId, { eventStatus: EventStatus.FINISHED });
    }

    public async removeEvent(
        memberId: ObjectId,
        eventId: ObjectId
    ): Promise<Event> {
        return await this.updateTargetEvent(memberId, eventId, { deletedAt: new Date() });
    }

    public async registerEvent(
        memberId: ObjectId,
        input: EventParticipantInput
    ): Promise<EventParticipant> {
        memberId = shapeIntoMongoObjectId(memberId);
        const eventId = shapeIntoMongoObjectId(input.eventId);

        const session = await this.eventModel.db.startSession();

        try {
            return await session.withTransaction(async () => {
                await this.getActiveMember(memberId, [MemberType.USER], session);

                const targetEvent = await this.lockEvent(eventId, session);
                this.checkApplicationsOpen(targetEvent);

                const search = { eventId, memberId };
                const targetParticipant = await this.eventParticipantModel
                    .findOne(search)
                    .session(session)
                    .exec();

                if (targetParticipant) {
                    if (targetParticipant.participantStatus !== ParticipantStatus.CANCELLED) {
                        throw new ConflictException('Already applied; rejected applications cannot reapply');
                    }

                    const result = await this.eventParticipantModel
                        .findOneAndUpdate(
                            { ...search, participantStatus: ParticipantStatus.CANCELLED },
                            { $set: { participantStatus: ParticipantStatus.PENDING } },
                            { new: true, runValidators: true, session },
                        )
                        .exec();

                    if (!result) throw new ConflictException('Registration changed; retry the request');

                    return result.toObject();
                }

                const [result] = await this.eventParticipantModel.create([{
                    eventId,
                    memberId,
                    participantStatus: ParticipantStatus.PENDING,
                }], { session });

                return result.toObject();
            });
        } catch (err) {
            if (err.code === 11000) throw new ConflictException('Already applied for this event');

            throw err;
        } finally {
            await session.endSession();
        }
    }

    public async cancelEventRegistration(
        memberId: ObjectId,
        eventId: ObjectId
    ): Promise<EventParticipant> {
        memberId = shapeIntoMongoObjectId(memberId);
        eventId = shapeIntoMongoObjectId(eventId);

        const session = await this.eventModel.db.startSession();

        try {
            return await session.withTransaction(async () => {
                await this.getActiveMember(memberId, [MemberType.USER], session);

                const targetEvent = await this.lockEvent(eventId, session);

                if (targetEvent.eventStatus === EventStatus.FINISHED || targetEvent.eventStart <= new Date()) {
                    throw new BadRequestException('Cancellation is closed for this event');
                }

                const result = await this.eventParticipantModel
                    .findOneAndUpdate(
                        {
                            eventId,
                            memberId,
                            participantStatus: {
                                $in: [ParticipantStatus.PENDING, ParticipantStatus.REGISTERED]
                            }
                        },
                        { $set: { participantStatus: ParticipantStatus.CANCELLED } },
                        { new: true, runValidators: true, session },
                    )
                    .exec();

                if (!result) throw new BadRequestException('No pending or approved registration to cancel');

                return result.toObject();
            });
        } finally {
            await session.endSession();
        }
    }

    public async updateEventParticipant(
        memberId: ObjectId,
        input: EventParticipantUpdate
    ): Promise<EventParticipant> {
        const { participantStatus } = input;

        if (![ParticipantStatus.REGISTERED, ParticipantStatus.REJECTED].includes(participantStatus)) {
            throw new BadRequestException('Participants can only be approved or rejected');
        }

        const session = await this.eventModel.db.startSession();

        try {
            return await session.withTransaction(async () => {
                const member = await this.getActiveMember(memberId, [MemberType.SHOP, MemberType.ADMIN], session);
                const targetParticipant = await this.eventParticipantModel
                    .findById(
                        shapeIntoMongoObjectId(input._id),
                    )
                    .session(session)
                    .exec();

                if (!targetParticipant) throw new NotFoundException('Registration not found');

                const targetEvent = await this.lockEvent(targetParticipant.eventId, session);
                this.checkEventOwner(member, targetEvent);
                this.checkApplicationsOpen(targetEvent);

                if (targetParticipant.participantStatus !== ParticipantStatus.PENDING) {
                    throw new ConflictException('Only pending applications can be reviewed');
                }

                if (participantStatus === ParticipantStatus.REGISTERED) {
                    await this.getActiveMember(targetParticipant.memberId, [MemberType.USER], session);

                    const total = await this.eventParticipantModel
                        .countDocuments({
                            eventId: targetEvent._id,
                            participantStatus: ParticipantStatus.REGISTERED,
                        })
                        .session(session)
                        .exec();

                    if (total >= targetEvent.eventMaxParticipants) throw new ConflictException('Event is full');
                }

                const result = await this.eventParticipantModel
                    .findOneAndUpdate(
                        { _id: targetParticipant._id, participantStatus: ParticipantStatus.PENDING },
                        { $set: { participantStatus } },
                        { new: true, runValidators: true, session },
                    )
                    .exec();

                if (!result) throw new ConflictException('Registration changed; retry the request');

                return result.toObject();
            });
        } finally {
            await session.endSession();
        }
    }

    public async getMyRegistrations(
        memberId: ObjectId,
        input: EventParticipantsInquiry
    ): Promise<EventParticipants> {
        await this.getActiveMember(memberId, [MemberType.USER]);

        return await this.findParticipants(input, { memberId: shapeIntoMongoObjectId(memberId) });
    }

    public async getEventParticipants(
        memberId: ObjectId,
        eventId: ObjectId,
        input: EventParticipantsInquiry,
    ): Promise<EventParticipants> {
        const member = await this.getActiveMember(memberId, [MemberType.SHOP, MemberType.ADMIN]);
        const targetEvent = await this.eventModel.findById(shapeIntoMongoObjectId(eventId)).exec();

        if (!targetEvent) throw new NotFoundException('Event not found');

        this.checkEventOwner(member, targetEvent);

        return await this.findParticipants(input, { eventId: targetEvent._id });
    }

    /** ADMIN **/

    public async getAllEventsByAdmin(
        memberId: ObjectId,
        input: AllEventsInquiry
    ): Promise<Events> {
        await this.getActiveMember(memberId, [MemberType.ADMIN]);

        return await this.findEvents(input, input.includeDeleted ? {} : { deletedAt: null });
    }

    public async updateEventByAdmin(
        memberId: ObjectId,
        input: EventUpdate
    ): Promise<Event> {
        const { _id, ...changes } = input;

        return await this.updateTargetEvent(memberId, _id, changes, true);
    }

    public async removeEventByAdmin(
        memberId: ObjectId,
        eventId: ObjectId
    ): Promise<Event> {
        return await this.updateTargetEvent(memberId, eventId, { deletedAt: new Date() }, true);
    }

    private async getActiveMember(
        memberId: ObjectId,
        roles: MemberType[],
        session?: ClientSession
    ): Promise<Member> {
        const result = await this.memberModel
            .findOne({
                _id: shapeIntoMongoObjectId(memberId),
                memberStatus: MemberStatus.ACTIVE,
                memberType: { $in: roles },
            })
            .session(session ?? null)
            .exec();

        if (!result) throw new ForbiddenException('An active member with the required role is needed');

        return result;
    }

    private checkEventOwner(member: Member, targetEvent: Event): void {
        if (member.memberType !== MemberType.ADMIN && String(targetEvent.eventOrganizer) !== String(member._id)) {
            throw new ForbiddenException('Only the owning shop can manage this event');
        }
    }

    private checkApplicationsOpen(targetEvent: Event): void {
        if (targetEvent.eventStatus !== EventStatus.PROCESS || targetEvent.eventStart <= new Date()) {
            throw new BadRequestException('Applications and approvals are closed for this event');
        }
    }

    private validateEvent(input: Partial<Event>, requireFuture: boolean): void {
        const { eventDate, eventStart, eventEnd, eventMaxParticipants } = input;

        for (const date of [eventDate, eventStart, eventEnd]) {
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new BadRequestException('Invalid event date');
        }

        if (eventStart >= eventEnd) throw new BadRequestException('Event start must be before event end');
        if (requireFuture && eventStart <= new Date()) throw new BadRequestException('Event start must be in the future');

        if (!Number.isInteger(eventMaxParticipants) || eventMaxParticipants < 1) {
            throw new BadRequestException('Participant limit must be a positive integer');
        }

        for (const text of [input.eventTitle, input.eventDesc, input.eventGame, input.eventImage, input.eventPrize]) {
            if (typeof text !== 'string' || !text.trim()) throw new BadRequestException('Required event fields cannot be empty');
        }

        if (!Object.values(EventType).includes(input.eventType) || !Object.values(EventStatus).includes(input.eventStatus)) {
            throw new BadRequestException('Invalid event type or status');
        }
    }

    private async lockEvent(
        eventId: ObjectId,
        session: ClientSession
    ) {
        // A write to the same event makes competing approvals retry before counting capacity.
        const result = await this.eventModel
            .findOneAndUpdate(
                { _id: shapeIntoMongoObjectId(eventId), deletedAt: null },
                { $inc: { __v: 1 } },
                { new: true, session, timestamps: false },
            )
            .exec();

        if (!result) throw new NotFoundException('Event not found');

        return result;
    }

    private async updateTargetEvent(
        memberId: ObjectId,
        eventId: ObjectId,
        changes: Partial<Event>,
        byAdmin = false,
    ): Promise<Event> {
        const session = await this.eventModel.db.startSession();
        let eventBeforeUpdate: Event;

        try {
            const result = await session.withTransaction(async () => {
                const member = await this.getActiveMember(memberId, [byAdmin ? MemberType.ADMIN : MemberType.SHOP], session);
                const targetEvent = await this.lockEvent(eventId, session);
                eventBeforeUpdate = targetEvent;

                this.checkEventOwner(member, targetEvent);

                if (!changes.deletedAt) {
                    if (targetEvent.eventStatus === EventStatus.FINISHED) throw new BadRequestException('Finished events cannot be edited');

                    if (!byAdmin && changes.eventStatus !== undefined &&
                        ((targetEvent.eventStatus === EventStatus.PENDING && changes.eventStatus !== EventStatus.PENDING) ||
                            (targetEvent.eventStatus !== EventStatus.PENDING && changes.eventStatus === EventStatus.PENDING))) {
                        throw new ForbiddenException('Only an admin can change event approval status');
                    }

                    const requireFuture = changes.eventStart !== undefined ||
                        (changes.eventStatus === EventStatus.PROCESS && targetEvent.eventStatus !== EventStatus.PROCESS);

                    this.validateEvent({ ...targetEvent.toObject(), ...changes }, requireFuture);

                    if (changes.eventMaxParticipants !== undefined) {
                        const total = await this.eventParticipantModel
                            .countDocuments({
                                eventId: targetEvent._id,
                                participantStatus: ParticipantStatus.REGISTERED,
                            })
                            .session(session)
                            .exec();

                        if (changes.eventMaxParticipants < total) throw new ConflictException('Limit is below approved participant count');
                    }
                }

                const result = await this.eventModel
                    .findOneAndUpdate(
                        { _id: targetEvent._id, deletedAt: null },
                        { $set: changes },
                        { new: true, runValidators: true, session },
                    )
                    .exec();

                return result.toObject();
            });
            if (byAdmin && eventBeforeUpdate.eventStatus === EventStatus.PENDING &&
                (result.eventStatus === EventStatus.PROCESS || result.eventStatus === EventStatus.PAUSED)) {
                await this.notificationService?.notifyEventModeration(
                    new Types.ObjectId(String(eventBeforeUpdate._id)),
                    new Types.ObjectId(String(eventBeforeUpdate.eventOrganizer)),
                    result.eventStatus === EventStatus.PROCESS,
                );
            }
            return result;
        } finally {
            await session.endSession();
        }
    }

    private async findEvents(
        input: EventsInquiry,
        match: FilterQuery<Event>
    ): Promise<Events> {
        const { page, limit, search } = input;

        if (search?.eventType) match.eventType = search.eventType;
        if (search?.eventStatus) {
            if (match.eventStatus) match.$and = [{ eventStatus: search.eventStatus }];
            else match.eventStatus = search.eventStatus;
        }

        // An organizer filter cannot replace getMyEvents ownership.
        if (search?.eventOrganizer && !match.eventOrganizer) match.eventOrganizer = shapeIntoMongoObjectId(search.eventOrganizer);

        const sort = {
            [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC,
            _id: Direction.DESC
        };

        const result = await this.eventModel
            .aggregate<Events>([
                { $match: match },
                { $sort: sort },
                {
                    $facet: {
                        list: [
                            { $skip: (page - 1) * limit },
                            { $limit: limit }
                        ],
                        metaCounter: [{ $count: 'total' }]
                    }
                },
            ])
            .exec();

        return result[0];
    }

    private async findParticipants(
        input: EventParticipantsInquiry,
        match: FilterQuery<EventParticipant>
    ): Promise<EventParticipants> {
        const { page, limit, search } = input;

        if (search?.participantStatus) match.participantStatus = search.participantStatus;
        if (search?.eventId && !match.eventId) match.eventId = shapeIntoMongoObjectId(search.eventId);

        const sort = {
            [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC,
            _id: Direction.DESC
        };

        const result = await this.eventParticipantModel
            .aggregate<EventParticipants>([
                { $match: match },
                { $sort: sort },
                {
                    $facet: {
                        list: [
                            { $skip: (page - 1) * limit },
                            { $limit: limit },
                            {
                                $lookup: {
                                    from: 'events',
                                    localField: 'eventId',
                                    foreignField: '_id',
                                    as: 'eventData'
                                }
                            },
                            { $unwind: { path: '$eventData', preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: 'members',
                                    localField: 'memberId',
                                    foreignField: '_id',
                                    as: 'memberData'
                                }
                            },
                            { $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
                        ],
                        metaCounter: [{ $count: 'total' }],
                    },
                },
            ])
            .exec();

        return result[0];
    }
}
