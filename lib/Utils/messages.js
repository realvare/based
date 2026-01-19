"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearCache = exports.getCacheStats = exports.assertMediaContent = exports.downloadMediaMessage = exports.aggregateMessageKeysNotFromMe = exports.updateMessageWithPollUpdate = exports.updateMessageWithReaction = exports.updateMessageWithReceipt = exports.getDevice = exports.extractMessageContent = exports.normalizeMessageContent = exports.getContentType = exports.generateWAMessage = exports.generateWAMessageFromContent = exports.generateWAMessageContent = exports.generateForwardMessageContent = exports.prepareDisappearingMessageSettingContent = exports.prepareWAMessageMedia = exports.generateLinkPreviewIfRequired = exports.extractUrlFromText = void 0;
exports.getAggregateVotesInPollMessage = getAggregateVotesInPollMessage;
const boom_1 = require("@hapi/boom");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const Types_1 = require("../Types");
const WABinary_1 = require("../WABinary");
const crypto_2 = require("./crypto");
const generics_1 = require("./generics");
const messages_media_1 = require("./messages-media");
const MIMETYPE_MAP = {
    image: 'image/jpeg',
    video: 'video/mp4',
    document: 'application/pdf',
    audio: 'audio/ogg; codecs=opus',
    sticker: 'image/webp',
    'product-catalog-image': 'image/jpeg',
};
const MessageTypeProto = {
    'image': Types_1.WAProto.Message.ImageMessage,
    'video': Types_1.WAProto.Message.VideoMessage,
    'audio': Types_1.WAProto.Message.AudioMessage,
    'sticker': Types_1.WAProto.Message.StickerMessage,
    'document': Types_1.WAProto.Message.DocumentMessage,
};
const ButtonType = WAProto_1.proto.Message.ButtonsMessage.HeaderType;
/**
 * Uses a regex to test whether the string contains a URL, and returns the URL if it does.
 * @param text eg. hello https://google.com
 * @returns the URL, eg. https://google.com
 */
const extractUrlFromText = (text) => { var _a; return (_a = text.match(Defaults_1.URL_REGEX)) === null || _a === void 0 ? void 0 : _a[0]; };
exports.extractUrlFromText = extractUrlFromText;
const generateLinkPreviewIfRequired = async (text, getUrlInfo, logger) => {
    const url = (0, exports.extractUrlFromText)(text);
    if (!!getUrlInfo && url) {
        try {
            const urlInfo = await getUrlInfo(url);
            return urlInfo;
        }
        catch (error) { // ignore if fails
            logger === null || logger === void 0 ? void 0 : logger.warn({ trace: error.stack }, 'url generation failed');
        }
    }
};
exports.generateLinkPreviewIfRequired = generateLinkPreviewIfRequired;
const assertColor = async (color) => {
    let assertedColor;
    if (typeof color === 'number') {
        assertedColor = color > 0 ? color : 0xffffffff + Number(color) + 1;
        return assertedColor;
    }
    else {
        let hex = color.trim().replace('#', '');
        if (hex.length <= 6) {
            hex = 'FF' + hex.padStart(6, '0');
        }
        assertedColor = parseInt(hex, 16);
        return assertedColor;
    }
};
const prepareWAMessageMedia = async (message, options) => {
    const logger = options.logger;
    let mediaType;
    for (const key of Defaults_1.MEDIA_KEYS) {
        if (key in message) {
            mediaType = key;
        }
    }
    if (!mediaType) {
        throw new boom_1.Boom('Invalid media type', { statusCode: 400 });
    }
    const uploadData = {
        ...message,
        media: message[mediaType]
    };
    delete uploadData[mediaType];
    // check if cacheable + generate cache key
    const cacheableKey = typeof uploadData.media === 'object' &&
        ('url' in uploadData.media) &&
        !!uploadData.media.url &&
        !!options.mediaCache && (
    // generate the key
    mediaType + ':' + uploadData.media.url.toString());
    if (mediaType === 'document' && !uploadData.fileName) {
        uploadData.fileName = 'file';
    }
    if (!uploadData.mimetype) {
        uploadData.mimetype = MIMETYPE_MAP[mediaType];
    }
    // check for cache hit
    if (cacheableKey) {
        const mediaBuff = options.mediaCache.get(cacheableKey);
        if (mediaBuff) {
            logger === null || logger === void 0 ? void 0 : logger.debug({ cacheableKey }, 'got media cache hit');
            const obj = Types_1.WAProto.Message.decode(mediaBuff);
            const key = `${mediaType}Message`;
            Object.assign(obj[key], { ...uploadData, media: undefined });
            return obj;
        }
    }
    const requiresDurationComputation = mediaType === 'audio' && typeof uploadData.seconds === 'undefined';
    const requiresThumbnailComputation = (mediaType === 'image' || mediaType === 'video') &&
        (typeof uploadData['jpegThumbnail'] === 'undefined');
    const requiresWaveformProcessing = mediaType === 'audio' && uploadData.ptt === true;
    const requiresAudioBackground = options.backgroundColor && mediaType === 'audio' && uploadData.ptt === true;
    const requiresOriginalForSomeProcessing = requiresDurationComputation || requiresThumbnailComputation;
    const { mediaKey, encWriteStream, bodyPath, fileEncSha256, fileSha256, fileLength, didSaveToTmpPath, } = await (options.newsletter ? messages_media_1.prepareStream : messages_media_1.encryptedStream)(uploadData.media, options.mediaTypeOverride || mediaType, {
        logger,
        saveOriginalFileIfRequired: requiresOriginalForSomeProcessing,
        opts: options.options
    });
    const fileEncSha256B64 = (options.newsletter ? fileSha256 : fileEncSha256 !== null && fileEncSha256 !== void 0 ? fileEncSha256 : fileSha256).toString('base64');
    const [{ mediaUrl, directPath, handle }] = await Promise.all([
        (async () => {
            const result = await options.upload(encWriteStream, { fileEncSha256B64, mediaType, timeoutMs: options.mediaUploadTimeoutMs });
            logger === null || logger === void 0 ? void 0 : logger.debug({ mediaType, cacheableKey }, 'uploaded media');
            return result;
        })(),
        (async () => {
            try {
                if (requiresThumbnailComputation) {
                    const { thumbnail, originalImageDimensions } = await (0, messages_media_1.generateThumbnail)(bodyPath, mediaType, options);
                    uploadData.jpegThumbnail = thumbnail;
                    if (!uploadData.width && originalImageDimensions) {
                        uploadData.width = originalImageDimensions.width;
                        uploadData.height = originalImageDimensions.height;
                        logger === null || logger === void 0 ? void 0 : logger.debug('set dimensions');
                    }
                    logger === null || logger === void 0 ? void 0 : logger.debug('generated thumbnail');
                }
                if (requiresDurationComputation) {
                    uploadData.seconds = await (0, messages_media_1.getAudioDuration)(bodyPath);
                    logger === null || logger === void 0 ? void 0 : logger.debug('computed audio duration');
                }
                if (requiresWaveformProcessing) {
                    uploadData.waveform = await (0, messages_media_1.getAudioWaveform)(bodyPath, logger);
                    logger === null || logger === void 0 ? void 0 : logger.debug('processed waveform');
                }
                if (requiresAudioBackground) {
                    uploadData.backgroundArgb = await assertColor(options.backgroundColor);
                    logger === null || logger === void 0 ? void 0 : logger.debug('computed backgroundColor audio status');
                }
            }
            catch (error) {
                logger === null || logger === void 0 ? void 0 : logger.warn({ trace: error.stack }, 'failed to obtain extra info');
            }
        })(),
    ])
        .finally(async () => {
        if (!Buffer.isBuffer(encWriteStream)) {
            encWriteStream.destroy();
        }
        // remove tmp files
        if (didSaveToTmpPath && bodyPath) {
            try {
                await fs_1.promises.access(bodyPath);
                await fs_1.promises.unlink(bodyPath);
                logger === null || logger === void 0 ? void 0 : logger.debug('removed tmp file');
            }
            catch (error) {
                logger === null || logger === void 0 ? void 0 : logger.warn('failed to remove tmp file');
            }
        }
    });
    const obj = Types_1.WAProto.Message.fromObject({
        [`${mediaType}Message`]: MessageTypeProto[mediaType].fromObject({
            url: handle ? undefined : mediaUrl,
            directPath,
            mediaKey: mediaKey,
            fileEncSha256: fileEncSha256,
            fileSha256,
            fileLength,
            mediaKeyTimestamp: handle ? undefined : (0, generics_1.unixTimestampSeconds)(),
            ...uploadData,
            media: undefined
        })
    });
    if (uploadData.ptv) {
        obj.ptvMessage = obj.videoMessage;
        delete obj.videoMessage;
    }
    if (cacheableKey) {
        logger === null || logger === void 0 ? void 0 : logger.debug({ cacheableKey }, 'set cache');
        options.mediaCache.set(cacheableKey, Types_1.WAProto.Message.encode(obj).finish());
    }
    return obj;
};
exports.prepareWAMessageMedia = prepareWAMessageMedia;
const prepareDisappearingMessageSettingContent = (ephemeralExpiration) => {
    ephemeralExpiration = ephemeralExpiration || 0;
    const content = {
        ephemeralMessage: {
            message: {
                protocolMessage: {
                    type: Types_1.WAProto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
                    ephemeralExpiration
                }
            }
        }
    };
    return Types_1.WAProto.Message.fromObject(content);
};
exports.prepareDisappearingMessageSettingContent = prepareDisappearingMessageSettingContent;
/**
 * Generate forwarded message content like WA does
 * @param message the message to forward
 * @param options.forceForward will show the message as forwarded even if it is from you
 */
const generateForwardMessageContent = (message, forceForward) => {
    var _a;
    let content = message.message;
    if (!content) {
        throw new boom_1.Boom('no content in message', { statusCode: 400 });
    }
    // hacky copy
    content = (0, exports.normalizeMessageContent)(content);
    content = WAProto_1.proto.Message.decode(WAProto_1.proto.Message.encode(content).finish());
    let key = Object.keys(content)[0];
    let score = ((_a = content[key].contextInfo) === null || _a === void 0 ? void 0 : _a.forwardingScore) || 0;
    score += message.key.fromMe && !forceForward ? 0 : 1;
    if (key === 'conversation') {
        content.extendedTextMessage = { text: content[key] };
        delete content.conversation;
        key = 'extendedTextMessage';
    }
    if (score > 0) {
        content[key].contextInfo = { forwardingScore: score, isForwarded: true };
    }
    else {
        content[key].contextInfo = {};
    }
    return content;
};
exports.generateForwardMessageContent = generateForwardMessageContent;
const generateWAMessageContent = async (message, options) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    var _p, _q;

    // Cross-platform externalAdReply thumbnail handling
    const fixupExternalAdReplyThumb = async (externalAdReply) => {
        const thumbUrl = externalAdReply.originalImageUrl || externalAdReply.thumbnailUrl;
        const currentThumb = externalAdReply.thumbnail;
        const currentThumbLen = currentThumb && typeof currentThumb.length === 'number' ? currentThumb.length : 0;
        if (thumbUrl && (!currentThumb || currentThumbLen < 2000)) {
            try {
                const stream = await (0, messages_media_1.getHttpStream)(thumbUrl, {
                    timeout: 8000,
                    headers: {
                        'User-Agent': 'WhatsApp/2.23.20.15 iOS/16.0 Device/iPhone'
                    }
                });
                const { buffer } = await (0, messages_media_1.extractImageThumb)(stream, 512, 80);
                externalAdReply.thumbnail = buffer;
            }
            catch (error) {
                options.logger?.warn('Failed to generate externalAdReply thumbnail for cross-platform compatibility:', error.message);
            }
        }
        if (externalAdReply.renderLargerThumbnail === undefined) {
            externalAdReply.renderLargerThumbnail = true;
        }
        return externalAdReply;
    };
    if (message.contextInfo?.externalAdReply) {
        message.contextInfo.externalAdReply = await fixupExternalAdReplyThumb(message.contextInfo.externalAdReply);
    }
    if (message.externalAdReply) {
        message.externalAdReply = await fixupExternalAdReplyThumb(message.externalAdReply);
    }

    let m = {};
    if ('text' in message) {
        const extContent = { text: message.text };
        let urlInfo = message.linkPreview;
        if (urlInfo === true) {
            urlInfo = await (0, exports.generateLinkPreviewIfRequired)(message.text, options.getUrlInfo, options.logger);
        }
        if (urlInfo && typeof urlInfo === 'object') {
            extContent.matchedText = urlInfo['matched-text'];
            extContent.jpegThumbnail = urlInfo.jpegThumbnail;
            extContent.description = urlInfo.description;
            extContent.title = urlInfo.title;
            extContent.previewType = 0;
            const img = urlInfo.highQualityThumbnail;
            if (img) {
                extContent.thumbnailDirectPath = img.directPath;
                extContent.mediaKey = img.mediaKey;
                extContent.mediaKeyTimestamp = img.mediaKeyTimestamp;
                extContent.thumbnailWidth = img.width;
                extContent.thumbnailHeight = img.height;
                extContent.thumbnailSha256 = img.fileSha256;
                extContent.thumbnailEncSha256 = img.fileEncSha256;
            }
        }
        if (options.backgroundColor) {
            extContent.backgroundArgb = await assertColor(options.backgroundColor);
        }
        if (options.font) {
            extContent.font = options.font;
        }
        m.extendedTextMessage = extContent;
    }
    else if ('contacts' in message) {
        const contactLen = message.contacts.contacts.length;
        if (!contactLen) {
            throw new boom_1.Boom('require atleast 1 contact', { statusCode: 400 });
        }
        if (contactLen === 1) {
            m.contactMessage = Types_1.WAProto.Message.ContactMessage.fromObject(message.contacts.contacts[0]);
        }
        else {
            m.contactsArrayMessage = Types_1.WAProto.Message.ContactsArrayMessage.fromObject(message.contacts);
        }
    }
    else if ('location' in message) {
        m.locationMessage = Types_1.WAProto.Message.LocationMessage.fromObject(message.location);
    }
    else if ('liveLocation' in message) {
        m.liveLocationMessage = Types_1.WAProto.Message.LiveLocationMessage.fromObject(message.liveLocation);
    }
    else if ('react' in message) {
        if (!message.react.senderTimestampMs) {
            message.react.senderTimestampMs = Date.now();
        }
        m.reactionMessage = Types_1.WAProto.Message.ReactionMessage.fromObject(message.react);
    }
    else if ('delete' in message) {
        m.protocolMessage = {
            key: message.delete,
            type: Types_1.WAProto.Message.ProtocolMessage.Type.REVOKE
        };
    }
    else if ('forward' in message) {
        m = (0, exports.generateForwardMessageContent)(message.forward, message.force);
    }
    else if ('disappearingMessagesInChat' in message) {
        const exp = typeof message.disappearingMessagesInChat === 'boolean' ?
            (message.disappearingMessagesInChat ? Defaults_1.WA_DEFAULT_EPHEMERAL : 0) :
            message.disappearingMessagesInChat;
        m = (0, exports.prepareDisappearingMessageSettingContent)(exp);
    }
    else if ('groupInvite' in message) {
        m.groupInviteMessage = {};
        m.groupInviteMessage.inviteCode = message.groupInvite.inviteCode;
        m.groupInviteMessage.inviteExpiration = message.groupInvite.inviteExpiration;
        m.groupInviteMessage.caption = message.groupInvite.text;
        m.groupInviteMessage.groupJid = message.groupInvite.jid;
        m.groupInviteMessage.groupName = message.groupInvite.subject;
        
        // Get group metadata to obtain disappearing mode and other group info
        if (options.groupMetadata) {
            try {
                const groupMetadata = await options.groupMetadata(message.groupInvite.jid);
                if (groupMetadata) {
                    // Add disappearing mode info if available
                    if (groupMetadata.ephemeralDuration !== undefined) {
                        m.groupInviteMessage.ephemeralDuration = groupMetadata.ephemeralDuration;
                    }
                    // Add group subject from metadata if not provided in message
                    if (!m.groupInviteMessage.groupName && groupMetadata.subject) {
                        m.groupInviteMessage.groupName = groupMetadata.subject;
                    }
                    // Add group participant count
                    if (groupMetadata.participants) {
                        m.groupInviteMessage.groupSize = groupMetadata.participants.length;
                    }
                }
            } catch (error) {
                options.logger?.debug({ error, jid: message.groupInvite.jid }, 'Failed to fetch group metadata for invite');
            }
        }
        
        // Handle profile picture with caching
        if (options.getProfilePicUrl) {
            const cacheKey = `group_pfp:${message.groupInvite.jid}`;
            
            // Check cache first if available
            if (options.cache && options.cache.get) {
                const cachedPfp = options.cache.get(cacheKey);
                if (cachedPfp) {
                    m.groupInviteMessage.jpegThumbnail = cachedPfp;
                }
            }
            
            // Fetch if not in cache
            if (!m.groupInviteMessage.jpegThumbnail) {
                try {
                    const pfpUrl = await options.getProfilePicUrl(message.groupInvite.jid, 'preview');
                    if (pfpUrl) {
                        const resp = await axios_1.default.get(pfpUrl, { 
                            responseType: 'arraybuffer',
                            timeout: 5000,
                            headers: {
                                'User-Agent': 'WhatsApp/2.23.20.15 iOS/16.0 Device/iPhone'
                            }
                        });
                        if (resp.status === 200) {
                            m.groupInviteMessage.jpegThumbnail = resp.data;
                            
                            // Cache the result if cache is available
                            if (options.cache && options.cache.set) {
                                options.cache.set(cacheKey, resp.data, 3600); // Cache for 1 hour
                            }
                        }
                    }
                } catch (error) {
                    options.logger?.debug({ error, jid: message.groupInvite.jid }, 'Failed to fetch group profile picture');
                }
            }
        }
    }
    else if ('pin' in message) {
        const pinData = typeof message.pin === 'object' ? message.pin : { key: message.pin };
        // Map type: 1 = PIN_FOR_ALL, 2 = UNPIN_FOR_ALL
        const pinType = pinData.type !== undefined ? pinData.type : (message.type !== undefined ? message.type : WAProto_1.proto.Message.PinInChatMessage.Type.PIN_FOR_ALL);
        m.pinInChatMessage = {
            key: pinData.key,
            type: pinType,
            senderTimestampMs: Date.now()
        };
        // Add messageContextInfo only for PIN (type 1), not for UNPIN (type 2)
        if (pinType === WAProto_1.proto.Message.PinInChatMessage.Type.PIN_FOR_ALL) {
            m.messageContextInfo = {
                messageAddOnDurationInSecs: pinData.time || message.time || 86400, // Default 24 hours
                messageAddOnExpiryType: WAProto_1.proto.MessageContextInfo.MessageAddonExpiryType.STATIC
            };
        }
    }
    else if ('keep' in message) {
        m.keepInChatMessage = {};
        m.keepInChatMessage.key = message.keep;
        m.keepInChatMessage.keepType = message.type;
        m.keepInChatMessage.timestampMs = Date.now();
    }
    else if ('call' in message) {
        const call = message.call;
        if (call && typeof call === 'object' && (
            'callKey' in call
                || 'conversionSource' in call
                || 'conversionData' in call
                || 'conversionDelaySeconds' in call
                || 'ctwaSignals' in call
                || 'ctwaPayload' in call
                || 'nativeFlowCallButtonPayload' in call
                || 'deeplinkPayload' in call
        )) {
            m.call = WAProto_1.proto.Message.Call.fromObject(call);
        }
        else {
            m = {
                scheduledCallCreationMessage: {
                    scheduledTimestampMs: (_a = call === null || call === void 0 ? void 0 : call.time) !== null && _a !== void 0 ? _a : Date.now(),
                    callType: (_b = call === null || call === void 0 ? void 0 : call.type) !== null && _b !== void 0 ? _b : 1,
                    title: call === null || call === void 0 ? void 0 : call.title
                }
            };
        }
    }
    else if ('paymentInvite' in message) {
        m.paymentInviteMessage = {
            serviceType: message.paymentInvite.type,
            expiryTimestamp: message.paymentInvite.expiry
        };
    }
    else if ('buttonReply' in message) {
        switch (message.type) {
            case 'template':
                m.templateButtonReplyMessage = {
                    selectedDisplayText: message.buttonReply.displayText,
                    selectedId: message.buttonReply.id,
                    selectedIndex: message.buttonReply.index,
                    selectedCarouselCardIndex: message.buttonReply.carouselCardIndex
                };
                break;
            case 'plain':
                m.buttonsResponseMessage = {
                    selectedButtonId: message.buttonReply.id,
                    selectedDisplayText: message.buttonReply.displayText,
                    type: WAProto_1.proto.Message.ButtonsResponseMessage.Type.DISPLAY_TEXT,
                };
                break;
        }
    }
    else if ('ptv' in message && message.ptv) {
        const { videoMessage } = await (0, exports.prepareWAMessageMedia)({ video: message.video }, options);
        m.ptvMessage = videoMessage;
    }
    else if ('product' in message) {
        const { imageMessage } = await (0, exports.prepareWAMessageMedia)({ image: message.product.productImage }, options);
        m.productMessage = Types_1.WAProto.Message.ProductMessage.fromObject({
            ...message,
            product: {
                ...message.product,
                productImage: imageMessage,
            }
        });
    }
    else if ('order' in message) {
        m.orderMessage = Types_1.WAProto.Message.OrderMessage.fromObject({
            orderId: message.order.id,
            thumbnail: message.order.thumbnail,
            itemCount: message.order.itemCount,
            status: message.order.status,
            surface: message.order.surface,
            orderTitle: message.order.title,
            message: message.order.text,
            sellerJid: message.order.seller,
            token: message.order.token,
            totalAmount1000: message.order.amount,
            totalCurrencyCode: message.order.currency
        });
    }
    else if ('listReply' in message) {
        m.listResponseMessage = { ...message.listReply };
    }
    else if ('poll' in message) {
        (_p = message.poll).selectableCount || (_p.selectableCount = 0);
        (_q = message.poll).toAnnouncementGroup || (_q.toAnnouncementGroup = false);
        if (!Array.isArray(message.poll.values)) {
            throw new boom_1.Boom('Invalid poll values', { statusCode: 400 });
        }
        if (message.poll.selectableCount < 0
            || message.poll.selectableCount > message.poll.values.length) {
            throw new boom_1.Boom(`poll.selectableCount in poll should be >= 0 and <= ${message.poll.values.length}`, { statusCode: 400 });
        }
        m.messageContextInfo = {
            // encKey
            messageSecret: message.poll.messageSecret || (0, crypto_1.randomBytes)(32),
        };
        const pollCreationMessage = {
            name: message.poll.name,
            selectableOptionsCount: message.poll.selectableCount,
            options: message.poll.values.map(optionName => ({ optionName })),
        };
        if (message.poll.toAnnouncementGroup) {
            // poll v2 is for community announcement groups (single select and multiple)
            m.pollCreationMessageV2 = pollCreationMessage;
        }
        else {
            if (message.poll.selectableCount === 1) {
                // poll v3 is for single select polls
                m.pollCreationMessageV3 = pollCreationMessage;
            }
            else {
                // poll for multiple choice polls
                m.pollCreationMessage = pollCreationMessage;
            }
        }
    }
    else if ('pollResultSnapshotV3' in message && !!message.pollResultSnapshotV3) {
        m.pollResultSnapshotMessageV3 = {
            pollCreationMessageKey: message.pollResultSnapshotV3.pollCreationMessageKey,
            pollResult: message.pollResultSnapshotV3.pollResult,
            selectedOptions: message.pollResultSnapshotV3.selectedOptions,
            contextInfo: message.pollResultSnapshotV3.contextInfo,
            pollType: message.pollResultSnapshotV3.pollType
        };
    }
    else if ('pollV4' in message) {
        const pollCreationMessage = {
            name: message.pollV4.name,
            selectableOptionsCount: message.pollV4.selectableCount,
            options: message.pollV4.values.map(optionName => ({ optionName })),
            pollType: message.pollV4.pollType
        };
        m.pollCreationMessageV4 = pollCreationMessage;
    }
    else if ('pollV5' in message) {
        const pollCreationMessage = {
            name: message.pollV5.name,
            selectableOptionsCount: message.pollV5.selectableCount,
            options: message.pollV5.values.map(optionName => ({ optionName })),
            pollType: message.pollV5.pollType
        };
        m.pollCreationMessageV5 = pollCreationMessage;
    }
    else if ('event' in message) {
        m.messageContextInfo = {
            messageSecret: message.event.messageSecret || (0, crypto_1.randomBytes)(32),
        };
        m.eventMessage = { ...message.event };
    }
    else if ('comment' in message) {
        m.commentMessage = {
            message: message.comment.message,
            targetMessageKey: message.comment.targetMessageKey
        };
    }
    else if ('question' in message) {
        m.questionMessage = {
            text: message.question.text,
            contextInfo: message.question.contextInfo
        };
    }
    else if ('questionResponse' in message) {
        m.questionResponseMessage = {
            key: message.questionResponse.key,
            text: message.questionResponse.text
        };
    }
    else if ('statusQuestionAnswer' in message) {
        m.statusQuestionAnswerMessage = {
            key: message.statusQuestionAnswer.key,
            text: message.statusQuestionAnswer.text
        };
    }
    else if ('statusQuoted' in message) {
        m.statusQuotedMessage = {
            type: message.statusQuoted.type,
            text: message.statusQuoted.text,
            thumbnail: message.statusQuoted.thumbnail,
            originalStatusId: message.statusQuoted.originalStatusId
        };
    }
    else if ('statusStickerInteraction' in message) {
        m.statusStickerInteractionMessage = {
            key: message.statusStickerInteraction.key,
            stickerKey: message.statusStickerInteraction.stickerKey,
            type: message.statusStickerInteraction.type
        };
    }
    else if ('richResponse' in message) {
        m.richResponseMessage = WAProto_1.proto.AIRichResponseMessage.fromObject({
            messageType: message.richResponse.messageType !== undefined ? message.richResponse.messageType : 1, // AI_RICH_RESPONSE_TYPE_STANDARD
            submessages: message.richResponse.submessages || [],
            unifiedResponse: message.richResponse.unifiedResponse,
            contextInfo: message.richResponse.contextInfo
        });
    }
    else if ('eventResponse' in message && !!message.eventResponse) {
        m.eventResponseMessage = {
            response: message.eventResponse.response, // GOING = 1, NOT_GOING = 2, MAYBE = 3
            timestampMs: message.eventResponse.timestampMs || Date.now(),
            extraGuestCount: message.eventResponse.extraGuestCount
        };
    }
    else if ('statusMention' in message && !!message.statusMention) {
        m.statusMentionMessage = {
            quotedStatus: message.statusMention.quotedStatus
        };
    }
    else if ('groupStatus' in message && !!message.groupStatus) {
        m.groupStatusMessage = message.groupStatus.message;
    }
    else if ('botTask' in message && !!message.botTask) {
        m.botTaskMessage = message.botTask.message;
    }
    else if ('limitSharing' in message && !!message.limitSharing) {
        m.limitSharingMessage = message.limitSharing.message;
    }
    else if ('statusAddYours' in message && !!message.statusAddYours) {
        m.statusAddYours = message.statusAddYours.message;
    }
    else if ('botForwarded' in message && !!message.botForwarded) {
        m.botForwardedMessage = message.botForwarded.message;
    }
    else if ('eventCoverImage' in message && !!message.eventCoverImage) {
        m.eventCoverImage = message.eventCoverImage.message;
    }
    else if ('stickerPack' in message && !!message.stickerPack) {
        const pack = message.stickerPack;
        const stickerPackMessage = {
            name: pack.name,
            publisher: pack.publisher,
            packDescription: pack.description,
            stickerPackId: pack.stickerPackId || (0, crypto_1.randomBytes)(16).toString('hex'),
            stickerPackOrigin: pack.origin || 2 // USER_CREATED = 2
        };
        // Process cover if provided
        if (pack.cover) {
            const coverMedia = await (0, exports.prepareWAMessageMedia)({ image: pack.cover }, options);
            stickerPackMessage.thumbnailDirectPath = coverMedia.imageMessage.directPath;
            stickerPackMessage.thumbnailSha256 = coverMedia.imageMessage.thumbnailSha256;
            stickerPackMessage.thumbnailEncSha256 = coverMedia.imageMessage.thumbnailEncSha256;
            stickerPackMessage.thumbnailHeight = coverMedia.imageMessage.height;
            stickerPackMessage.thumbnailWidth = coverMedia.imageMessage.width;
        }
        // Process stickers
        if (pack.stickers && pack.stickers.length > 0) {
            const processedStickers = await Promise.all(pack.stickers.map(async (sticker) => {
                const stickerMedia = await (0, exports.prepareWAMessageMedia)({ sticker: sticker.sticker }, options);
                return {
                    fileName: sticker.fileName || `sticker_${Date.now()}.webp`,
                    isAnimated: sticker.isAnimated || false,
                    emojis: sticker.emojis || [],
                    accessibilityLabel: sticker.accessibilityLabel,
                    isLottie: sticker.isLottie || false,
                    mimetype: sticker.mimetype || stickerMedia.stickerMessage.mimetype
                };
            }));
            stickerPackMessage.stickers = processedStickers;
            stickerPackMessage.stickerPackSize = processedStickers.length;
        }
        if (pack.caption) {
            stickerPackMessage.caption = pack.caption;
        }
        m.stickerPackMessage = stickerPackMessage;
    }
    else if ('interactiveResponse' in message && !!message.interactiveResponse) {
        const response = message.interactiveResponse;
        const interactiveResponseMessage = {
            body: {
                text: response.body?.text || '',
                format: response.body?.format || 0 // DEFAULT = 0
            }
        };
        if (response.nativeFlowResponse) {
            interactiveResponseMessage.nativeFlowResponseMessage = {
                name: response.nativeFlowResponse.name,
                paramsJson: response.nativeFlowResponse.paramsJson,
                version: response.nativeFlowResponse.version || 1
            };
        }
        if (response.contextInfo) {
            interactiveResponseMessage.contextInfo = response.contextInfo;
        }
        m.interactiveResponseMessage = interactiveResponseMessage;
    }
    else if ('bCall' in message && !!message.bCall) {
        m.bcallMessage = {
            sessionId: message.bCall.sessionId,
            mediaType: message.bCall.mediaType || 0, // UNKNOWN = 0, AUDIO = 1, VIDEO = 2
            masterKey: message.bCall.masterKey,
            caption: message.bCall.caption
        };
    }
    else if ('callLog' in message && !!message.callLog) {
        m.callLogMesssage = {
            isVideo: message.callLog.isVideo || false,
            callOutcome: message.callLog.callOutcome || 0, // CONNECTED = 0
            durationSecs: message.callLog.durationSecs,
            callType: message.callLog.callType || 0, // REGULAR = 0
            participants: message.callLog.participants || []
        };
    }
    else if ('encComment' in message && !!message.encComment) {
        m.encCommentMessage = {
            targetMessageKey: message.encComment.targetMessageKey,
            encPayload: message.encComment.encPayload,
            encIv: message.encComment.encIv
        };
    }
    else if ('encEventResponse' in message && !!message.encEventResponse) {
        m.encEventResponseMessage = {
            eventCreationMessageKey: message.encEventResponse.eventCreationMessageKey,
            encPayload: message.encEventResponse.encPayload,
            encIv: message.encEventResponse.encIv
        };
    }
    else if ('messageHistoryBundle' in message && !!message.messageHistoryBundle) {
        const bundle = message.messageHistoryBundle;
        const bundleMedia = bundle.media ? await (0, exports.prepareWAMessageMedia)({ document: bundle.media }, options) : null;
        m.messageHistoryBundle = {
            mimetype: bundle.mimetype || 'application/octet-stream',
            fileSha256: bundleMedia?.documentMessage?.fileSha256,
            mediaKey: bundleMedia?.documentMessage?.mediaKey,
            fileEncSha256: bundleMedia?.documentMessage?.fileEncSha256,
            directPath: bundleMedia?.documentMessage?.directPath,
            mediaKeyTimestamp: bundleMedia?.documentMessage?.mediaKeyTimestamp,
            contextInfo: bundle.contextInfo,
            messageHistoryMetadata: bundle.messageHistoryMetadata
        };
    }
    else if ('messageHistoryNotice' in message && !!message.messageHistoryNotice) {
        m.messageHistoryNotice = {
            contextInfo: message.messageHistoryNotice.contextInfo,
            messageHistoryMetadata: message.messageHistoryNotice.messageHistoryMetadata
        };
    }
    else if ('inviteFollower' in message && !!message.inviteFollower) {
        m.newsletterFollowerInviteMessageV2 = {
            newsletterJid: message.inviteFollower.newsletterJid,
            newsletterName: message.inviteFollower.newsletterName,
            jpegThumbnail: message.inviteFollower.thumbnail,
            caption: message.inviteFollower.caption,
            contextInfo: message.inviteFollower.contextInfo
        };
    }
    else if ('placeholder' in message && !!message.placeholder) {
        m.placeholderMessage = {
            type: message.placeholder.type || 0 // MASK_LINKED_DEVICES = 0
        };
    }
    else if ('secretEncrypted' in message && !!message.secretEncrypted) {
        m.secretEncryptedMessage = {
            targetMessageKey: message.secretEncrypted.targetMessageKey,
            encPayload: message.secretEncrypted.encPayload,
            encIv: message.secretEncrypted.encIv,
            secretEncType: message.secretEncrypted.secretEncType || 0 // UNKNOWN = 0, EVENT_EDIT = 1, MESSAGE_EDIT = 2
        };
    }
    else if ('statusNotification' in message && !!message.statusNotification) {
        m.statusNotificationMessage = {
            responseMessageKey: message.statusNotification.responseMessageKey,
            originalMessageKey: message.statusNotification.originalMessageKey,
            type: message.statusNotification.type || 0 // UNKNOWN = 0, STATUS_ADD_YOURS = 1, STATUS_RESHARE = 2, STATUS_QUESTION_ANSWER_RESHARE = 3
        };
    }
    else if ('stickerSyncRMR' in message && !!message.stickerSyncRMR) {
        m.stickerSyncRmrMessage = {
            filehash: message.stickerSyncRMR.filehash || [],
            rmrSource: message.stickerSyncRMR.rmrSource,
            requestTimestamp: message.stickerSyncRMR.requestTimestamp || Date.now()
        };
    }
    else if ('inviteAdmin' in message) {
        m.newsletterAdminInviteMessage = {};
        m.newsletterAdminInviteMessage.inviteExpiration = message.inviteAdmin.inviteExpiration;
        m.newsletterAdminInviteMessage.caption = message.inviteAdmin.text;
        m.newsletterAdminInviteMessage.newsletterJid = message.inviteAdmin.jid;
        m.newsletterAdminInviteMessage.newsletterName = message.inviteAdmin.subject;
        m.newsletterAdminInviteMessage.jpegThumbnail = message.inviteAdmin.thumbnail;
    }
    else if ('requestPayment' in message) {
        const reqPayment = message.requestPayment;
        const sticker = reqPayment.sticker ?
            await (0, exports.prepareWAMessageMedia)({ sticker: reqPayment.sticker }, options)
            : null;
        let notes = {};
        if (reqPayment.sticker) {
            notes = {
                stickerMessage: {
                    ...sticker.stickerMessage,
                    contextInfo: reqPayment.contextInfo
                }
            };
        }
        else if (reqPayment.note) {
            notes = {
                extendedTextMessage: {
                    text: reqPayment.note,
                    contextInfo: reqPayment.contextInfo,
                }
            };
        }
        else {
            throw new boom_1.Boom('Invalid media type', { statusCode: 400 });
        }
        m.requestPaymentMessage = Types_1.WAProto.Message.RequestPaymentMessage.fromObject({
            expiryTimestamp: reqPayment.expiryTimestamp || reqPayment.expiry,
            amount1000: reqPayment.amount1000 || reqPayment.amount,
            currencyCodeIso4217: reqPayment.currencyCodeIso4217 || reqPayment.currency,
            requestFrom: reqPayment.requestFrom || reqPayment.from,
            noteMessage: { ...notes },
            background: reqPayment.background,
            // Aggiungi altri parametri se disponibili
            ...reqPayment
        });

        // Pix adaptation for Brazilian payments
        if (reqPayment.currencyCodeIso4217 === 'BRL' && reqPayment.pixKey) {
            // Embed Pix key in note for dynamic requests
            if (!m.requestPaymentMessage.noteMessage.extendedTextMessage) {
                m.requestPaymentMessage.noteMessage = { extendedTextMessage: { text: '' } };
            }
            m.requestPaymentMessage.noteMessage.extendedTextMessage.text += `\nPix Key: ${reqPayment.pixKey}`;
        }
    }
    else if ('sharePhoneNumber' in message) {
        m.protocolMessage = {
            type: WAProto_1.proto.Message.ProtocolMessage.Type.SHARE_PHONE_NUMBER
        };
    }
    else if ('requestPhoneNumber' in message) {
        m.requestPhoneNumberMessage = {};
    }
    else if ('newsletterMessage' in message) {
        m.newsletterMessage = Types_1.WAProto.Message.NewsletterMessage.fromObject(message.newsletterMessage);
    }
    else if ('externalAdReply' in message) {
        // Handle sendNyanCat functionality - external ad reply
        const extAdReply = message.externalAdReply;
        m.extendedTextMessage = {
            text: message.text || '',
            contextInfo: {
                externalAdReply: {
                    title: extAdReply.title,
                    body: extAdReply.body,
                    mediaType: extAdReply.mediaType || 1,
                    thumbnailUrl: extAdReply.thumbnailUrl,
                    thumbnail: extAdReply.thumbnail,
                    sourceUrl: extAdReply.sourceUrl,
                    showAdAttribution: extAdReply.showAdAttribution || false,
                    renderLargerThumbnail: extAdReply.renderLargerThumbnail !== false
                }
            }
        };
    }
    else if ('sendPayment' in message && !!message.sendPayment) {
        const payment = message.sendPayment;
        m.sendPaymentMessage = {
            requestMessageKey: payment.requestMessageKey,
            noteMessage: payment.noteMessage,
            background: payment.background,
            transactionData: payment.transactionData
        };
    }
    else if ('declinePayment' in message && !!message.declinePayment) {
        m.declinePaymentRequestMessage = {
            key: message.declinePayment.key
        };
    }
    else if ('cancelPayment' in message && !!message.cancelPayment) {
        m.cancelPaymentRequestMessage = {
            key: message.cancelPayment.key
        };
    }
    else if ('scheduledCallEdit' in message && !!message.scheduledCallEdit) {
        m.scheduledCallEditMessage = {
            key: message.scheduledCallEdit.key,
            editType: message.scheduledCallEdit.editType || 0 // UNKNOWN = 0, CANCEL = 1
        };
    }
    else if ('pollResultSnapshot' in message && !!message.pollResultSnapshot) {
        m.pollResultSnapshotMessage = {
            name: message.pollResultSnapshot.name,
            pollVotes: message.pollResultSnapshot.pollVotes || [],
            contextInfo: message.pollResultSnapshot.contextInfo,
            pollType: message.pollResultSnapshot.pollType || 0 // POLL = 0, QUIZ = 1
        };
    }
    else if ('pollUpdate' in message && !!message.pollUpdate) {
        m.pollUpdateMessage = {
            pollCreationMessageKey: message.pollUpdate.pollCreationMessageKey,
            vote: message.pollUpdate.vote,
            metadata: message.pollUpdate.metadata,
            senderTimestampMs: message.pollUpdate.senderTimestampMs || Date.now()
        };
    }
    else if ('deviceSent' in message && !!message.deviceSent) {
        const deviceSent = message.deviceSent;
        const innerMessage = await (0, exports.generateWAMessageContent)(deviceSent.message, options);
        m.deviceSentMessage = {
            destinationJid: deviceSent.destinationJid,
            message: innerMessage,
            phash: deviceSent.phash
        };
    }
    else if ('chat' in message && !!message.chat) {
        m.chat = {
            displayName: message.chat.displayName,
            id: message.chat.id
        };
    }
    else if ('payment' in message) {
        // Handle sendPayment functionality
        m.requestPaymentMessage = Types_1.WAProto.Message.RequestPaymentMessage.fromObject({
            currencyCodeIso4217: message.payment.currency || 'EUR',
            amount1000: message.payment.amount1000 || message.payment.amount * 1000,
            requestFrom: message.payment.requestFrom || message.payment.from,
            noteMessage: {
                extendedTextMessage: {
                    text: message.payment.text || message.payment.note || '',
                    contextInfo: message.payment.contextInfo
                }
            },
            expiryTimestamp: message.payment.expiryTimestamp || message.payment.expiry,
            background: message.payment.background
        });
    }
    else if ('comment' in message) {
        m.commentMessage = {
            message: message.comment.message,
            targetMessageKey: message.comment.targetMessageKey
        };
    }
    else if ('question' in message) {
        m.questionMessage = {
            text: message.question.text,
            contextInfo: message.question.contextInfo
        };
    }
    else if ('questionResponse' in message) {
        m.questionResponseMessage = {
            key: message.questionResponse.key,
            text: message.questionResponse.text
        };
    }
    else if ('statusQuestionAnswer' in message) {
        m.statusQuestionAnswerMessage = {
            key: message.statusQuestionAnswer.key,
            text: message.statusQuestionAnswer.text
        };
    }
    else if ('statusQuoted' in message) {
        m.statusQuotedMessage = {
            type: message.statusQuoted.type,
            text: message.statusQuoted.text,
            thumbnail: message.statusQuoted.thumbnail,
            jid: message.statusQuoted.jid,
            originalStatusId: message.statusQuoted.originalStatusId
        };
    }
    else if ('statusStickerInteraction' in message) {
        m.statusStickerInteractionMessage = {
            key: message.statusStickerInteraction.key,
            stickerKey: message.statusStickerInteraction.stickerKey,
            type: message.statusStickerInteraction.type
        };
    }
    else if ('album' in message) {
        const imageMessages = message.album.filter(item => 'image' in item);
        const videoMessages = message.album.filter(item => 'video' in item);
        m.albumMessage = WAProto_1.proto.Message.AlbumMessage.fromObject({
            expectedImageCount: imageMessages.length,
            expectedVideoCount: videoMessages.length,
        });
    }
    else {
        m = await (0, exports.prepareWAMessageMedia)(message, options);
    }
    if ('buttons' in message && !!message.buttons) {
        const buttonsMessage = {
            buttons: message.buttons.map(b => ({ ...b, type: WAProto_1.proto.Message.ButtonsMessage.Button.Type.RESPONSE }))
        };
        if ('text' in message) {
            buttonsMessage.contentText = message.text;
            buttonsMessage.headerType = ButtonType.EMPTY;
        }
        else {
            if ('caption' in message) {
                buttonsMessage.contentText = message.caption;
            }
            const type = Object.keys(m)[0].replace('Message', '').toUpperCase();
            buttonsMessage.headerType = ButtonType[type];
            Object.assign(buttonsMessage, m);
        }
        if ('title' in message && !!message.title) {
            buttonsMessage.text = message.title,
                buttonsMessage.headerType = ButtonType.TEXT;
        }
        if ('footer' in message && !!message.footer) {
            buttonsMessage.footerText = message.footer;
        }
        if ('contextInfo' in message && !!message.contextInfo) {
            buttonsMessage.contextInfo = message.contextInfo;
        }
        if ('mentions' in message && !!message.mentions) {
            buttonsMessage.contextInfo = { mentionedJid: message.mentions };
        }
        m = { buttonsMessage };
    }
                else if ('templateButtons' in message && !!message.templateButtons) {
                    const templateMsg = {
                        hydratedButtons: message.templateButtons
                    };
                    if ('text' in message) {
                        templateMsg.hydratedContentText = message.text;
                    }
                    else if ('caption' in message) {
                        templateMsg.hydratedContentText = message.caption;
                    }
                    if ('footer' in message && !!message.footer) {
                        templateMsg.hydratedFooterText = message.footer;
                    }
                    // Add media to template if present
                    if (m && Object.keys(m).length > 0) {
                        Object.assign(templateMsg, m);
                    }
                    m = {
                        templateMessage: {
                            fourRowTemplate: templateMsg,
                            hydratedTemplate: templateMsg
                        }
                    };
                }
    if ('sections' in message && !!message.sections) {
        const listMessage = {
            sections: message.sections,
            buttonText: message.buttonText,
            title: message.title,
            footerText: message.footer,
            description: message.text,
            listType: WAProto_1.proto.Message.ListMessage.ListType.SINGLE_SELECT
        };
        m = { listMessage };
    }
    if ('interactiveButtons' in message && !!message.interactiveButtons) {
        const interactiveMessage = {
            nativeFlowMessage: Types_1.WAProto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: message.interactiveButtons,
                messageVersion: 1,
            })
        };
        if ('text' in message) {
            interactiveMessage.body = {
                text: message.text
            };
        }
        else if ('caption' in message) {
            interactiveMessage.body = {
                text: message.caption
            };
            interactiveMessage.header = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: !!(message === null || message === void 0 ? void 0 : message.media),
            };
            Object.assign(interactiveMessage.header, m);
        }
        if ('footer' in message && !!message.footer) {
            if (typeof message.footer === 'string') {
                interactiveMessage.footer = {
                    text: message.footer
                };
            } else if (typeof message.footer === 'object' && message.footer.text) {
                interactiveMessage.footer = {
                    text: message.footer.text,
                    hasMediaAttachment: !!message.footer.audio
                };
                if (message.footer.audio) {
                    const audioMedia = await (0, exports.prepareWAMessageMedia)({ audio: message.footer.audio }, options);
                    interactiveMessage.footer.audioMessage = audioMedia.audioMessage;
                }
            }
        }
        if ('title' in message && !!message.title) {
            const headerData = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: !!message.media,
            };
            
            // Process media attachments for interactive buttons
            if (message.media) {
                if (message.media.image) {
                    const mediaMessage = await (0, exports.prepareWAMessageMedia)({ image: message.media.image }, options);
                    if (mediaMessage.imageMessage) {
                        headerData.imageMessage = mediaMessage.imageMessage;
                    }
                }
                else if (message.media.video) {
                    const mediaMessage = await (0, exports.prepareWAMessageMedia)({ video: message.media.video }, options);
                    if (mediaMessage.videoMessage) {
                        headerData.videoMessage = mediaMessage.videoMessage;
                    }
                }
                else if (message.media.document) {
                    const mediaMessage = await (0, exports.prepareWAMessageMedia)({ document: message.media.document }, options);
                    if (mediaMessage.documentMessage) {
                        headerData.documentMessage = mediaMessage.documentMessage;
                    }
                }
            }
            
            interactiveMessage.header = headerData;
            // Support for ProductMessage in header
            if (message.headerProduct) {
                const productMedia = await (0, exports.prepareWAMessageMedia)({ image: message.headerProduct.productImage }, options);
                interactiveMessage.header.productMessage = {
                    product: {
                        ...message.headerProduct,
                        productImage: productMedia.imageMessage
                    }
                };
                interactiveMessage.header.hasMediaAttachment = true;
            } else {
                Object.assign(interactiveMessage.header, m);
            }
        }
        if ('contextInfo' in message && !!message.contextInfo) {
            interactiveMessage.contextInfo = message.contextInfo;
        }
        if ('mentions' in message && !!message.mentions) {
            interactiveMessage.contextInfo = { mentionedJid: message.mentions };
        }
        m = { interactiveMessage };
    }
    if ('shop' in message && !!message.shop) {
        const interactiveMessage = {
            shopStorefrontMessage: Types_1.WAProto.Message.InteractiveMessage.ShopMessage.fromObject({
                surface: message.shop,
                id: message.id
            })
        };
        if ('text' in message) {
            interactiveMessage.body = {
                text: message.text
            };
        }
        else if ('caption' in message) {
            interactiveMessage.body = {
                text: message.caption
            };
            interactiveMessage.header = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: !!(message === null || message === void 0 ? void 0 : message.media),
            };
            Object.assign(interactiveMessage.header, m);
        }
        if ('footer' in message && !!message.footer) {
            interactiveMessage.footer = {
                text: message.footer
            };
        }
        if ('title' in message && !!message.title) {
            interactiveMessage.header = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: !!(message === null || message === void 0 ? void 0 : message.media),
            };
            Object.assign(interactiveMessage.header, m);
        }
        if ('contextInfo' in message && !!message.contextInfo) {
            interactiveMessage.contextInfo = message.contextInfo;
        }
        if ('mentions' in message && !!message.mentions) {
            interactiveMessage.contextInfo = { mentionedJid: message.mentions };
        }
        m = { interactiveMessage };
    }
    else if ('collection' in message && !!message.collection) {
        const interactiveMessage = {
            collectionMessage: Types_1.WAProto.Message.InteractiveMessage.CollectionMessage.fromObject({
                bizJid: message.collection.bizJid,
                id: message.collection.id,
                messageVersion: message.collection.messageVersion || 1
            })
        };
        if ('text' in message) {
            interactiveMessage.body = {
                text: message.text
            };
        }
        if ('footer' in message && !!message.footer) {
            interactiveMessage.footer = {
                text: message.footer
            };
        }
        if ('title' in message && !!message.title) {
            interactiveMessage.header = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: false
            };
        }
        if ('contextInfo' in message && !!message.contextInfo) {
            interactiveMessage.contextInfo = message.contextInfo;
        }
        m = { interactiveMessage };
    }
    else if ('invoice' in message && !!message.invoice) {
        const invoiceData = message.invoice;
        const invoiceMessage = {
            note: invoiceData.note,
            token: invoiceData.token,
            attachmentType: invoiceData.attachmentType || 0 // IMAGE = 0, PDF = 1
        };
        if (invoiceData.attachment) {
            const attachmentMedia = await (0, exports.prepareWAMessageMedia)({ 
                [invoiceData.attachmentType === 1 ? 'document' : 'image']: invoiceData.attachment 
            }, options);
            if (invoiceData.attachmentType === 1) {
                invoiceMessage.attachmentMimetype = attachmentMedia.documentMessage.mimetype;
                invoiceMessage.attachmentMediaKey = attachmentMedia.documentMessage.mediaKey;
                invoiceMessage.attachmentMediaKeyTimestamp = attachmentMedia.documentMessage.mediaKeyTimestamp;
                invoiceMessage.attachmentFileSha256 = attachmentMedia.documentMessage.fileSha256;
                invoiceMessage.attachmentFileEncSha256 = attachmentMedia.documentMessage.fileEncSha256;
                invoiceMessage.attachmentDirectPath = attachmentMedia.documentMessage.directPath;
            } else {
                invoiceMessage.attachmentMimetype = attachmentMedia.imageMessage.mimetype;
                invoiceMessage.attachmentMediaKey = attachmentMedia.imageMessage.mediaKey;
                invoiceMessage.attachmentMediaKeyTimestamp = attachmentMedia.imageMessage.mediaKeyTimestamp;
                invoiceMessage.attachmentFileSha256 = attachmentMedia.imageMessage.fileSha256;
                invoiceMessage.attachmentFileEncSha256 = attachmentMedia.imageMessage.fileEncSha256;
                invoiceMessage.attachmentDirectPath = attachmentMedia.imageMessage.directPath;
                invoiceMessage.attachmentJpegThumbnail = attachmentMedia.imageMessage.jpegThumbnail;
            }
        }
        m = { invoiceMessage };
    }
    if ('cards' in message && !!message.cards && message.cards.length > 0) {
        const carouselCardType = message.carouselCardType || 1; // HSCROLL_CARDS = 1, ALBUM_IMAGE = 2
        const carouselCards = await Promise.all(message.cards.map(async (card) => {
            const cardMessage = {
                header: {
                    title: card.title || '',
                    hasMediaAttachment: !!(card.image || card.video)
                }
            };
            
            // Add body as separate field if present
            if (card.body) {
                cardMessage.body = {
                    text: card.body
                };
            }
            // Handle media attachments
            if (card.image) {
                const mediaMessage = await prepareWAMessageMedia({ image: card.image }, options);
                if (mediaMessage.imageMessage) {
                    cardMessage.header.imageMessage = mediaMessage.imageMessage;
                }
            }
            else if (card.video) {
                const mediaMessage = await prepareWAMessageMedia({ video: card.video }, options);
                if (mediaMessage.videoMessage) {
                    cardMessage.header.videoMessage = mediaMessage.videoMessage;
                }
            }
            // Handle buttons
            if (card.buttons && card.buttons.length > 0) {
                cardMessage.nativeFlowMessage = {
                    buttons: card.buttons.map(button => ({
                        name: button.name,
                        buttonParamsJson: button.buttonParamsJson
                    })),
                    messageVersion: 1,
                };
            }
            // Add footer if present
            if (card.footer) {
                cardMessage.footer = {
                    text: card.footer
                };
            }
            return cardMessage;
        }));
        const interactiveMessage = {
            carouselMessage: Types_1.WAProto.Message.InteractiveMessage.CarouselMessage.fromObject({
                cards: carouselCards,
                messageVersion: 1,
                carouselCardType: carouselCardType
            })
        };
        if ('text' in message) {
            interactiveMessage.body = {
                text: message.text
            };
        }
        if ('footer' in message && !!message.footer) {
            interactiveMessage.footer = {
                text: message.footer
            };
        }
        if ('title' in message && !!message.title) {
            interactiveMessage.header = {
                title: message.title,
                subtitle: message.subtitle,
                hasMediaAttachment: false
            };
        }
        if ('contextInfo' in message && !!message.contextInfo) {
            interactiveMessage.contextInfo = message.contextInfo;
        }
        if ('mentions' in message && !!message.mentions) {
            interactiveMessage.contextInfo = { mentionedJid: message.mentions };
        }
        m = { interactiveMessage };
    }
    // Interactive messages are commonly sent wrapped in a view-once container on MD.
    // This improves client compatibility (avoids "update WhatsApp" / invisible messages on some clients).
    const shouldWrapInteractive = !!(m === null || m === void 0 ? void 0 : m.interactiveMessage);
    const hasViewOnceAlready = !!(m === null || m === void 0 ? void 0 : m.viewOnceMessage) || !!(m === null || m === void 0 ? void 0 : m.viewOnceMessageV2) || !!(m === null || m === void 0 ? void 0 : m.viewOnceMessageV2Extension);
    if ((('viewOnce' in message && !!message.viewOnce) || shouldWrapInteractive) && !hasViewOnceAlready) {
        m = { viewOnceMessageV2: { message: m } };
    }
    if ('mentions' in message && ((_o = message.mentions) === null || _o === void 0 ? void 0 : _o.length)) {
        const [messageType] = Object.keys(m);
        m[messageType].contextInfo = m[messageType] || {};
        m[messageType].contextInfo.mentionedJid = message.mentions;
    }
    if ('edit' in message) {
        m = {
            protocolMessage: {
                key: message.edit,
                editedMessage: m,
                timestampMs: Date.now(),
                type: Types_1.WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT
            }
        };
    }
    if ('contextInfo' in message && !!message.contextInfo) {
        const [messageType] = Object.keys(m);
        m[messageType] = m[messageType] || {};
        m[messageType].contextInfo = {
            ...m[messageType].contextInfo,
            ...message.contextInfo
        };
    }
    return Types_1.WAProto.Message.fromObject(m);
};
exports.generateWAMessageContent = generateWAMessageContent;
const generateWAMessageFromContent = (jid, message, options) => {
    // set timestamp to now
    // if not specified
    if (!options.timestamp) {
        options.timestamp = new Date();
    }
    const innerMessage = (0, exports.normalizeMessageContent)(message);
    const key = (0, exports.getContentType)(innerMessage);
    const timestamp = (0, generics_1.unixTimestampSeconds)(options.timestamp);
    const { quoted, userJid } = options;
    // only set quoted if isn't a newsletter message
    if (quoted && !(0, WABinary_1.isJidNewsletter)(jid)) {
        const participant = quoted.key.fromMe ? userJid : (quoted.participant || quoted.key.participant || quoted.key.remoteJid);
        let quotedMsg = (0, exports.normalizeMessageContent)(quoted.message);
        const msgType = (0, exports.getContentType)(quotedMsg);
        // strip any redundant properties
        if (quotedMsg) {
            quotedMsg = WAProto_1.proto.Message.fromObject({ [msgType]: quotedMsg[msgType] });
            const quotedContent = quotedMsg[msgType];
            if (typeof quotedContent === 'object' && quotedContent && 'contextInfo' in quotedContent) {
                delete quotedContent.contextInfo;
            }
            const contextInfo = innerMessage[key].contextInfo || {};
            contextInfo.participant = (0, WABinary_1.jidNormalizedUser)(participant);
            contextInfo.stanzaId = quoted.key.id;
            contextInfo.quotedMessage = quotedMsg;
            // if a participant is quoted, then it must be a group
            // hence, remoteJid of group must also be entered
            if (jid !== quoted.key.remoteJid) {
                contextInfo.remoteJid = quoted.key.remoteJid;
            }
            innerMessage[key].contextInfo = contextInfo;
        }
    }
    if (
    // if we want to send a disappearing message
    !!(options === null || options === void 0 ? void 0 : options.ephemeralExpiration) &&
        // and it's not a protocol message -- delete, toggle disappear message
        key !== 'protocolMessage' &&
        // already not converted to disappearing message
        key !== 'ephemeralMessage' &&
        // newsletter not accept disappearing messages
        !(0, WABinary_1.isJidNewsletter)(jid)) {
        innerMessage[key].contextInfo = {
            ...(innerMessage[key].contextInfo || {}),
            expiration: options.ephemeralExpiration || Defaults_1.WA_DEFAULT_EPHEMERAL,
            //ephemeralSettingTimestamp: options.ephemeralOptions.eph_setting_ts?.toString()
        };
    }
    message = Types_1.WAProto.Message.fromObject(message);
    const messageJSON = {
        key: {
            remoteJid: jid,
            fromMe: true,
            id: (options === null || options === void 0 ? void 0 : options.messageId) || (0, generics_1.generateMessageIDV2)(),
        },
        message: message,
        messageTimestamp: timestamp,
        messageStubParameters: [],
        participant: (0, WABinary_1.isJidGroup)(jid) || (0, WABinary_1.isJidStatusBroadcast)(jid) ? userJid : undefined,
        status: Types_1.WAMessageStatus.PENDING
    };
    return Types_1.WAProto.WebMessageInfo.fromObject(messageJSON);
};
exports.generateWAMessageFromContent = generateWAMessageFromContent;
const generateWAMessage = async (jid, content, options) => {
    var _a;
    // ensure msg ID is with every log
    options.logger = (_a = options === null || options === void 0 ? void 0 : options.logger) === null || _a === void 0 ? void 0 : _a.child({ msgId: options.messageId });
    return (0, exports.generateWAMessageFromContent)(jid, await (0, exports.generateWAMessageContent)(content, { newsletter: (0, WABinary_1.isJidNewsletter)(jid), ...options }), options);
};
exports.generateWAMessage = generateWAMessage;
/** Get the key to access the true type of content */
const getContentType = (content) => {
    if (content) {
        const keys = Object.keys(content);
        const key = keys.find(k => (k === 'conversation' || k.includes('Message')) && k !== 'senderKeyDistributionMessage');
        return key;
    }
};
exports.getContentType = getContentType;
/**
 * Normalizes ephemeral, view once messages to regular message content
 * Eg. image messages in ephemeral messages, in view once messages etc.
 * @param content
 * @returns
 */
const normalizeMessageContent = (content) => {
    if (!content) {
        return undefined;
    }
    // set max iterations to prevent an infinite loop
    for (let i = 0; i < 5; i++) {
        const inner = getFutureProofMessage(content);
        if (!inner) {
            break;
        }
        content = inner.message;
    }
    return content;
    function getFutureProofMessage(message) {
        return ((message === null || message === void 0 ? void 0 : message.ephemeralMessage)
            || (message === null || message === void 0 ? void 0 : message.viewOnceMessage)
            || (message === null || message === void 0 ? void 0 : message.documentWithCaptionMessage)
            || (message === null || message === void 0 ? void 0 : message.viewOnceMessageV2)
            || (message === null || message === void 0 ? void 0 : message.viewOnceMessageV2Extension)
            || (message === null || message === void 0 ? void 0 : message.editedMessage)
            || (message === null || message === void 0 ? void 0 : message.groupMentionedMessage)
            || (message === null || message === void 0 ? void 0 : message.botInvokeMessage)
            || (message === null || message === void 0 ? void 0 : message.lottieStickerMessage)
            || (message === null || message === void 0 ? void 0 : message.eventCoverImage)
            || (message === null || message === void 0 ? void 0 : message.statusMentionMessage)
            || (message === null || message === void 0 ? void 0 : message.pollCreationOptionImageMessage)
            || (message === null || message === void 0 ? void 0 : message.associatedChildMessage)
            || (message === null || message === void 0 ? void 0 : message.groupStatusMentionMessage)
            || (message === null || message === void 0 ? void 0 : message.pollCreationMessageV4)
            || (message === null || message === void 0 ? void 0 : message.pollCreationMessageV5)
            || (message === null || message === void 0 ? void 0 : message.statusAddYours)
            || (message === null || message === void 0 ? void 0 : message.groupStatusMessage)
            || (message === null || message === void 0 ? void 0 : message.limitSharingMessage)
            || (message === null || message === void 0 ? void 0 : message.botTaskMessage)
            || (message === null || message === void 0 ? void 0 : message.questionMessage)
            || (message === null || message === void 0 ? void 0 : message.groupStatusMessageV2)
            || (message === null || message === void 0 ? void 0 : message.botForwardedMessage));
    }
};
exports.normalizeMessageContent = normalizeMessageContent;
/**
 * Extract the true message content from a message
 * Eg. extracts the inner message from a disappearing message/view once message
 */
const extractMessageContent = (content) => {
    var _a, _b, _c, _d, _e, _f;
    const extractFromTemplateMessage = (msg) => {
        if (msg.imageMessage) {
            return { imageMessage: msg.imageMessage };
        }
        else if (msg.documentMessage) {
            return { documentMessage: msg.documentMessage };
        }
        else if (msg.videoMessage) {
            return { videoMessage: msg.videoMessage };
        }
        else if (msg.locationMessage) {
            return { locationMessage: msg.locationMessage };
        }
        else {
            return {
                conversation: 'contentText' in msg
                    ? msg.contentText
                    : ('hydratedContentText' in msg ? msg.hydratedContentText : '')
            };
        }
    };
    content = (0, exports.normalizeMessageContent)(content);
    if (content === null || content === void 0 ? void 0 : content.buttonsMessage) {
        return extractFromTemplateMessage(content.buttonsMessage);
    }
    if ((_a = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _a === void 0 ? void 0 : _a.hydratedFourRowTemplate) {
        return extractFromTemplateMessage((_b = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _b === void 0 ? void 0 : _b.hydratedFourRowTemplate);
    }
    if ((_c = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _c === void 0 ? void 0 : _c.hydratedTemplate) {
        return extractFromTemplateMessage((_d = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _d === void 0 ? void 0 : _d.hydratedTemplate);
    }
    if ((_e = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _e === void 0 ? void 0 : _e.fourRowTemplate) {
        return extractFromTemplateMessage((_f = content === null || content === void 0 ? void 0 : content.templateMessage) === null || _f === void 0 ? void 0 : _f.fourRowTemplate);
    }
    return content;
};
exports.extractMessageContent = extractMessageContent;
/**
 * Returns the device predicted by message ID
 */
const getDevice = (id) => /^3A.{18}$/.test(id) ? 'ios' :
    /^3E.{20}$/.test(id) ? 'web' :
        /^(.{21}|.{32})$/.test(id) ? 'android' :
            /^(3F|.{18}$)/.test(id) ? 'desktop' :
                'unknown';
exports.getDevice = getDevice;
/** Upserts a receipt in the message */
const updateMessageWithReceipt = (msg, receipt) => {
    msg.userReceipt = msg.userReceipt || [];
    const recp = msg.userReceipt.find(m => m.userJid === receipt.userJid);
    if (recp) {
        Object.assign(recp, receipt);
    }
    else {
        msg.userReceipt.push(receipt);
    }
};
exports.updateMessageWithReceipt = updateMessageWithReceipt;
/** Update the message with a new reaction */
const updateMessageWithReaction = (msg, reaction) => {
    const authorID = (0, generics_1.getKeyAuthor)(reaction.key);
    const reactions = (msg.reactions || [])
        .filter(r => (0, generics_1.getKeyAuthor)(r.key) !== authorID);
    reaction.text = reaction.text || '';
    reactions.push(reaction);
    msg.reactions = reactions;
};
exports.updateMessageWithReaction = updateMessageWithReaction;
/** Update the message with a new poll update */
const updateMessageWithPollUpdate = (msg, update) => {
    var _a, _b;
    const authorID = (0, generics_1.getKeyAuthor)(update.pollUpdateMessageKey);
    const reactions = (msg.pollUpdates || [])
        .filter(r => (0, generics_1.getKeyAuthor)(r.pollUpdateMessageKey) !== authorID);
    if ((_b = (_a = update.vote) === null || _a === void 0 ? void 0 : _a.selectedOptions) === null || _b === void 0 ? void 0 : _b.length) {
        reactions.push(update);
    }
    msg.pollUpdates = reactions;
};
exports.updateMessageWithPollUpdate = updateMessageWithPollUpdate;
/**
 * Aggregates all poll updates in a poll.
 * @param msg the poll creation message
 * @param meId your jid
 * @returns A list of options & their voters
 */
function getAggregateVotesInPollMessage({ message, pollUpdates }, meId) {
    var _a, _b, _c;
    const opts = ((_a = message === null || message === void 0 ? void 0 : message.pollCreationMessage) === null || _a === void 0 ? void 0 : _a.options) || ((_b = message === null || message === void 0 ? void 0 : message.pollCreationMessageV2) === null || _b === void 0 ? void 0 : _b.options) || ((_c = message === null || message === void 0 ? void 0 : message.pollCreationMessageV3) === null || _c === void 0 ? void 0 : _c.options) || [];
    const voteHashMap = opts.reduce((acc, opt) => {
        const hash = (0, crypto_2.sha256)(Buffer.from(opt.optionName || '')).toString();
        acc[hash] = {
            name: opt.optionName || '',
            voters: []
        };
        return acc;
    }, {});
    for (const update of pollUpdates || []) {
        const { vote } = update;
        if (!vote) {
            continue;
        }
        for (const option of vote.selectedOptions || []) {
            const hash = option.toString();
            let data = voteHashMap[hash];
            if (!data) {
                voteHashMap[hash] = {
                    name: 'Unknown',
                    voters: []
                };
                data = voteHashMap[hash];
            }
            voteHashMap[hash].voters.push((0, generics_1.getKeyAuthor)(update.pollUpdateMessageKey, meId));
        }
    }
    return Object.values(voteHashMap);
}
/** Given a list of message keys, aggregates them by chat & sender. Useful for sending read receipts in bulk */
const aggregateMessageKeysNotFromMe = (keys) => {
    const keyMap = {};
    for (const { remoteJid, id, participant, fromMe } of keys) {
        if (!fromMe) {
            const uqKey = `${remoteJid}:${participant || ''}`;
            if (!keyMap[uqKey]) {
                keyMap[uqKey] = {
                    jid: remoteJid,
                    participant: participant,
                    messageIds: []
                };
            }
            keyMap[uqKey].messageIds.push(id);
        }
    }
    return Object.values(keyMap);
};
exports.aggregateMessageKeysNotFromMe = aggregateMessageKeysNotFromMe;
const REUPLOAD_REQUIRED_STATUS = [410, 404];
/**
 * Downloads the given message. Throws an error if it's not a media message
 */
const downloadMediaMessage = async (message, type, options, ctx) => {
    const result = await downloadMsg()
        .catch(async (error) => {
        var _a;
        if (ctx) {
            if (axios_1.default.isAxiosError(error)) {
                // check if the message requires a reupload
                if (REUPLOAD_REQUIRED_STATUS.includes((_a = error.response) === null || _a === void 0 ? void 0 : _a.status)) {
                    ctx.logger.info({ key: message.key }, 'sending reupload media request...');
                    // request reupload
                    message = await ctx.reuploadRequest(message);
                    const result = await downloadMsg();
                    return result;
                }
            }
        }
        throw error;
    });
    return result;
    async function downloadMsg() {
        const mContent = (0, exports.extractMessageContent)(message.message);
        if (!mContent) {
            throw new boom_1.Boom('No message present', { statusCode: 400, data: message });
        }
        const contentType = (0, exports.getContentType)(mContent);
        let mediaType = contentType === null || contentType === void 0 ? void 0 : contentType.replace('Message', '');
        const media = mContent[contentType];
        if (!media || typeof media !== 'object' || (!('url' in media) && !('thumbnailDirectPath' in media))) {
            throw new boom_1.Boom(`"${contentType}" message is not a media message`);
        }
        let download;
        if ('thumbnailDirectPath' in media && !('url' in media)) {
            download = {
                directPath: media.thumbnailDirectPath,
                mediaKey: media.mediaKey
            };
            mediaType = 'thumbnail-link';
        }
        else {
            download = media;
        }
        const stream = await (0, messages_media_1.downloadContentFromMessage)(download, mediaType, options);
        if (type === 'buffer') {
            const bufferArray = [];
            for await (const chunk of stream) {
                bufferArray.push(chunk);
            }
            return Buffer.concat(bufferArray);
        }
        return stream;
    }
};
exports.downloadMediaMessage = downloadMediaMessage;
/** Checks whether the given message is a media message; if it is returns the inner content */
const assertMediaContent = (content) => {
    content = (0, exports.extractMessageContent)(content);
    const mediaContent = (content === null || content === void 0 ? void 0 : content.documentMessage)
        || (content === null || content === void 0 ? void 0 : content.imageMessage)
        || (content === null || content === void 0 ? void 0 : content.videoMessage)
        || (content === null || content === void 0 ? void 0 : content.audioMessage)
        || (content === null || content === void 0 ? void 0 : content.stickerMessage);
    if (!mediaContent) {
        throw new boom_1.Boom('given message is not a media message', { statusCode: 400, data: content });
    }
    return mediaContent;
};
exports.assertMediaContent = assertMediaContent;
const cache_manager_1 = require("./cache-manager");
const performance_config_1 = require("./performance-config");
/**
 * Get cache statistics for monitoring performance
 */
const getCacheStats = () => {
    try {
        const cacheManager = cache_manager_1.default;
        const config = performance_config_1.getPerformanceConfig();
        
        if (!cacheManager || !cacheManager.caches) {
            return {
                lidCache: { size: 0, maxSize: 0, ttl: config.cache.lidCache.ttl },
                jidCache: { size: 0, maxSize: 0, ttl: config.cache.jidCache.ttl }
            };
        }
        
        const lidStats = cacheManager.getStats('lidCache');
        const jidStats = cacheManager.getStats('jidCache');
        
        return {
            lidCache: {
                size: lidStats?.keys || 0,
                maxSize: lidStats?.max || config.cache.lidCache.maxSize || 0,
                ttl: config.cache.lidCache.ttl
            },
            jidCache: {
                size: jidStats?.keys || 0,
                maxSize: jidStats?.max || config.cache.jidCache.maxSize || 0,
                ttl: config.cache.jidCache.ttl
            }
        };
    } catch (error) {
        const config = performance_config_1.getPerformanceConfig();
        return {
            lidCache: { size: 0, maxSize: 0, ttl: config.cache.lidCache.ttl },
            jidCache: { size: 0, maxSize: 0, ttl: config.cache.jidCache.ttl }
        };
    }
};
exports.getCacheStats = getCacheStats;
/**
 * Clear all caches (useful for testing or memory management)
 */
const clearCache = () => {
    try {
        const cacheManager = cache_manager_1.default;
        if (cacheManager && cacheManager.caches) {
            Object.keys(cacheManager.caches).forEach(cacheName => {
                const cache = cacheManager.caches[cacheName];
                if (cache && typeof cache.flushAll === 'function') {
                    cache.flushAll();
                }
            });
        }
    } catch (error) {
        // Silently fail if cache manager is not available
    }
};
exports.clearCache = clearCache;