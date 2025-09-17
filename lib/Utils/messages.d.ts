import { type Transform } from 'stream';
import { proto } from '../../WAProto';
import { ILogger } from './logger';
import { AnyMediaMessageContent, AnyMessageContent, MediaGenerationOptions, MessageContentGenerationOptions, MessageGenerationOptions, MessageGenerationOptionsFromContent, MessageUserReceipt, WAMessage, WAMessageContent, WAProto } from '../Types';
import { MediaDownloadOptions } from './messages-media';
/**
 * Uses a regex to test whether the string contains a URL, and returns the URL if it does.
 * @param text eg. hello https://google.com
 * @returns the URL, eg. https://google.com
 */
export declare const extractUrlFromText: (text: string) => string | undefined;
export declare const generateLinkPreviewIfRequired: (text: string, getUrlInfo: MessageGenerationOptions["getUrlInfo"], logger: MessageGenerationOptions["logger"]) => Promise<import("../Types").WAUrlInfo | undefined>;
export declare const prepareWAMessageMedia: (message: AnyMediaMessageContent, options: MediaGenerationOptions) => Promise<proto.Message>;
export declare const prepareDisappearingMessageSettingContent: (ephemeralExpiration?: number) => proto.Message;
/**
 * Generate forwarded message content like WA does
 * @param message the message to forward
 * @param options.forceForward will show the message as forwarded even if it is from you
 */
export declare const generateForwardMessageContent: (message: WAMessage, forceForward?: boolean) => proto.IMessage;
export declare const generateWAMessageContent: (message: AnyMessageContent, options: MessageContentGenerationOptions) => Promise<proto.Message>;
export declare const generateWAMessageFromContent: (jid: string, message: WAMessageContent, options: MessageGenerationOptionsFromContent) => proto.WebMessageInfo;
export declare const generateWAMessage: (jid: string, content: AnyMessageContent, options: MessageGenerationOptions) => Promise<proto.WebMessageInfo>;
/** Get the key to access the true type of content */
export declare const getContentType: (content: WAProto.IMessage | undefined) => keyof proto.IMessage | undefined;
/**
 * Normalizes ephemeral, view once messages to regular message content
 * Eg. image messages in ephemeral messages, in view once messages etc.
 * @param content
 * @returns
 */
export declare const normalizeMessageContent: (content: WAMessageContent | null | undefined) => WAMessageContent | undefined;
/**
 * Extract the true message content from a message
 * Eg. extracts the inner message from a disappearing message/view once message
 */
export declare const extractMessageContent: (content: WAMessageContent | undefined | null) => WAMessageContent | undefined;
/**
 * Returns the device predicted by message ID
 */
export declare const getDevice: (id: string) => "web" | "unknown" | "android" | "ios" | "desktop";
/** Upserts a receipt in the message */
export declare const updateMessageWithReceipt: (msg: Pick<WAMessage, "userReceipt">, receipt: MessageUserReceipt) => void;
/** Update the message with a new reaction */
export declare const updateMessageWithReaction: (msg: Pick<WAMessage, "reactions">, reaction: proto.IReaction) => void;
/** Update the message with a new poll update */
export declare const updateMessageWithPollUpdate: (msg: Pick<WAMessage, "pollUpdates">, update: proto.IPollUpdate) => void;
type VoteAggregation = {
    name: string;
    voters: string[];
};
/**
 * Aggregates all poll updates in a poll.
 * @param msg the poll creation message
 * @param meId your jid
 * @returns A list of options & their voters
 */
export declare function getAggregateVotesInPollMessage({ message, pollUpdates }: Pick<WAMessage, 'pollUpdates' | 'message'>, meId?: string): VoteAggregation[];
/** Given a list of message keys, aggregates them by chat & sender. Useful for sending read receipts in bulk */
export declare const aggregateMessageKeysNotFromMe: (keys: proto.IMessageKey[]) => {
    jid: string;
    participant: string | undefined;
    messageIds: string[];
}[];
type DownloadMediaMessageContext = {
    reuploadRequest: (msg: WAMessage) => Promise<WAMessage>;
    logger: ILogger;
};
/**
 * Downloads the given message. Throws an error if it's not a media message
 */
export declare const downloadMediaMessage: <Type extends "buffer" | "stream">(message: WAMessage, type: Type, options: MediaDownloadOptions, ctx?: DownloadMediaMessageContext) => Promise<Type extends "buffer" ? Buffer<ArrayBufferLike> : Transform>;
/** Checks whether the given message is a media message; if it is returns the inner content */
export declare const assertMediaContent: (content: proto.IMessage | null | undefined) => proto.Message.IVideoMessage | proto.Message.IImageMessage | proto.Message.IAudioMessage | proto.Message.IDocumentMessage | proto.Message.IStickerMessage;
/** Enhanced interface for sender information with validation and caching */
export interface SenderInfo {
    /** The original JID from the message */
    jid: string;
    /** The converted LID (Local ID) */
    lid: string;
    /** Whether the conversion was successful */
    isValid: boolean;
    /** The extracted user ID */
    user: string;
    /** Timestamp when this info was generated */
    timestamp: number;
    /** Error message if conversion failed */
    error?: string;
}

/** Cache entry interface for internal use */
interface CacheEntry<T> {
    result: T;
    timestamp: number;
}

/** Enhanced JID conversion with caching and error handling */
export declare const toJid: (id: string) => string;

/** Enhanced sender LID extraction with caching, validation and error handling */
export declare const getSenderLid: (msg: WAMessage) => SenderInfo;

/** Cache statistics interface */
export interface CacheStats {
    lidCache: {
        size: number;
        maxSize: number;
        ttl: number;
    };
    jidCache: {
        size: number;
        maxSize: number;
        ttl: number;
    };
}

/** Validation result interface */
export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

/** Get cache statistics for monitoring performance */
export declare const getCacheStats: () => CacheStats;

/** Clear all caches (useful for testing or memory management) */
export declare const clearCache: () => void;

/** Validate JID format and structure */
export declare const validateJid: (jid: string) => ValidationResult;
export {};
