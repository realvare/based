import { AxiosRequestConfig } from 'axios';
import type { Readable } from 'stream';
import type { URL } from 'url';
import { proto } from '../../WAProto';
import { MEDIA_HKDF_KEY_MAPPING } from '../Defaults';
import { BinaryNode } from '../WABinary';
import type { GroupMetadata } from './GroupMetadata';
import { CacheStore } from './Socket';
import { ILogger } from '../Utils/logger';
export { proto as WAProto };
export type WAMessage = proto.IWebMessageInfo & {
    key: WAMessageKey;
};
export type WAMessageContent = proto.IMessage;
export type WAContactMessage = proto.Message.IContactMessage;
export type WAContactsArrayMessage = proto.Message.IContactsArrayMessage;
export type WAMessageKey = proto.IMessageKey & {
    senderPn?: string;
    senderLid?: string;
    participantLid?: string;
    remoteLid?: string;
    remoteJidNormalized?: string;
    server_id?: string;
    isViewOnce?: boolean;
};
export type WATextMessage = proto.Message.IExtendedTextMessage;
export type WAContextInfo = proto.IContextInfo;
export type WALocationMessage = proto.Message.ILocationMessage;
export type WAGenericMediaMessage = proto.Message.IVideoMessage | proto.Message.IImageMessage | proto.Message.IAudioMessage | proto.Message.IDocumentMessage | proto.Message.IStickerMessage;
export interface StickerPackMessage {
    name: string;
    publisher: string;
    description?: string;
    cover?: WAMediaUpload;
    stickers: Sticker[];
    stickerPackId?: string;
    origin?: 0 | 1 | 2; // FIRST_PARTY = 0, THIRD_PARTY = 1, USER_CREATED = 2
    caption?: string;
}
export interface Sticker {
    sticker: WAMediaUpload;
    emojis?: string[];
    isAnimated?: boolean;
    isLottie?: boolean;
    fileName?: string;
    accessibilityLabel?: string;
    mimetype?: string;
}
export declare const WAMessageStubType: typeof proto.WebMessageInfo.StubType;
export declare const WAMessageStatus: typeof proto.WebMessageInfo.Status;
export type WAMediaPayloadURL = {
    url: URL | string;
};
export type WAMediaPayloadStream = {
    stream: Readable;
};
export type WAMediaUpload = Buffer | WAMediaPayloadStream | WAMediaPayloadURL;
/** Set of message types that are supported by the library */
export type MessageType = keyof proto.Message;
export type DownloadableMessage = {
    mediaKey?: Uint8Array | null;
    directPath?: string | null;
    url?: string | null;
};
export type MessageReceiptType = 'read' | 'read-self' | 'hist_sync' | 'peer_msg' | 'sender' | 'inactive' | 'played' | undefined;
export type MediaConnInfo = {
    auth: string;
    ttl: number;
    hosts: {
        hostname: string;
        maxContentLengthBytes: number;
    }[];
    fetchDate: Date;
};
export interface WAUrlInfo {
    'canonical-url': string;
    'matched-text': string;
    title: string;
    description?: string;
    jpegThumbnail?: Buffer;
    highQualityThumbnail?: proto.Message.IImageMessage;
    originalThumbnailUrl?: string;
}
type Mentionable = {
    /** list of jids that are mentioned in the accompanying text */
    mentions?: string[];
};
type Contextable = {
    /** add contextInfo to the message */
    contextInfo?: proto.IContextInfo;
};
type ViewOnce = {
    viewOnce?: boolean;
};
type Buttonable = {
    /** add buttons to the message  */
    buttons?: proto.Message.ButtonsMessage.IButton[];
};
type Templatable = {
    /** add buttons to the message (conflicts with normal buttons)*/
    templateButtons?: proto.IHydratedTemplateButton[];
    footer?: string;
};
type Interactiveable = {
    /** add buttons to the message  */
    interactiveButtons?: proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton[];
    title?: string;
    subtitle?: string;
    media?: boolean;
    /** Footer with optional audio attachment */
    footer?: string | {
        text: string;
        audio?: WAMediaUpload;
    };
    /** Product message in header */
    headerProduct?: WASendableProduct;
};
type Shopable = {
    shop?: proto.Message.InteractiveMessage.ShopMessage.Surface;
    id?: string;
    title?: string;
    subtitle?: string;
    media?: boolean;
};
type Collectionable = {
    collection?: {
        bizJid: string;
        id: string;
        messageVersion?: number;
    };
};
type Invoiceable = {
    invoice?: {
        note: string;
        token: string;
        attachmentType?: 0 | 1; // 0 = IMAGE, 1 = PDF
        attachment?: WAMediaUpload;
    };
};
type Cardsable = {
    cards?: CarouselCard[];
    subtitle?: string;
    /** Carousel card type: 1 = HSCROLL_CARDS, 2 = ALBUM_IMAGE */
    carouselCardType?: 1 | 2;
};

type CarouselCard = {
    title?: string;
    body?: string;
    footer?: string;
    image?: WAMediaUpload;
    video?: WAMediaUpload;
    buttons?: CarouselButton[];
};

type CarouselButton = {
    name: 'quick_reply' | 'cta_url';
    buttonParamsJson: string;
};
type Editable = {
    edit?: WAMessageKey;
};
type Listable = {
    /** Sections of the List */
    sections?: proto.Message.ListMessage.ISection[];
    /** Title of a List Message only */
    title?: string;
    /** Text of the button on the list (required) */
    buttonText?: string;
    /** ListType of a List Message only */
    listType?: proto.Message.ListMessage.ListType;
};
type WithDimensions = {
    width?: number;
    height?: number;
};
export type PollMessageOptions = {
    name: string;
    selectableCount?: number;
    values: string[];
    /** 32 byte message secret to encrypt poll selections */
    messageSecret?: Uint8Array;
    toAnnouncementGroup?: boolean;
};
type SharePhoneNumber = {
    sharePhoneNumber: boolean;
};
type RequestPhoneNumber = {
    requestPhoneNumber: boolean;
};
export type MediaType = keyof typeof MEDIA_HKDF_KEY_MAPPING;
export type AnyMediaMessageContent = (({
    image: WAMediaUpload;
    caption?: string;
    jpegThumbnail?: string;
} & Mentionable & Contextable & Buttonable & Templatable & Interactiveable & Shopable & Collectionable & Invoiceable & Cardsable & WithDimensions) | ({
    video: WAMediaUpload;
    caption?: string;
    gifPlayback?: boolean;
    jpegThumbnail?: string;
    /** if set to true, will send as a `video note` */
    ptv?: boolean;
} & Mentionable & Contextable & Buttonable & Templatable & Interactiveable & Shopable & Cardsable & WithDimensions) | {
    audio: WAMediaUpload;
    /** if set to true, will send as a `voice note` */
    ptt?: boolean;
    /** optionally tell the duration of the audio */
    seconds?: number;
} | ({
    sticker: WAMediaUpload;
    isAnimated?: boolean;
} & WithDimensions) | ({
    document: WAMediaUpload;
    mimetype: string;
    fileName?: string;
    caption?: string;
} & Contextable & Buttonable & Templatable & Interactiveable & Shopable & Cardsable)) & {
    mimetype?: string;
} & Editable;
export type ButtonReplyInfo = {
    displayText: string;
    id: string;
    index: number;
    carouselCardIndex?: number; // For carousel button replies
};
export type GroupInviteInfo = {
    inviteCode: string;
    inviteExpiration: number;
    text: string;
    jid: string;
    subject: string;
};
export type CallCreationInfo = {
    time?: number;
    title?: string;
    type?: number;
};
export type AdminInviteInfo = {
    inviteExpiration: number;
    text: string;
    jid: string;
    subject: string;
    thumbnail: Buffer;
};
export type PaymentInviteInfo = {
    type?: number;
    expiry?: number;
};
export type RequestPaymentInfo = {
    expiry: number;
    amount: number;
    currency: string;
    from: string;
    note?: string;
    sticker?: WAMediaUpload;
    background: string;
    /** add contextInfo to the message */
    contextInfo?: proto.IContextInfo;
};
export type EventsInfo = {
    isCanceled?: boolean;
    name: string;
    description: string;
    joinLink?: string;
    startTime?: number;
    messageSecret?: Uint8Array;
};
export type CommentInfo = {
    message: proto.IMessage;
    targetMessageKey: WAMessageKey;
};
export type QuestionInfo = {
    text: string;
    contextInfo?: proto.IContextInfo;
};
export type QuestionResponseInfo = {
    key: WAMessageKey;
    text: string;
};
export type StatusQuestionAnswerInfo = {
    key: WAMessageKey;
    text: string;
};
export type StatusQuotedInfo = {
    type: proto.Message.StatusQuotedMessage.StatusQuotedMessageType;
    text: string;
    thumbnail?: Buffer;
    originalStatusId?: WAMessageKey;
};
export type StatusStickerInteractionInfo = {
    key: WAMessageKey;
    stickerKey: string;
    type: proto.Message.StatusStickerInteractionMessage.StatusStickerType;
};
export type PollMessageOptionsV4 = PollMessageOptions & { pollType: proto.Message.PollType; };
export type PollMessageOptionsV5 = PollMessageOptions & { pollType: proto.Message.PollType; };
export type PollResultSnapshotMessageV3 = {
    pollCreationMessageKey: WAMessageKey;
    pollResult?: {
        vote: {
            selectedOptions: Uint8Array[];
        };
        senderTimestampMs: number;
    };
    selectedOptions?: Uint8Array[];
    contextInfo?: proto.IContextInfo;
    pollType?: proto.Message.PollType;
};

export type TemplateButton = proto.TemplateButton;

export type HydratedFourRowTemplateInfo = {
    text?: string;
    footer?: string;
    header?: InteractiveMessageHeader;
    buttons: TemplateButton[];
};

export type FourRowTemplateInfo = {
    text?: string;
    footer?: string;
    header?: InteractiveMessageHeader;
    buttons: TemplateButton[];
};

export type RichResponseInfo = {
    messageType?: proto.AIRichResponseMessageType;
    submessages?: proto.Message.AIRichResponseSubMessage[];
    unifiedResponse?: proto.Message.AIRichResponseUnifiedResponse;
    contextInfo?: proto.IContextInfo;
};
export type EventResponseInfo = {
    response: proto.Message.EventResponseMessage.EventResponseType; // GOING = 1, NOT_GOING = 2, MAYBE = 3
    timestampMs?: number;
    extraGuestCount?: number;
};
export type StatusMentionInfo = {
    quotedStatus: proto.IMessage;
};
export type GroupStatusInfo = {
    message: proto.IMessage;
};
export type BotTaskInfo = {
    message: proto.IMessage;
};
export type LimitSharingInfo = {
    message: proto.IMessage;
};
export type StatusAddYoursInfo = {
    message: proto.IMessage;
};
export type BotForwardedInfo = {
    message: proto.IMessage;
};
export type EventCoverImageInfo = {
    message: proto.IMessage;
};
export type OrderInfo = {
    id: number;
    thumbnail: string;
    itemCount: number;
    status: number;
    surface: number;
    title: string;
    text: string;
    seller: string;
    token: string;
    amount: number;
    currency: string;
};
export type WASendableProduct = Omit<proto.Message.ProductMessage.IProductSnapshot, 'productImage'> & {
    productImage: WAMediaUpload;
};
export type AlbumMedia = {
    image: WAMediaUpload;
    caption?: string;
} | {
    video: WAMediaUpload;
    caption?: string;
    gifPlayback?: boolean;
};
export type AnyRegularMessageContent = (({
    text: string;
    linkPreview?: WAUrlInfo | null;
} & Mentionable & Contextable & Buttonable & Templatable & Interactiveable & Shopable & Cardsable & Listable & Editable) | AnyMediaMessageContent | ({
    template: FourRowTemplateInfo | HydratedFourRowTemplateInfo;
} & Mentionable & Contextable & Buttonable & Templatable & Interactiveable & Shopable & Cardsable & Listable & Editable) | ({
    poll: PollMessageOptions;
} & Mentionable & Contextable & Buttonable & Templatable & Editable) | ({
    pollV4: PollMessageOptionsV4;
} & Mentionable & Contextable & Buttonable & Templatable & Editable) | ({
    pollV5: PollMessageOptionsV5;
} & Mentionable & Contextable & Buttonable & Templatable & Editable) | ({
    pollResultSnapshotV3: PollResultSnapshotMessageV3;
} & Mentionable & Contextable & Buttonable & Templatable & Editable) | {
    contacts: {
        displayName?: string;
        contacts: proto.Message.IContactMessage[];
    };
} | {
    location: WALocationMessage;
} | {
    react: proto.Message.IReactionMessage;
} | {
    buttonReply: ButtonReplyInfo;
    type: 'template' | 'plain';
} | {
    groupInvite: GroupInviteInfo;
} | {
    listReply: Omit<proto.Message.IListResponseMessage, 'contextInfo'>;
} | {
    pin: WAMessageKey | {
        key: WAMessageKey;
        type?: 1 | 2; // 1 = PIN_FOR_ALL, 2 = UNPIN_FOR_ALL
        time?: number; // Duration in seconds (24 hours = 86400, 7 days = 604800, 30 days = 2592000)
    };
    type?: 1 | 2; // 1 = PIN_FOR_ALL, 2 = UNPIN_FOR_ALL (only used if pin is WAMessageKey)
    /**
     * Duration in seconds for pin (24 hours = 86400, 7 days = 604800, 30 days = 2592000)
     * Only used when type = 1 (PIN_FOR_ALL)
     */
    time?: number;
} | {
    keep: WAMessageKey;
    type: number;
    /**
     * 24 hours, 7 days, 90 days
     */
    time?: 86400 | 604800 | 7776000;
} | {
    paymentInvite: PaymentInviteInfo;
} | {
    requestPayment: RequestPaymentInfo;
} | {
    event: EventsInfo;
} | {
    comment: CommentInfo;
} | {
    question: QuestionInfo;
} | {
    questionResponse: QuestionResponseInfo;
} | {
    statusQuestionAnswer: StatusQuestionAnswerInfo;
} | {
    statusQuoted: StatusQuotedInfo;
} | {
    statusStickerInteraction: StatusStickerInteractionInfo;
} | {
    richResponse: RichResponseInfo;
} | {
    eventResponse: EventResponseInfo;
} | {
    statusMention: StatusMentionInfo;
} | {
    groupStatus: GroupStatusInfo;
} | {
    botTask: BotTaskInfo;
} | {
    limitSharing: LimitSharingInfo;
} | {
    statusAddYours: StatusAddYoursInfo;
} | {
    botForwarded: BotForwardedInfo;
} | {
    eventCoverImage: EventCoverImageInfo;
} | {
    bCall: {
        sessionId: string;
        mediaType?: 0 | 1 | 2; // UNKNOWN = 0, AUDIO = 1, VIDEO = 2
        masterKey?: Uint8Array;
        caption?: string;
    };
} | {
    callLog: {
        isVideo?: boolean;
        callOutcome?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // CONNECTED, MISSED, FAILED, etc.
        durationSecs?: number;
        callType?: 0 | 1 | 2; // REGULAR = 0, SCHEDULED_CALL = 1, VOICE_CHAT = 2
        participants?: Array<{
            jid: string;
            callOutcome?: number;
        }>;
    };
} | {
    encComment: {
        targetMessageKey: WAMessageKey;
        encPayload: Uint8Array;
        encIv: Uint8Array;
    };
} | {
    encEventResponse: {
        eventCreationMessageKey: WAMessageKey;
        encPayload: Uint8Array;
        encIv: Uint8Array;
    };
} | {
    messageHistoryBundle: {
        mimetype?: string;
        media?: WAMediaUpload;
        contextInfo?: proto.IContextInfo;
        messageHistoryMetadata?: {
            historyReceivers?: string[];
            oldestMessageTimestamp?: number;
            messageCount?: number;
        };
    };
} | {
    messageHistoryNotice: {
        contextInfo?: proto.IContextInfo;
        messageHistoryMetadata?: {
            historyReceivers?: string[];
            oldestMessageTimestamp?: number;
            messageCount?: number;
        };
    };
} | {
    inviteFollower: {
        newsletterJid: string;
        newsletterName: string;
        thumbnail?: Buffer;
        caption?: string;
        contextInfo?: proto.IContextInfo;
    };
} | {
    placeholder: {
        type?: 0; // MASK_LINKED_DEVICES = 0
    };
} | {
    secretEncrypted: {
        targetMessageKey: WAMessageKey;
        encPayload: Uint8Array;
        encIv: Uint8Array;
        secretEncType?: 0 | 1 | 2; // UNKNOWN = 0, EVENT_EDIT = 1, MESSAGE_EDIT = 2
    };
} | {
    statusNotification: {
        responseMessageKey?: WAMessageKey;
        originalMessageKey?: WAMessageKey;
        type?: 0 | 1 | 2 | 3; // UNKNOWN = 0, STATUS_ADD_YOURS = 1, STATUS_RESHARE = 2, STATUS_QUESTION_ANSWER_RESHARE = 3
    };
} | {
    stickerSyncRMR: {
        filehash?: string[];
        rmrSource?: string;
        requestTimestamp?: number;
    };
} | {
    sendPayment: {
        requestMessageKey: WAMessageKey;
        noteMessage?: proto.IMessage;
        background?: proto.IPaymentBackground;
        transactionData?: string;
    };
} | {
    declinePayment: {
        key: WAMessageKey;
    };
} | {
    cancelPayment: {
        key: WAMessageKey;
    };
} | {
    scheduledCallEdit: {
        key: WAMessageKey;
        editType?: 0 | 1; // UNKNOWN = 0, CANCEL = 1
    };
} | {
    pollResultSnapshot: {
        name: string;
        pollVotes?: Array<{
            optionName: string;
            optionVoteCount: number;
        }>;
        contextInfo?: proto.IContextInfo;
        pollType?: 0 | 1; // POLL = 0, QUIZ = 1
    };
} | {
    pollUpdate: {
        pollCreationMessageKey: WAMessageKey;
        vote?: {
            encPayload: Uint8Array;
            encIv: Uint8Array;
        };
        metadata?: {};
        senderTimestampMs?: number;
    };
} | {
    deviceSent: {
        destinationJid: string;
        message: AnyRegularMessageContent;
        phash?: string;
    };
} | {
    chat: {
        displayName: string;
        id: string;
    };
} | {
    order: OrderInfo;
} | {
    call: CallCreationInfo;
} | {
    inviteAdmin: AdminInviteInfo;
} | {
    listReply: Omit<proto.Message.IListResponseMessage, 'contextInfo'>;
} | ({
    product: WASendableProduct;
    businessOwnerJid?: string;
    body?: string;
    footer?: string;
} & Mentionable & Contextable & Interactiveable & Shopable & Cardsable & WithDimensions) | SharePhoneNumber | RequestPhoneNumber | ({
    album: AlbumMedia[];
    caption?: string;
} & Mentionable & Contextable & Editable) | { 
    stickerPack: StickerPackMessage;
} | {
    interactiveResponse: {
        body?: {
            text: string;
            format?: 0 | 1; // DEFAULT = 0, EXTENSIONS_1 = 1
        };
        nativeFlowResponse?: {
            name: string;
            paramsJson: string;
            version?: number;
        };
        contextInfo?: proto.IContextInfo;
    };
}) & ViewOnce;
export type AnyMessageContent = AnyRegularMessageContent | {
    forward: WAMessage;
    force?: boolean;
} | {
    /** Delete your message or anyone's message in a group (admin required) */
    delete: WAMessageKey;
} | {
    disappearingMessagesInChat: boolean | number;
};
export type GroupMetadataParticipants = Pick<GroupMetadata, 'participants'>;
type MinimalRelayOptions = {
    /** override the message ID with a custom provided string */
    messageId?: string;
    /** should we use group metadata cache, or fetch afresh from the server; default assumed to be "true" */
    useCachedGroupMetadata?: boolean;
};
export type MessageRelayOptions = MinimalRelayOptions & {
    /** only send to a specific participant; used when a message decryption fails for a single user */
    participant?: {
        jid: string;
        count: number;
    };
    /** additional attributes to add to the WA binary node */
    additionalAttributes?: {
        [_: string]: string;
    };
    additionalNodes?: BinaryNode[];
    /** should we use the devices cache, or fetch afresh from the server; default assumed to be "true" */
    useUserDevicesCache?: boolean;
    /** jid list of participants for status@broadcast */
    statusJidList?: string[];
    newsletter?: boolean;
};
export type MiscMessageGenerationOptions = MinimalRelayOptions & {
    /** optional, if you want to manually set the timestamp of the message */
    timestamp?: Date;
    /** the message you want to quote */
    quoted?: WAMessage;
    /** disappearing messages settings */
    ephemeralExpiration?: number | string;
    /** timeout for media upload to WA server */
    mediaUploadTimeoutMs?: number;
    /** jid list of participants for status@broadcast */
    statusJidList?: string[];
    /** backgroundcolor for status */
    backgroundColor?: string;
    /** font type for status */
    font?: number;
    /** if it is broadcast */
    broadcast?: boolean;
    newsletter?: boolean;
    additionalNodes?: BinaryNode[];
};
export type MessageGenerationOptionsFromContent = MiscMessageGenerationOptions & {
    userJid: string;
};
export type WAMediaUploadFunctionOpts = {
    fileEncSha256B64: string;
    mediaType: MediaType;
    newsletter?: boolean;
    timeoutMs?: number;
};
export type WAMediaUploadFunction = (readStream: Readable | Buffer, opts: WAMediaUploadFunctionOpts) => Promise<{
    mediaUrl: string;
    directPath: string;
    handle?: string;
}>;
export type MediaGenerationOptions = {
    logger?: ILogger;
    mediaTypeOverride?: MediaType;
    upload: WAMediaUploadFunction;
    /** cache media so it does not have to be uploaded again */
    mediaCache?: CacheStore;
    mediaUploadTimeoutMs?: number;
    options?: AxiosRequestConfig;
    backgroundColor?: string;
    font?: number;
    /** The message is for newsletter? */
    newsletter?: boolean;
};
export type MessageContentGenerationOptions = MediaGenerationOptions & {
    getUrlInfo?: (text: string) => Promise<WAUrlInfo | undefined>;
    getProfilePicUrl?: (jid: string, type: 'image' | 'preview') => Promise<string | undefined>;
};
export type MessageGenerationOptions = MessageContentGenerationOptions & MessageGenerationOptionsFromContent;
/**
 * Type of message upsert
 * 1. notify => notify the user, this message was just received
 * 2. append => append the message to the chat history, no notification required
 */
export type MessageUpsertType = 'append' | 'notify';
export type MessageUserReceipt = proto.IUserReceipt;
export type WAMessageUpdate = {
    update: Partial<WAMessage>;
    key: proto.IMessageKey;
};
export type WAMessageCursor = {
    before: WAMessageKey | undefined;
} | {
    after: WAMessageKey | undefined;
};
export type MessageUserReceiptUpdate = {
    key: proto.IMessageKey;
    receipt: MessageUserReceipt;
};
export type MediaDecryptionKeyInfo = {
    iv: Buffer;
    cipherKey: Buffer;
    macKey?: Buffer;
};
export type MinimalMessage = Pick<proto.IWebMessageInfo, 'key' | 'messageTimestamp'>;