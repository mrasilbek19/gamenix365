import { registerEnumType } from '@nestjs/graphql';

export enum MemberType {
    USER = 'USER',
    ADMIN = 'ADMIN',
    SHOP = 'SHOP',
}

registerEnumType(MemberType, {
    name: 'MemberType',
});

export enum MemberStatus {
    ACTIVE = 'ACTIVE',
    BLOCK = 'BLOCK',
    PENDING = 'PENDING',
    DELETE = 'DELETE',
}

registerEnumType(MemberStatus, {
    name: 'MemberStatus',
});

export enum MemberAuthType {
    PHONE = 'PHONE',
    EMAIL = 'EMAIL',
    TELEGRAM = 'TELEGRAM',
    GOOGLE = 'GOOGLE',
}

registerEnumType(MemberAuthType, {
    name: 'MemberAuthType',
});