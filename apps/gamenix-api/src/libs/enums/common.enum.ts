import { registerEnumType } from "@nestjs/graphql";

export enum Message {
    SOMETHING_WENT_WRONG = 'Something went wrong!',
    NO_DATA_FOUND = 'No data found!',
    ALREADY_REVIEWED = 'You have already reviewed this item!',
    CREATE_FAILED = 'Create failed!',
    UPDATE_FAILED = 'Update failed!',
    REMOVE_FAILED = 'Remove failed!',
    UPLOAD_FAILED = 'Upload failed!',
    BAD_REQUEST = 'Bad Request',

    USED_MEMBER_NICK_OR_PHONE = 'Already used member nick or phone',
    USED_MEMBER_EMAIL = 'Already used member email',
    NO_MEMBER_NICK = 'No member with that member nick!',
    BLOCKED_USER = 'You have been blocked!',
    WRONG_PASSWORD = 'Wrong password, try again!',
    INVALID_RESET_CODE = 'The verification code is wrong or has expired!',
    EXPIRED_RESET_SESSION = 'Your reset session has expired, please start again!',
    NOT_AUTHENTICATED = 'You are not authenticated, please login first!',
    TOKEN_NOT_EXIST = 'Bearer Token is not provided!',
    ONLY_SPECIFIC_ROLES_ALLOWED = 'Allowed only for members with specific roles!',
    NOT_ALLOWED_REQUEST = 'Not Allowed Request!',
    PROVIDE_ALLOWED_FORMAT = 'Please provide jpg, jpeg or png images!',
    SELF_SUBSCRIPTION_DENIED = 'Self subscription is denied!',
}


export enum Direction {
    ASC = 1,
    DESC = -1,
}

registerEnumType(Direction, { name: 'Direction' });
