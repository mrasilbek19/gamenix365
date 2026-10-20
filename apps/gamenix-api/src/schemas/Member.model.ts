import { Query, Schema } from 'mongoose';
import { isEmail } from 'class-validator';
import { MemberAuthType, MemberStatus, MemberType } from '../libs/enums/member.enum';

const MemberSchema = new Schema({
    memberType: {
        type: String,
        enum: MemberType,
        default: MemberType.USER,
    },

    memberStatus: {
        type: String,
        enum: MemberStatus,
        default: MemberStatus.ACTIVE,
    },

    memberAuthType: {
        type: String,
        enum: MemberAuthType,
        default: MemberAuthType.PHONE,
    },

    memberPhone: {
        type: String,
        index: { unique: true, sparse: true },
        required: true,
    },

    memberNick: {
        type: String,
        index: { unique: true, sparse: true },
        required: true,
    },

    shopName: {
        type: String,
        trim: true,
        minlength: 1,
        maxlength: 100,
        validate: {
            validator: function (value: string) {
                let memberType = this.memberType;
                if (this instanceof Query) {
                    memberType = this.get('memberType');
                    if (memberType === undefined) memberType = this.getQuery().memberType;
                }
                return value === undefined || (value !== null && memberType === MemberType.SHOP);
            },
            message: 'Shop name is only available for shop accounts',
        },
    },

    memberEmail: {
        type: String,
        trim: true,
        lowercase: true,
        select: false,
        validate: {
            validator: (value: string) => value == null || isEmail(value),
            message: 'Invalid member email',
        },
    },

    memberEmailVerified: {
        type: Boolean,
        default: false,
        select: false,
    },

    memberPassword: {
        type: String,
        select: false,
        required: true,
    },

    memberFullName: {
        type: String,
    },

    memberImage: {
        type: String,
        default: '',
    },

    memberAddress: {
        type: String,
    },

    memberDesc: {
        type: String,
    },

    memberProducts: {
        type: Number,
        default: 0,
    },

    memberArticles: {
        type: Number,
        default: 0,
    },

    memberFollowers: {
        type: Number,
        default: 0,
    },

    memberFollowings: {
        type: Number,
        default: 0,
    },

    memberPoints: {
        type: Number,
        default: 0,
    },

    memberLikes: {
        type: Number,
        default: 0,
    },

    memberViews: {
        type: Number,
        default: 0,
    },

    memberComments: {
        type: Number,
        default: 0,
    },

    memberRank: {
        type: Number,
        default: 0,
    },

    memberWarnings: {
        type: Number,
        default: 0,
    },

    memberBlocks: {
        type: Number,
        default: 0,
    },

    deletedAt: {
        type: Date
    },

},
    { timestamps: true, collection: 'members' }
);

MemberSchema.index(
    { memberEmail: 1 },
    { unique: true, partialFilterExpression: { memberEmail: { $type: 'string' } } },
);

export default MemberSchema;
