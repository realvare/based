import type { proto } from '../../WAProto';
export type NewsletterMetadata = {
    id: string;
    name: string;
    description: string;
    inviteCode: string;
    handle: string;
    subscriberCount: number;
    verification: 'VERIFIED' | 'UNVERIFIED';
    picture?: string;
    preview?: string;
    creationTime: number;
    muted: boolean;
    state: 'ACTIVE' | 'SUSPENDED' | 'GEOSUSPENDED';
    viewRole: 'ADMIN' | 'GUEST' | 'SUBSCRIBER';
    subscribe: 'SUBSCRIBED' | 'UNSUBSCRIBED';
};
export type NewsletterMessage = {
    serverMsgId: number;
    views: number;
    message: proto.IWebMessageInfo;
};