"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMessagesRecvSocket = void 0;
const boom_1 = require("@hapi/boom");
const crypto_1 = require("crypto");
const node_cache_1 = __importDefault(require("@cacheable/node-cache"));
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const Types_1 = require("../Types");
const Utils_1 = require("../Utils");
const performance_config_1 = require("../Utils/performance-config");
const make_mutex_1 = require("../Utils/make-mutex");
const WABinary_1 = require("../WABinary");
const groups_1 = require("./groups");
const messages_send_1 = require("./messages-send");
const makeMessagesRecvSocket = (config) => {
    const { logger, retryRequestDelayMs, maxMsgRetryCount, getMessage, shouldIgnoreJid } = config;
    const sock = (0, messages_send_1.makeMessagesSocket)(config);
    const { ev, authState, ws, processingMutex, signalRepository, query, upsertMessage, resyncAppState, groupMetadata, onUnexpectedError, assertSessions, sendNode, relayMessage, sendReceipt, uploadPreKeys, createParticipantNodes, getUSyncDevices, sendPeerDataOperationMessage, } = sock;
    /** this mutex ensures that each retryRequest will wait for the previous one to finish */
    const retryMutex = (0, make_mutex_1.makeMutex)();
    const msgRetryCache = config.msgRetryCounterCache || new node_cache_1.default({
        stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.MSG_RETRY,
        useClones: false
    });
    const callOfferCache = config.callOfferCache || new node_cache_1.default({
        stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.CALL_OFFER,
        useClones: false
    });
    const placeholderResendCache = config.placeholderResendCache || new node_cache_1.default({
        stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.MSG_RETRY,
        useClones: false
    });
    const notificationDedupCache = new node_cache_1.default({
        stdTTL: 30,
        useClones: false
    });
    const notificationStubDedupCache = new node_cache_1.default({
        stdTTL: 10,
        useClones: false
    });
    const sentMessageCache = new Map();
    const sentMessageCacheMaxSize = 256;
    const getSentMessageCacheKey = (remoteJid, id) => `${remoteJid}:${id}`;
    const getCachedSentMessage = (remoteJid, id) => {
        const cacheKey = getSentMessageCacheKey(remoteJid, id);
        const existing = sentMessageCache.get(cacheKey);
        if (!existing) {
            return undefined;
        }
        sentMessageCache.delete(cacheKey);
        sentMessageCache.set(cacheKey, existing);
        return existing;
    };
    const cacheSentMessage = (remoteJid, id, message) => {
        const cacheKey = getSentMessageCacheKey(remoteJid, id);
        if (sentMessageCache.has(cacheKey)) {
            sentMessageCache.delete(cacheKey);
        }
        sentMessageCache.set(cacheKey, message);
        while (sentMessageCache.size > sentMessageCacheMaxSize) {
            const oldestKey = sentMessageCache.keys().next().value;
            if (!oldestKey) {
                break;
            }
            sentMessageCache.delete(oldestKey);
        }
    };
    let sendActiveReceipts = false;
    const resolveJid = WABinary_1.resolveJid;
    const sendMessageAck = async ({ tag, attrs, content }, errorCode) => {
        const stanza = {
            tag: 'ack',
            attrs: {
                id: attrs.id,
                to: attrs.from,
                class: tag
            }
        };
        if (!!errorCode) {
            stanza.attrs.error = errorCode.toString();
        }
        if (!!attrs.participant) {
            stanza.attrs.participant = attrs.participant;
        }
        if (!!attrs.recipient) {
            stanza.attrs.recipient = attrs.recipient;
        }
        if (!!attrs.type && (tag !== 'message' || (0, WABinary_1.getBinaryNodeChild)({ tag, attrs, content }, 'unavailable') || errorCode !== 0)) {
            stanza.attrs.type = attrs.type;
        }
        if (tag === 'message' && (0, WABinary_1.getBinaryNodeChild)({ tag, attrs, content }, 'unavailable')) {
            stanza.attrs.from = authState.creds.me.id;
        }
        logger.debug({ recv: { tag, attrs }, sent: stanza.attrs }, 'sent ack');
        await sendNode(stanza);
    };
    // Add withAck wrapper for guaranteed acknowledgments so less ban tag ig
    const withAck = (processFn) => async (node) => {
        try {
            await processFn(node);
        } finally {
            // Always send ack even on failure to allow potential retry (not sure bout this tho)
            await sendMessageAck(node);
        }
    };
    const offerCall = async (toJid, isVideo = false) => {
        toJid = resolveJid(toJid);
        const callId = (0, crypto_1.randomBytes)(16).toString('hex').toUpperCase().substring(0, 64);
        const offerContent = [];
        offerContent.push({ tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined });
        offerContent.push({ tag: 'audio', attrs: { enc: 'opus', rate: '8000' }, content: undefined });
        if (isVideo) {
            offerContent.push({
                tag: 'video',
                attrs: {
                    orientation: '0',
                    'screen_width': '1920',
                    'screen_height': '1080',
                    'device_orientation': '0',
                    enc: 'vp8',
                    dec: 'vp8',
                }
            });
        }
        offerContent.push({ tag: 'net', attrs: { medium: '3' }, content: undefined });
        offerContent.push({ tag: 'capability', attrs: { ver: '1' }, content: new Uint8Array([1, 4, 255, 131, 207, 4]) });
        offerContent.push({ tag: 'encopt', attrs: { keygen: '2' }, content: undefined });
        const encKey = (0, crypto_1.randomBytes)(32);
        const devices = (await getUSyncDevices([toJid], true, false)).map(({ user, device }) => (0, WABinary_1.jidEncode)(user, 's.whatsapp.net', device));
        await assertSessions(devices, true);
        const { nodes: destinations, shouldIncludeDeviceIdentity } = await createParticipantNodes(devices, {
            call: {
                callKey: encKey
            }
        });
        offerContent.push({ tag: 'destination', attrs: {}, content: destinations });
        if (shouldIncludeDeviceIdentity) {
            offerContent.push({
                tag: 'device-identity',
                attrs: {},
                content: (0, Utils_1.encodeSignedDeviceIdentity)(authState.creds.account, true)
            });
        }
        const stanza = ({
            tag: 'call',
            attrs: {
                to: toJid,
            },
            content: [{
                    tag: 'offer',
                    attrs: {
                        'call-id': callId,
                        'call-creator': authState.creds.me.id,
                    },
                    content: offerContent,
                }],
        });
        await query(stanza);
        return {
            callId,
            toJid,
            isVideo,
        };
    };
    const rejectCall = async (callId, callFrom) => {
        callFrom = resolveJid(callFrom);
        const stanza = ({
            tag: 'call',
            attrs: {
                from: authState.creds.me.id,
                to: callFrom,
            },
            content: [{
                    tag: 'reject',
                    attrs: {
                        'call-id': callId,
                        'call-creator': callFrom,
                        count: '0',
                    },
                    content: undefined,
                }],
        });
        await query(stanza);
    };
    const sendRetryRequest = async (node, forceIncludeKeys = false) => {
        const { fullMessage } = (0, Utils_1.decodeMessageNode)(node, authState.creds.me.id, authState.creds.me.lid || '');
        const { key: msgKey } = fullMessage;
        const msgId = msgKey.id;
        const key = `${msgId}:${msgKey === null || msgKey === void 0 ? void 0 : msgKey.participant}`;
        let retryCount = msgRetryCache.get(key) || 0;
        if (retryCount >= maxMsgRetryCount) {
            logger.debug({ retryCount, msgId }, 'reached retry limit, clearing');
            msgRetryCache.del(key);
            return;
        }
        retryCount += 1;
        msgRetryCache.set(key, retryCount);
        const { account, signedPreKey, signedIdentityKey: identityKey } = authState.creds;
        if (retryCount === 1) {
            const msgId = await requestPlaceholderResend(msgKey);
            logger.debug(`sendRetryRequest: requested placeholder resend for message ${msgId}`);
        }
        const deviceIdentity = (0, Utils_1.encodeSignedDeviceIdentity)(account, true);
        await authState.keys.transaction(async () => {
            const receipt = {
                tag: 'receipt',
                attrs: {
                    id: msgId,
                    type: 'retry',
                    to: node.attrs.from
                },
                content: [
                    {
                        tag: 'retry',
                        attrs: {
                            count: retryCount.toString(),
                            id: node.attrs.id,
                            t: node.attrs.t,
                            v: '1'
                        }
                    },
                    {
                        tag: 'registration',
                        attrs: {},
                        content: (0, Utils_1.encodeBigEndian)(authState.creds.registrationId)
                    }
                ]
            };
            if (node.attrs.recipient) {
                receipt.attrs.recipient = node.attrs.recipient;
            }
            if (node.attrs.participant) {
                receipt.attrs.participant = node.attrs.participant;
            }
            if (retryCount > 1 || forceIncludeKeys) {
                const { update, preKeys } = await (0, Utils_1.getNextPreKeys)(authState, 1);
                const [keyId] = Object.keys(preKeys);
                const key = preKeys[+keyId];
                const content = receipt.content;
                content.push({
                    tag: 'keys',
                    attrs: {},
                    content: [
                        { tag: 'type', attrs: {}, content: Buffer.from(Defaults_1.KEY_BUNDLE_TYPE) },
                        { tag: 'identity', attrs: {}, content: identityKey.public },
                        (0, Utils_1.xmppPreKey)(key, +keyId),
                        (0, Utils_1.xmppSignedPreKey)(signedPreKey),
                        { tag: 'device-identity', attrs: {}, content: deviceIdentity }
                    ]
                });
                ev.emit('creds.update', update);
            }
            await sendNode(receipt);
            logger.info({ msgAttrs: node.attrs, retryCount }, 'sent retry receipt');
        });
    };
    const handleEncryptNotification = async (node) => {
        const from = node.attrs.from;
        if (from === WABinary_1.S_WHATSAPP_NET) {
            const countChild = (0, WABinary_1.getBinaryNodeChild)(node, 'count');
            const count = +countChild.attrs.value;
            const shouldUploadMorePreKeys = count < Defaults_1.MIN_PREKEY_COUNT;
            logger.debug({ count, shouldUploadMorePreKeys }, 'recv pre-key count');
            if (shouldUploadMorePreKeys) {
                await uploadPreKeys();
            }
        }
        else {
            const identityNode = (0, WABinary_1.getBinaryNodeChild)(node, 'identity');
            if (identityNode) {
                logger.info({ jid: from }, 'identity changed');
            }
        }
    };

    const toLidIfNecessary = (jid) => {
        if (typeof jid !== 'string')
            return jid;
        if (!jid.includes('@') && /^[0-9]+$/.test(jid)) {
            return `${jid}@s.whatsapp.net`;
        }
        if ((0, WABinary_1.isLid)(jid)) {
            const cached = config.lidCache?.get(jid);
            if (cached && typeof cached === 'string') {
                return cached.includes('@') ? cached : `${cached}@s.whatsapp.net`;
            }
            return jid;
        }
        return jid;
    };

    // Helper for LID resolution in group context by samakavare
    const resolveLidFromGroupContext = async (lid, groupJid) => {
        if (!(0, WABinary_1.isLid)(lid) || !(0, WABinary_1.isJidGroup)(groupJid)) {
            return lid;
        }

        try {
            const metadata = await groupMetadata(groupJid);
            const found = metadata.participants.find(p => p.id === lid);
            const jid = found?.jid;
            if (jid) {
                return jid;
            }
        }
        catch (_err) {
            // ignore & fallback
        }
        const cached = config.lidCache?.get(lid);
        if (cached && typeof cached === 'string') {
            return cached.includes('@') ? cached : `${cached}@s.whatsapp.net`;
        }
        return lid;
    };

    const resolveLidOrMaskedJidFromGroupContext = async (jid, groupJid) => {
        if (typeof jid !== 'string') {
            return jid;
        }
        if ((0, WABinary_1.isLid)(jid)) {
            return await resolveLidFromGroupContext(jid, groupJid);
        }
        const decoded = (0, WABinary_1.jidDecode)(jid);
        const user = decoded === null || decoded === void 0 ? void 0 : decoded.user;
        const server = decoded === null || decoded === void 0 ? void 0 : decoded.server;
        if (server === 's.whatsapp.net' && user && /^[0-9]+$/.test(user)) {
            const asLid = `${user}@lid`;
            const resolved = await resolveLidFromGroupContext(asLid, groupJid);
            return resolved === asLid ? jid : resolved;
        }
        return jid;
    };

    const pnToJid = (pn) => {
        if (typeof pn !== 'string' || !pn) {
            return undefined;
        }
        return pn.includes('@') ? pn : `${pn}@s.whatsapp.net`;
    };

    const collectContextInfos = (obj, acc) => {
        if (!obj || typeof obj !== 'object') {
            return;
        }
        if (obj instanceof Uint8Array || Buffer.isBuffer(obj)) {
            return;
        }
        if (Array.isArray(obj)) {
            for (const item of obj) {
                collectContextInfos(item, acc);
            }
            return;
        }
        for (const [key, value] of Object.entries(obj)) {
            if (key === 'contextInfo' && value && typeof value === 'object') {
                acc.push(value);
            }
            collectContextInfos(value, acc);
        }
    };

    const normalizeContextInfoJids = async (contextInfo, groupJid) => {
        if (!contextInfo || typeof contextInfo !== 'object') {
            return;
        }
        const normalizeJid = async (jid) => {
            if (typeof jid !== 'string') {
                return jid;
            }
            if ((0, WABinary_1.isLid)(jid)) {
                if (groupJid) {
                    return await resolveLidFromGroupContext(jid, groupJid);
                }
                const cached = config.lidCache?.get(jid);
                if (cached && typeof cached === 'string') {
                    return cached.includes('@') ? cached : `${cached}@s.whatsapp.net`;
                }
                return (0, WABinary_1.lidToJid)(jid);
            }
            return jid;
        };
        if (typeof contextInfo.participant === 'string') {
            contextInfo.participant = await normalizeJid(contextInfo.participant);
        }
        if (Array.isArray(contextInfo.mentionedJid)) {
            contextInfo.mentionedJid = await Promise.all(contextInfo.mentionedJid.map(j => normalizeJid(j)));
        }
    };

    const handleGroupNotification = async (participant, participantPn, child, groupJid, msg) => {
        var _a, _b, _c, _d;
        const childTag = child === null || child === void 0 ? void 0 : child.tag;
        if (participantPn && participant && (0, WABinary_1.isLid)(participant) && config.lidCache?.set) {
            // NOTE: in most if not every w:gp2 stubs participant_pn refer to the actor (admin) not the target
            const pnAsJid = typeof participantPn === 'string' ? (participantPn.includes('@') ? participantPn : `${participantPn}@s.whatsapp.net`) : participantPn;
            config.lidCache.set(participant, pnAsJid);
        }
        const participantJid = (((_b = (_a = (0, WABinary_1.getBinaryNodeChild)(child, 'participant')) === null || _a === void 0 ? void 0 : _a.attrs) === null || _b === void 0 ? void 0 : _b.jid) || participant);
        if (participantPn && participantJid && (0, WABinary_1.isLid)(participantJid) && config.lidCache?.set &&
            (childTag === 'created_membership_requests' || childTag === 'revoked_membership_requests')) {
            // For membership requests, participant_pn refers to the requester (target), not the actor 
            const pnAsJid = typeof participantPn === 'string' ? (participantPn.includes('@') ? participantPn : `${participantPn}@s.whatsapp.net`) : participantPn;
            config.lidCache.set(participantJid, pnAsJid);
        }
        switch (child === null || child === void 0 ? void 0 : child.tag) {
            case 'create':
                let metadata = (0, groups_1.extractGroupMetadata)(child);
                const fullMetadata = await groupMetadata(groupJid);
                if (metadata.owner && metadata.owner.endsWith('@lid')) {
                    const found = fullMetadata.participants.find(p => p.id === metadata.owner);
                    metadata.owner = found?.jid || (0, WABinary_1.lidToJid)(metadata.owner);
                }
                let resolvedAuthor = participant;
                if (participant.endsWith('@lid')) {
                    const found = fullMetadata.participants.find(p => p.id === participant);
                    resolvedAuthor = found?.jid || (0, WABinary_1.lidToJid)(participant);
                }
                msg.messageStubType = Types_1.WAMessageStubType.GROUP_CREATE;
                msg.messageStubParameters = [metadata.subject];
                msg.key = { participant: metadata.owner };
                ev.emit('chats.upsert', [{
                        id: metadata.id,
                        name: metadata.subject,
                        conversationTimestamp: metadata.creation,
                    }]);
                ev.emit('groups.upsert', [{
                        ...metadata,
                        author: resolvedAuthor
                    }]);
                break;
            case 'ephemeral':
            case 'not_ephemeral':
                msg.message = {
                    protocolMessage: {
                        type: WAProto_1.proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
                        ephemeralExpiration: +(child.attrs.expiration || 0)
                    }
                };
                break;
            case 'modify':
                const modifyNodes = (0, WABinary_1.getBinaryNodeChildren)(child, 'participant');
                const oldNumber = modifyNodes.map(p => {
                    const phoneNumber = p.attrs.phone_number;
                    const pn = p.attrs.participant_pn;
                    if (phoneNumber) {
                        return typeof phoneNumber === 'string' ? (phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`) : phoneNumber;
                    }
                    if (pn) {
                        return typeof pn === 'string' ? (pn.includes('@') ? pn : `${pn}@s.whatsapp.net`) : pn;
                    }
                    return p.attrs.jid;
                });
                msg.messageStubParameters = oldNumber || [];
                msg.messageStubType = Types_1.WAMessageStubType.GROUP_PARTICIPANT_CHANGE_NUMBER;
                break;
            case 'promote':
            case 'demote':
            case 'remove':
            case 'add':
            case 'leave':
                const stubType = `GROUP_PARTICIPANT_${child.tag.toUpperCase()}`;
                msg.messageStubType = Types_1.WAMessageStubType[stubType];
                const participantNodes = (0, WABinary_1.getBinaryNodeChildren)(child, 'participant');
                const participants = await Promise.all(participantNodes.map(async (p) => {
                    const jid = p.attrs.jid;
                    const pn = p.attrs.participant_pn;
                    const phoneNumber = p.attrs.phone_number;
                    // Cache LID to JID mapping if phone_number or participant_pn is available
                    const realPhone = phoneNumber || pn;
                    if (realPhone && jid && (0, WABinary_1.isLid)(jid) && config.lidCache?.set) {
                        const pnAsJid = typeof realPhone === 'string' ? (realPhone.includes('@') ? realPhone : `${realPhone}@s.whatsapp.net`) : realPhone;
                        config.lidCache.set(jid, pnAsJid);
                    }
                    // For ALL participant events, prefer phone_number or participant_pn over jid why i didn't think of it b4 🤕
                    if (phoneNumber) {
                        return typeof phoneNumber === 'string' ? (phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`) : phoneNumber;
                    }
                    if (pn) {
                        return typeof pn === 'string' ? (pn.includes('@') ? pn : `${pn}@s.whatsapp.net`) : pn;
                    }
                    if ((0, WABinary_1.isLid)(jid) && config.lidCache?.get) {
                        const cached = config.lidCache.get(jid);
                        if (cached && typeof cached === 'string') {
                            return cached.includes('@') ? cached : `${cached}@s.whatsapp.net`;
                        }
                    }
                    if (jid && typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) {
                        const user = jid.replace('@s.whatsapp.net', '');
                        if (/^[0-9]+$/.test(user) && user.length > 12) {
                            const resolved = await resolveLidOrMaskedJidFromGroupContext(jid, groupJid);
                            if (resolved !== jid) {
                                return resolved;
                            }
                            // If resolution failed, validate the JID - if invalid, convert back to LID
                            const validated = (0, WABinary_1.validateAndCleanJid)(jid);
                            return validated;
                        }
                    }
                    // Final validation for any JID before returning
                    if (jid && typeof jid === 'string') {
                        return (0, WABinary_1.validateAndCleanJid)(jid);
                    }
                    return jid;
                }));
                if (participants.length === 1 &&
                    (0, WABinary_1.areJidsSameUser)(participants[0], participant) &&
                    child.tag === 'remove') {
                    msg.messageStubType = Types_1.WAMessageStubType.GROUP_PARTICIPANT_LEAVE;
                }
                if ((child.tag === 'leave' || msg.messageStubType === Types_1.WAMessageStubType.GROUP_PARTICIPANT_LEAVE)
                    && participants.length === 1
                    && participantPn
                    && typeof participantPn === 'string') {
                    msg.messageStubParameters = [toLidIfNecessary(participantPn)];
                    if (participant && (0, WABinary_1.isLid)(participant)) {
                        participant = toLidIfNecessary(participantPn);
                    }
                }
                else {
                    msg.messageStubParameters = participants;
                }
                break;
            case 'subject':
                msg.messageStubType = Types_1.WAMessageStubType.GROUP_CHANGE_SUBJECT;
                msg.messageStubParameters = [child.attrs.subject];
                break;
            case 'description':
                const description = (_d = (_c = (0, WABinary_1.getBinaryNodeChild)(child, 'body')) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.toString();
                msg.messageStubType = Types_1.WAMessageStubType.GROUP_CHANGE_DESCRIPTION;
                msg.messageStubParameters = description ? [description] : undefined;
                break;
            case 'announcement':
            case 'not_announcement':
                msg.messageStubType = Types_1.WAMessageStubType.GROUP_CHANGE_ANNOUNCE;
                msg.messageStubParameters = [(child.tag === 'announcement') ? 'on' : 'off'];
                break;
            case 'locked':
            case 'unlocked':
                msg.messageStubType = Types_1.WAMessageStubType.GROUP_CHANGE_RESTRICT;
                msg.messageStubParameters = [(child.tag === 'locked') ? 'on' : 'off'];
                break;
            case 'invite':
                msg.messageStubType = Types_1.WAMessageStubType.GROUP_CHANGE_INVITE_LINK;
                msg.messageStubParameters = [child.attrs.code];
                break;
            case 'member_add_mode':
                const addMode = child.content;
                if (addMode) {
                    msg.messageStubType = Types_1.WAMessageStubType.GROUP_MEMBER_ADD_MODE;
                    msg.messageStubParameters = [addMode.toString()];
                }
                break;
            case 'membership_approval_mode':
                const approvalMode = (0, WABinary_1.getBinaryNodeChild)(child, 'group_join');
                if (approvalMode) {
                    msg.messageStubType = Types_1.WAMessageStubType.GROUP_MEMBERSHIP_JOIN_APPROVAL_MODE;
                    msg.messageStubParameters = [approvalMode.attrs.state];
                }
                break;
            case 'created_membership_requests':
                msg.messageStubType = Types_1.WAMessageStubType.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD;
                // Resolve participantJid to phone number if it's a LID
                let resolvedParticipantJid = participantJid;
                if (participantPn && typeof participantPn === 'string') {
                    resolvedParticipantJid = participantPn.includes('@') ? participantPn : `${participantPn}@s.whatsapp.net`;
                } else if ((0, WABinary_1.isLid)(participantJid) && config.lidCache?.get) {
                    const cached = config.lidCache.get(participantJid);
                    if (cached && typeof cached === 'string') {
                        resolvedParticipantJid = cached.includes('@') ? cached : `${cached}@s.whatsapp.net`;
                    }
                }
                msg.messageStubParameters = [resolvedParticipantJid, 'created', child.attrs.request_method];
                break;
            case 'revoked_membership_requests':
                const isDenied = (0, WABinary_1.areJidsSameUser)(participantJid, participant);
                msg.messageStubType = Types_1.WAMessageStubType.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD;
                // Resolve participantJid to phone number if it's a LID
                let resolvedRevokedJid = participantJid;
                if (participantPn && typeof participantPn === 'string') {
                    resolvedRevokedJid = participantPn.includes('@') ? participantPn : `${participantPn}@s.whatsapp.net`;
                } else if ((0, WABinary_1.isLid)(participantJid) && config.lidCache?.get) {
                    const cached = config.lidCache.get(participantJid);
                    if (cached && typeof cached === 'string') {
                        resolvedRevokedJid = cached.includes('@') ? cached : `${cached}@s.whatsapp.net`;
                    }
                }
                msg.messageStubParameters = [resolvedRevokedJid, isDenied ? 'revoked' : 'rejected'];
                break;
            default:
                // console.log("BAILEYS-DEBUG:", JSON.stringify({ ...child, content: Buffer.isBuffer(child.content) ? child.content.toString() : child.content, participant }, null, 2))
        }
        const isAddEvent = msg.messageStubType === Types_1.WAMessageStubType.GROUP_PARTICIPANT_ADD || 
                          msg.messageStubType === Types_1.WAMessageStubType.GROUP_PARTICIPANT_INVITE ||
                          msg.messageStubType === Types_1.WAMessageStubType.GROUP_PARTICIPANT_ADD_REQUEST_JOIN;
        
        if (msg.messageStubParameters && !isAddEvent) {
            msg.messageStubParameters = await Promise.all(msg.messageStubParameters.map(async (param) => (typeof param === 'string' ? await resolveLidOrMaskedJidFromGroupContext(param, groupJid) : param)));
        }
        participant = toLidIfNecessary(participant);
        if (msg.key?.participant) {
            msg.key.participant = toLidIfNecessary(msg.key.participant);
        }
        const needsResolving = !isAddEvent && ((msg.messageStubParameters && msg.messageStubParameters.some(p => (typeof p === 'string' && ((0, WABinary_1.isLid)(p) || (p.endsWith('@s.whatsapp.net') && /^[0-9]+$/.test(p.split('@')[0])))))) ||
            (participant && ((0, WABinary_1.isLid)(participant) || (typeof participant === 'string' && participant.endsWith('@s.whatsapp.net') && /^[0-9]+$/.test(participant.split('@')[0])))) ||
            (msg.key?.participant && ((0, WABinary_1.isLid)(msg.key.participant) || (typeof msg.key.participant === 'string' && msg.key.participant.endsWith('@s.whatsapp.net') && /^[0-9]+$/.test(msg.key.participant.split('@')[0])))));
        if (needsResolving) {
            if (msg.messageStubParameters) {
                msg.messageStubParameters = await Promise.all(msg.messageStubParameters.map(async (param) => (typeof param === 'string' ? await resolveLidOrMaskedJidFromGroupContext(param, groupJid) : param)));
            }
            if (typeof participant === 'string' && ((0, WABinary_1.isLid)(participant) || (participant.endsWith('@s.whatsapp.net') && /^[0-9]+$/.test(participant.split('@')[0])))) {
                msg.participant = await resolveLidOrMaskedJidFromGroupContext(participant, groupJid);
            }
            else if (participant) {
                //If it's a JID, treat it as a JID. Do not convert back to LID. *smh brah
                msg.participant = participant;
            }
            if (msg.key && typeof msg.key.participant === 'string' && ((0, WABinary_1.isLid)(msg.key.participant) || (msg.key.participant.endsWith('@s.whatsapp.net') && /^[0-9]+$/.test(msg.key.participant.split('@')[0])))) {
                msg.key.participant = await resolveLidOrMaskedJidFromGroupContext(msg.key.participant, groupJid);
            }
            else if (msg.key && msg.key.participant) {
                // If it's a JID, treat it as a JID. Do not convert back to LID. *smh brah pt2
                msg.key.participant = msg.key.participant;
            }
        }
    };

    const handleNewsletterNotification = (id, node) => {
        const messages = (0, WABinary_1.getBinaryNodeChild)(node, 'messages');
        const message = (0, WABinary_1.getBinaryNodeChild)(messages, 'message');
        const serverId = message.attrs.server_id;
        const reactionsList = (0, WABinary_1.getBinaryNodeChild)(message, 'reactions');
        const viewsList = (0, WABinary_1.getBinaryNodeChildren)(message, 'views_count');
        if (reactionsList) {
            const reactions = (0, WABinary_1.getBinaryNodeChildren)(reactionsList, 'reaction');
            if (reactions.length === 0) {
                ev.emit('newsletter.reaction', { id, 'server_id': serverId, reaction: { removed: true } });
            }
            reactions.forEach(item => {
                var _a, _b;
                ev.emit('newsletter.reaction', { id, 'server_id': serverId, reaction: { code: (_a = item.attrs) === null || _a === void 0 ? void 0 : _a.code, count: +((_b = item.attrs) === null || _b === void 0 ? void 0 : _b.count) } });
            });
        }
        if (viewsList.length) {
            viewsList.forEach(item => {
                ev.emit('newsletter.view', { id, 'server_id': serverId, count: +item.attrs.count });
            });
        }
    };

    const handleMexNewsletterNotification = (id, node) => {
        var _a;
        const operation = node === null || node === void 0 ? void 0 : node.attrs.op_name;
        const content = JSON.parse((_a = node === null || node === void 0 ? void 0 : node.content) === null || _a === void 0 ? void 0 : _a.toString());
        let contentPath;
        if (operation === Types_1.MexOperations.PROMOTE || operation === Types_1.MexOperations.DEMOTE) {
            let action;
            if (operation === Types_1.MexOperations.PROMOTE) {
                action = 'promote';
                contentPath = content.data[Types_1.XWAPaths.PROMOTE];
            }
            if (operation === Types_1.MexOperations.DEMOTE) {
                action = 'demote';
                contentPath = content.data[Types_1.XWAPaths.DEMOTE];
            }
            const author = resolveJid(contentPath.actor.pn);
            const user = resolveJid(contentPath.user.pn);
            ev.emit('newsletter-participants.update', { id, author, user, new_role: contentPath.user_new_role, action });
        }
        if (operation === Types_1.MexOperations.UPDATE) {
            contentPath = content.data[Types_1.XWAPaths.METADATA_UPDATE];
            ev.emit('newsletter-settings.update', { id, update: contentPath.thread_metadata.settings });
        }
    };

    const processNotification = async (node) => {
        var _a;
        const result = {};
        const [child] = (0, WABinary_1.getAllBinaryNodeChildren)(node);
        const nodeType = node.attrs.type;
        const from = resolveJid((0, WABinary_1.jidNormalizedUser)(node.attrs.from));
        switch (nodeType) {
            case 'privacy_token':
                const tokenList = (0, WABinary_1.getBinaryNodeChildren)(child, 'token');
                for (const { attrs, content } of tokenList) {
                    const jid = resolveJid(attrs.jid);
                    ev.emit('chats.update', [
                        {
                            id: jid,
                            tcToken: content
                        }
                    ]);
                    logger.debug({ jid }, 'got privacy token update');
                }
                break;
            case 'newsletter':
                handleNewsletterNotification(node.attrs.from, child);
                break;
            case 'mex':
                handleMexNewsletterNotification(node.attrs.from, child);
                break;
            case 'w:gp2':
                await handleGroupNotification(node.attrs.participant, node.attrs.participant_pn, child, from, result);
                break;
            case 'mediaretry':
                const event = (0, Utils_1.decodeMediaRetryNode)(node);
                ev.emit('messages.media-update', [event]);
                break;
            case 'encrypt':
                await handleEncryptNotification(node);
                break;
            case 'devices':
                const devices = (0, WABinary_1.getBinaryNodeChildren)(child, 'device');
                if ((0, WABinary_1.areJidsSameUser)(child.attrs.jid, authState.creds.me.id)) {
                    const deviceJids = devices.map(d => resolveJid(d.attrs.jid));
                    logger.info({ deviceJids }, 'got my own devices');
                }
                break;
            case 'server_sync':
                const update = (0, WABinary_1.getBinaryNodeChild)(node, 'collection');
                if (update) {
                    const name = update.attrs.name;
                    await resyncAppState([name], false);
                }
                break;
            case 'picture':
                const setPicture = (0, WABinary_1.getBinaryNodeChild)(node, 'set');
                const delPicture = (0, WABinary_1.getBinaryNodeChild)(node, 'delete');
                ev.emit('contacts.update', [{
                        id: resolveJid(from) || ((_b = (_a = (setPicture || delPicture)) === null || _a === void 0 ? void 0 : _a.attrs) === null || _b === void 0 ? void 0 : _b.hash) || '',
                        imgUrl: setPicture ? 'changed' : 'removed'
                    }]);
                if ((0, WABinary_1.isJidGroup)(from)) {
                    const node = setPicture || delPicture;
                    result.messageStubType = Types_1.WAMessageStubType.GROUP_CHANGE_ICON;
                    if (setPicture) {
                        result.messageStubParameters = [setPicture.attrs.id];
                    }
                    result.participant = node === null || node === void 0 ? void 0 : node.attrs.author;
                    result.key = {
                        ...result.key || {},
                        participant: setPicture === null || setPicture === void 0 ? void 0 : setPicture.attrs.author
                    };
                    if (result.participant && (0, WABinary_1.isLid)(result.participant)) {
                        result.participant = await resolveLidFromGroupContext(result.participant, from);
                    }
                    if (result.key?.participant && (0, WABinary_1.isLid)(result.key.participant)) {
                        result.key.participant = await resolveLidFromGroupContext(result.key.participant, from);
                    }
                }
                break;
            case 'account_sync':
                if (child.tag === 'disappearing_mode') {
                    const newDuration = +child.attrs.duration;
                    const timestamp = +child.attrs.t;
                    logger.info({ newDuration }, 'updated account disappearing mode');
                    ev.emit('creds.update', {
                        accountSettings: {
                            ...authState.creds.accountSettings,
                            defaultDisappearingMode: {
                                ephemeralExpiration: newDuration,
                                ephemeralSettingTimestamp: timestamp,
                            },
                        }
                    });
                }
                else if (child.tag === 'blocklist') {
                    const blocklists = (0, WABinary_1.getBinaryNodeChildren)(child, 'item');
                    for (const { attrs } of blocklists) {
                        const blocklist = [resolveJid(attrs.jid)];
                        const type = (attrs.action === 'block') ? 'add' : 'remove';
                        ev.emit('blocklist.update', { blocklist, type });
                    }
                }
                break;
            case 'link_code_companion_reg':
                const linkCodeCompanionReg = (0, WABinary_1.getBinaryNodeChild)(node, 'link_code_companion_reg');
                const ref = toRequiredBuffer((0, WABinary_1.getBinaryNodeChildBuffer)(linkCodeCompanionReg, 'link_code_pairing_ref'));
                const primaryIdentityPublicKey = toRequiredBuffer((0, WABinary_1.getBinaryNodeChildBuffer)(linkCodeCompanionReg, 'primary_identity_pub'));
                const primaryEphemeralPublicKeyWrapped = toRequiredBuffer((0, WABinary_1.getBinaryNodeChildBuffer)(linkCodeCompanionReg, 'link_code_pairing_wrapped_primary_ephemeral_pub'));
                const codePairingPublicKey = await decipherLinkPublicKey(primaryEphemeralPublicKeyWrapped);
                const companionSharedKey = Utils_1.Curve.sharedKey(authState.creds.pairingEphemeralKeyPair.private, codePairingPublicKey);
                const random = (0, crypto_1.randomBytes)(32);
                const linkCodeSalt = (0, crypto_1.randomBytes)(32);
                const linkCodePairingExpanded = await (0, Utils_1.hkdf)(companionSharedKey, 32, {
                    salt: linkCodeSalt,
                    info: 'link_code_pairing_key_bundle_encryption_key'
                });
                const encryptPayload = Buffer.concat([Buffer.from(authState.creds.signedIdentityKey.public), primaryIdentityPublicKey, random]);
                const encryptIv = (0, crypto_1.randomBytes)(12);
                const encrypted = (0, Utils_1.aesEncryptGCM)(encryptPayload, linkCodePairingExpanded, encryptIv, Buffer.alloc(0));
                const encryptedPayload = Buffer.concat([linkCodeSalt, encryptIv, encrypted]);
                const identitySharedKey = Utils_1.Curve.sharedKey(authState.creds.signedIdentityKey.private, primaryIdentityPublicKey);
                const identityPayload = Buffer.concat([companionSharedKey, identitySharedKey, random]);
                authState.creds.advSecretKey = (await (0, Utils_1.hkdf)(identityPayload, 32, { info: 'adv_secret' })).toString('base64');
                await query({
                    tag: 'iq',
                    attrs: {
                        to: WABinary_1.S_WHATSAPP_NET,
                        type: 'set',
                        id: sock.generateMessageTag(),
                        xmlns: 'md'
                    },
                    content: [
                        {
                            tag: 'link_code_companion_reg',
                            attrs: {
                                jid: authState.creds.me.id,
                                stage: 'companion_finish',
                            },
                            content: [
                                {
                                    tag: 'link_code_pairing_wrapped_key_bundle',
                                    attrs: {},
                                    content: encryptedPayload
                                },
                                {
                                    tag: 'companion_identity_public',
                                    attrs: {},
                                    content: authState.creds.signedIdentityKey.public
                                },
                                {
                                    tag: 'link_code_pairing_ref',
                                    attrs: {},
                                    content: ref
                                }
                            ]
                        }
                    ]
                });
                authState.creds.registered = true;
                ev.emit('creds.update', authState.creds);
        }
        if (Object.keys(result).length) {
            return result;
        }
    };

    async function decipherLinkPublicKey(data) {
        const buffer = toRequiredBuffer(data);
        const salt = buffer.slice(0, 32);
        const secretKey = await (0, Utils_1.derivePairingCodeKey)(authState.creds.pairingCode, salt);
        const iv = buffer.slice(32, 48);
        const payload = buffer.slice(48, 80);
        return (0, Utils_1.aesDecryptCTR)(payload, secretKey, iv);
    }
    function toRequiredBuffer(data) {
        if (data === undefined) {
            throw new boom_1.Boom('Invalid buffer', { statusCode: 400 });
        }
        return data instanceof Buffer ? data : Buffer.from(data);
    }
    const willSendMessageAgain = (id, participant) => {
        const key = `${id}:${participant}`;
        const retryCount = msgRetryCache.get(key) || 0;
        return retryCount < maxMsgRetryCount;
    };
    const updateSendMessageAgainCount = (id, participant) => {
        const key = `${id}:${participant}`;
        const newValue = (msgRetryCache.get(key) || 0) + 1;
        msgRetryCache.set(key, newValue);
    };
    const sendMessagesAgain = async (key, ids, retryNode) => {
        var _a;
        // implement a cache to store the last 256 sent messages (copy whatsmeow) | (maybe should lower it)
        const msgs = await Promise.all(ids.map(async (id) => {
            const msg = await getMessage({ ...key, id });
            return msg || getCachedSentMessage(key.remoteJid, id);
        }));
        const remoteJid = key.remoteJid;
        const participant = key.participant || remoteJid;
        const sendToAll = !((_a = (0, WABinary_1.jidDecode)(participant)) === null || _a === void 0 ? void 0 : _a.device);
        await assertSessions([participant], true);
        if ((0, WABinary_1.isJidGroup)(remoteJid)) {
            await authState.keys.set({ 'sender-key-memory': { [remoteJid]: null } });
        }
        logger.debug({ participant, sendToAll }, 'forced new session for retry recp');
        for (const [i, msg] of msgs.entries()) {
            if (msg) {
                updateSendMessageAgainCount(ids[i], participant);
                const msgRelayOpts = { messageId: ids[i] };
                if (sendToAll) {
                    msgRelayOpts.useUserDevicesCache = false;
                }
                else {
                    msgRelayOpts.participant = {
                        jid: participant,
                        count: +retryNode.attrs.count
                    };
                }
                await relayMessage(key.remoteJid, msg, msgRelayOpts);
            }
            else {
                logger.debug({ jid: key.remoteJid, id: ids[i] }, 'recv retry request, but message not available');
            }
        }
    };
    const handleReceipt = async (node) => {
        var _a, _b;
        const { attrs, content } = node;
        let participant = attrs.participant;
        if (participant && (0, WABinary_1.isLid)(participant) && (0, WABinary_1.isJidGroup)(attrs.from)) {
            const cached = config.lidCache.get(participant);
            if (cached) {
                participant = typeof cached === 'string' && !cached.includes('@') ? `${cached}@s.whatsapp.net` : cached;
            }
            else {
                try {
                    const metadata = await groupMetadata(attrs.from);
                    const found = metadata.participants.find(p => p.id === participant);
                    const jid = found === null || found === void 0 ? void 0 : found.jid;
                    if (jid && !(0, WABinary_1.isLid)(jid)) {
                        participant = jid;
                    }
                }
                catch (_e) {
                }
            }
        }
        const isLid = attrs.from.includes('lid');
        const isNodeFromMe = (0, WABinary_1.areJidsSameUser)(resolveJid(participant) || resolveJid(attrs.from), isLid ? (_a = authState.creds.me) === null || _a === void 0 ? void 0 : _a.lid : (_b = authState.creds.me) === null || _b === void 0 ? void 0 : _b.id);
        const remoteJid = !isNodeFromMe || (0, WABinary_1.isJidGroup)(attrs.from) ? resolveJid(attrs.from) : attrs.recipient;
        const fromMe = !attrs.recipient || ((attrs.type === 'retry' || attrs.type === 'sender') && isNodeFromMe);
        const key = {
            remoteJid,
            id: '',
            fromMe,
            participant: resolveJid(participant)
        };
        if (shouldIgnoreJid(remoteJid) && remoteJid !== '@s.whatsapp.net') {
            logger.debug({ remoteJid }, 'ignoring receipt from jid');
            await sendMessageAck(node);
            return;
        }
        const ids = [attrs.id];
        if (Array.isArray(content)) {
            const items = (0, WABinary_1.getBinaryNodeChildren)(content[0], 'item');
            ids.push(...items.map(i => i.attrs.id));
        }
        try {
            await Promise.all([
                processingMutex.mutex(async () => {
                    const status = (0, Utils_1.getStatusFromReceiptType)(attrs.type);
                    if (typeof status !== 'undefined' &&
                        (
                        status >= WAProto_1.proto.WebMessageInfo.Status.SERVER_ACK ||
                            !isNodeFromMe)) {
                        if ((0, WABinary_1.isJidGroup)(remoteJid) || (0, WABinary_1.isJidStatusBroadcast)(remoteJid)) {
                            if (attrs.participant) {
                                const updateKey = status === WAProto_1.proto.WebMessageInfo.Status.DELIVERY_ACK ? 'receiptTimestamp' : 'readTimestamp';
                                ev.emit('message-receipt.update', ids.map(id => ({
                                    key: { ...key, id },
                                    receipt: {
                                        userJid: (0, WABinary_1.jidNormalizedUser)(resolveJid(attrs.participant)),
                                        [updateKey]: +attrs.t
                                    }
                                })));
                            }
                        }
                        else {
                            ids.forEach(id => {
                                const statusName = Object.keys(WAProto_1.proto.WebMessageInfo.Status)[status] || `UNKNOWN_${status}`;
                                logger.debug({ remoteJid, id, status: statusName }, 'ACK status update');
                            });
                            ev.emit('messages.update', ids.map(id => ({
                                key: { ...key, id },
                                update: { status }
                            })));
                        }
                    }
                    if (status === WAProto_1.proto.WebMessageInfo.Status.ERROR) {
                        ev.emit('messages.update', ids.map(id => ({
                            key: { ...key, id },
                            update: { status: WAProto_1.proto.WebMessageInfo.Status.SERVER_ACK }
                        })));
                    }
                    if (attrs.type === 'retry') {
                        key.participant = key.participant || attrs.from;
                        const retryNode = (0, WABinary_1.getBinaryNodeChild)(node, 'retry');
                        if (willSendMessageAgain(ids[0], key.participant)) {
                            if (key.fromMe) {
                                try {
                                    logger.debug({ attrs, key }, 'recv retry request');
                                    await sendMessagesAgain(key, ids, retryNode);
                                }
                                catch (error) {
                                    logger.error({ key, ids, trace: error.stack }, 'error in sending message again');
                                }
                            }
                            else {
                                logger.info({ attrs, key }, 'recv retry for not fromMe message');
                            }
                        }
                        else {
                            logger.info({ attrs, key }, 'will not send message again, as sent too many times');
                        }
                    }
                })
            ]);
        }
        finally {
            await sendMessageAck(node);
        }
    };
    const handleNotification = async (node) => {
        const remoteJid = resolveJid(node.attrs.from);
        if (shouldIgnoreJid(remoteJid) && remoteJid !== '@s.whatsapp.net') {
            logger.debug({ remoteJid, id: node.attrs.id }, 'ignored notification');
            await sendMessageAck(node);
            return;
        }
        const notifDedupKey = `${remoteJid}:${node.attrs.id}`;
        if (notificationDedupCache.get(notifDedupKey)) {
            await sendMessageAck(node);
            return;
        }
        notificationDedupCache.set(notifDedupKey, true);
        try {
            await Promise.all([
                processingMutex.mutex(async () => {
                    var _a;
                    const msg = await processNotification(node);
                    if (msg) {
                        const stubType = msg.messageStubType;
                        const stubParams = Array.isArray(msg.messageStubParameters) ? msg.messageStubParameters : [];
                        const stubDedupKey = `${remoteJid}:${stubType}:${stubParams.join(',')}`;
                        if (stubType && notificationStubDedupCache.get(stubDedupKey)) {
                            return;
                        }
                        if (stubType) {
                            notificationStubDedupCache.set(stubDedupKey, true);
                        }
                        const participant = msg.participant || resolveJid(node.attrs.participant);
                        const fromMe = (0, WABinary_1.areJidsSameUser)(participant || remoteJid, authState.creds.me.id);
                        const key = msg.key || {};
                        key.remoteJid = remoteJid;
                        key.fromMe = fromMe;
                        key.id = node.attrs.id;
                        key.participant = key.participant || participant;
                        msg.key = key;
                        msg.participant = participant;
                        msg.messageTimestamp = +node.attrs.t;
                        const fullMsg = WAProto_1.proto.WebMessageInfo.fromObject(msg);
                        await upsertMessage(fullMsg, 'append');
                    }
                })
            ]);
        }
        finally {
            await sendMessageAck(node);
        }
    };
    const handleMessage = withAck(async (node) => {
        var _a, _b, _c;
        if (shouldIgnoreJid(node.attrs.from) && node.attrs.from !== '@s.whatsapp.net') {
            logger.debug({ key: node.attrs.key }, 'ignored message');
            return;
        }
        const encNode = (0, WABinary_1.getBinaryNodeChild)(node, 'enc');
        // temporary fix for crashes and issues resulting of failed msmsg decryption
        if (encNode && encNode.attrs.type === 'msmsg') {
            logger.debug({ key: node.attrs.key }, 'recv msmsg, requesting retry');
            retryMutex.mutex(async () => {
                if (ws.isOpen) {
                    if ((0, WABinary_1.getBinaryNodeChild)(node, 'unavailable')) {
                        return;
                    }
                    await sendRetryRequest(node, false);
                    if (retryRequestDelayMs) {
                        await (0, Utils_1.delay)(retryRequestDelayMs);
                    }
                }
                else {
                    logger.debug({ node }, 'connection closed, ignoring retry req');
                }
            });
            return;
        }
        let response;
        if ((0, WABinary_1.getBinaryNodeChild)(node, 'unavailable') && !encNode) {
            const { key } = (0, Utils_1.decodeMessageNode)(node, authState.creds.me.id, authState.creds.me.lid || '').fullMessage;
            response = await requestPlaceholderResend(key);
            if (response === 'RESOLVED') {
                return;
            }
            logger.debug('received unavailable message, acked and requested resend from phone');
        }
        else {
            if (placeholderResendCache.get(node.attrs.id)) {
                placeholderResendCache.del(node.attrs.id);
            }
        }
        const { fullMessage: msg, category, author, decrypt } = (0, Utils_1.decryptMessageNode)(node, authState.creds.me.id, authState.creds.me.lid || '', signalRepository, logger);
        if (response && ((_a = msg === null || msg === void 0 ? void 0 : msg.messageStubParameters) === null || _a === void 0 ? void 0 : _a[0]) === Utils_1.NO_MESSAGE_FOUND_ERROR_TEXT) {
            msg.messageStubParameters = [Utils_1.NO_MESSAGE_FOUND_ERROR_TEXT, response];
        }
        if (((_c = (_b = msg.message) === null || _b === void 0 ? void 0 : _b.protocolMessage) === null || _c === void 0 ? void 0 : _c.type) === WAProto_1.proto.Message.ProtocolMessage.Type.SHARE_PHONE_NUMBER && node.attrs.sender_pn) {
            ev.emit('chats.phoneNumberShare', { lid: resolveJid(node.attrs.from), jid: pnToJid(node.attrs.sender_pn) || resolveJid(node.attrs.sender_pn) });
        }
        try {
            await Promise.all([
                processingMutex.mutex(async () => {
                    var _a, _b, _c, _d, _e, _f;
                    await decrypt();
                    if (msg.message) {
                        const contextInfos = [];
                        collectContextInfos(msg.message, contextInfos);
                        if (contextInfos.length) {
                            const groupJid = (0, WABinary_1.isJidGroup)(msg.key.remoteJid) ? msg.key.remoteJid : undefined;
                            for (const ci of contextInfos) {
                                await normalizeContextInfoJids(ci, groupJid);
                            }
                        }
                    }
                    // message failed to decrypt
                    if (msg.messageStubType === WAProto_1.proto.WebMessageInfo.StubType.CIPHERTEXT) {
                        if (((_a = msg === null || msg === void 0 ? void 0 : msg.messageStubParameters) === null || _a === void 0 ? void 0 : _a[0]) === Utils_1.MISSING_KEYS_ERROR_TEXT) {
                            return sendMessageAck(node, Utils_1.NACK_REASONS.ParsingError);
                        }
                        retryMutex.mutex(async () => {
                            if (ws.isOpen) {
                                if ((0, WABinary_1.getBinaryNodeChild)(node, 'unavailable')) {
                                    return;
                                }
                                await sendRetryRequest(node, !encNode);
                                if (retryRequestDelayMs) {
                                    await (0, Utils_1.delay)(retryRequestDelayMs);
                                }
                            }
                            else {
                                logger.debug({ node }, 'connection closed, ignoring retry req');
                            }
                        });
                    }
                    else {
                        let type = undefined;
                        if ((_b = msg.key.participant) === null || _b === void 0 ? void 0 : _b.endsWith('@lid')) {
                            msg.key.participant = pnToJid(node.attrs.participant_pn) || authState.creds.me.id;
                        }
                        if (!(0, WABinary_1.isJidGroup)(msg.key.remoteJid) && (0, WABinary_1.isLidUser)(msg.key.remoteJid)) {
                            msg.key.remoteJid = pnToJid(node.attrs.sender_pn) || pnToJid(node.attrs.peer_recipient_pn) || msg.key.remoteJid;
                        }
                        let participant = msg.key.participant;
                        if (category === 'peer') {
                            type = 'peer_msg';
                        }
                        else if (msg.key.fromMe) {
                            type = 'sender';
                            if ((0, WABinary_1.isJidUser)(msg.key.remoteJid)) {
                                participant = author;
                            }
                        }
                        else if (!sendActiveReceipts) {
                            type = 'inactive';
                        }
                        await sendReceipt(msg.key.remoteJid, participant, [msg.key.id], type);
                        const isAnyHistoryMsg = (0, Utils_1.getHistoryMsg)(msg.message);
                        if (isAnyHistoryMsg) {
                            const jid = (0, WABinary_1.jidNormalizedUser)(msg.key.remoteJid);
                            await sendReceipt(jid, undefined, [msg.key.id], 'hist_sync');
                        }
                    }
                    if (msg.messageStubType) {
                        const hasLidParam = msg.messageStubParameters && msg.messageStubParameters.some(p => typeof p === 'string' && (0, WABinary_1.isLid)(p));
                        if (hasLidParam) {
                            if ((0, WABinary_1.isJidGroup)(msg.key.remoteJid)) {
                                msg.messageStubParameters = await Promise.all(msg.messageStubParameters.map(async (param) => (typeof param === 'string' && (0, WABinary_1.isLid)(param))
                                    ? await resolveLidFromGroupContext(param, msg.key.remoteJid)
                                    : param));
                            }
                            else {
                                msg.messageStubParameters = msg.messageStubParameters.map(param => (typeof param === 'string' && (0, WABinary_1.isLid)(param))
                                    ? (0, WABinary_1.lidToJid)(param)
                                    : param);
                            }
                        }
                        if (msg.key?.participant && typeof msg.key.participant === 'string' && (0, WABinary_1.isLid)(msg.key.participant)) {
                            if ((0, WABinary_1.isJidGroup)(msg.key.remoteJid)) {
                                msg.key.participant = pnToJid(node.attrs.participant_pn) || await resolveLidFromGroupContext(msg.key.participant, msg.key.remoteJid);
                            }
                            else {
                                msg.key.participant = pnToJid(node.attrs.participant_pn) || (0, WABinary_1.lidToJid)(msg.key.participant);
                            }
                        }
                        if (msg.participant && typeof msg.participant === 'string' && (0, WABinary_1.isLid)(msg.participant)) {
                            if ((0, WABinary_1.isJidGroup)(msg.key.remoteJid)) {
                                msg.participant = pnToJid(node.attrs.participant_pn) || await resolveLidFromGroupContext(msg.participant, msg.key.remoteJid);
                            }
                            else {
                                msg.participant = pnToJid(node.attrs.participant_pn) || (0, WABinary_1.lidToJid)(msg.participant);
                            }
                        }
                    }
                    (0, Utils_1.cleanMessage)(msg, authState.creds.me.id);
                    await upsertMessage(msg, node.attrs.offline ? 'append' : 'notify');
                })
            ]);
        }
        catch (error) {
            logger.error({ error, node }, 'error in handling message');
        }
    });
    const fetchMessageHistory = async (count, oldestMsgKey, oldestMsgTimestamp) => {
        var _a;
        if (!((_a = authState.creds.me) === null || _a === void 0 ? void 0 : _a.id)) {
            throw new boom_1.Boom('Not authenticated');
        }
        const pdoMessage = {
            historySyncOnDemandRequest: {
                chatJid: oldestMsgKey.remoteJid,
                oldestMsgFromMe: oldestMsgKey.fromMe,
                oldestMsgId: oldestMsgKey.id,
                oldestMsgTimestampMs: oldestMsgTimestamp,
                onDemandMsgCount: count
            },
            peerDataOperationRequestType: WAProto_1.proto.Message.PeerDataOperationRequestType.HISTORY_SYNC_ON_DEMAND
        };
        return sendPeerDataOperationMessage(pdoMessage);
    };
    const requestPlaceholderResend = async (messageKey) => {
        var _a;
        if (!((_a = authState.creds.me) === null || _a === void 0 ? void 0 : _a.id)) {
            throw new boom_1.Boom('Not authenticated');
        }
        if (placeholderResendCache.get(messageKey === null || messageKey === void 0 ? void 0 : messageKey.id)) {
            logger.debug({ messageKey }, 'already requested resend');
            return;
        }
        else {
            placeholderResendCache.set(messageKey === null || messageKey === void 0 ? void 0 : messageKey.id, true);
        }
        await (0, Utils_1.delay)(5000);
        if (!placeholderResendCache.get(messageKey === null || messageKey === void 0 ? void 0 : messageKey.id)) {
            logger.debug({ messageKey }, 'message received while resend requested');
            return 'RESOLVED';
        }
        const pdoMessage = {
            placeholderMessageResendRequest: [{
                    messageKey
                }],
            peerDataOperationRequestType: WAProto_1.proto.Message.PeerDataOperationRequestType.PLACEHOLDER_MESSAGE_RESEND
        };
        setTimeout(() => {
            if (placeholderResendCache.get(messageKey === null || messageKey === void 0 ? void 0 : messageKey.id)) {
                logger.debug({ messageKey }, 'PDO message without response after 15 seconds. Phone possibly offline');
                placeholderResendCache.del(messageKey === null || messageKey === void 0 ? void 0 : messageKey.id);
            }
        }, 15000);
        return sendPeerDataOperationMessage(pdoMessage);
    };
    const handleCall = async (node) => {
        const { attrs } = node;
        const [infoChild] = (0, WABinary_1.getAllBinaryNodeChildren)(node);
        const callId = infoChild.attrs['call-id'];
        const status = (0, Utils_1.getCallStatusFromNode)(infoChild);
        const contextGroupJid = (0, WABinary_1.isJidGroup)(attrs.from) ? attrs.from : undefined;
        const resolvedCallCreator = await resolveLidFromGroupContext(infoChild.attrs.from || infoChild.attrs['call-creator'], contextGroupJid);
        const resolvedChatId = await resolveLidFromGroupContext(attrs.from, contextGroupJid);
        const call = {
            chatId: resolvedChatId,
            from: resolvedCallCreator,
            id: callId,
            date: new Date(+attrs.t * 1000),
            offline: !!attrs.offline,
            status,
        };
        if (status === 'offer') {
            call.isVideo = !!(0, WABinary_1.getBinaryNodeChild)(infoChild, 'video');
            call.isGroup = infoChild.attrs.type === 'group' || !!infoChild.attrs['group-jid'];
            if (infoChild.attrs['group-jid']) {
                call.groupJid = await resolveLidFromGroupContext(infoChild.attrs['group-jid'], infoChild.attrs['group-jid']);
            }
            callOfferCache.set(call.id, call);
        }
        const existingCall = callOfferCache.get(call.id);
        if (existingCall) {
            call.isVideo = existingCall.isVideo;
            call.isGroup = existingCall.isGroup;
        }
        if (status === 'reject' || status === 'accept' || status === 'timeout' || status === 'terminate') {
            callOfferCache.del(call.id);
        }
        ev.emit('call', [call]);
        await sendMessageAck(node);
    };
    const handleBadAck = async ({ attrs }) => {
        const key = { remoteJid: attrs.from, fromMe: true, id: attrs.id, 'server_id': attrs === null || attrs === void 0 ? void 0 : attrs.server_id };
        // current hypothesis is that if pash is sent in the ack
        // it means -- the message hasn't reached all devices yet
        // we'll retry sending the message here
        if (attrs.phash && attrs.class === 'message') {
            logger.info({ attrs }, 'received phash in ack, resending message...');
            const cacheKey = `${key.remoteJid}:${key.id}`;
            const retryCount = msgRetryCache.get(cacheKey) || 0;
            if (retryCount >= maxMsgRetryCount) {
                logger.warn({ attrs }, 'reached max retry count, not sending message again');
                msgRetryCache.del(cacheKey);
                return;
            }
            const msg = await getMessage(key);
            if (msg) {
                await relayMessage(key.remoteJid, msg, { messageId: key.id, useUserDevicesCache: false });
                msgRetryCache.set(cacheKey, retryCount + 1);
            }
            else {
                logger.warn({ attrs }, 'could not send message again, as it was not found');
            }
        }
        if (attrs.error) {
            logger.warn({ attrs }, 'received error in ack');
            ev.emit('messages.update', [
                {
                    key,
                    update: {
                        status: Types_1.WAMessageStatus.ERROR,
                        messageStubParameters: [
                            attrs.error
                        ]
                    }
                }
            ]);
        }
    };
    const processNodeWithBuffer = async (node, identifier, exec) => {
        ev.buffer();
        await execTask();
        ev.flush();
        function execTask() {
            return exec(node, false)
                .catch(err => onUnexpectedError(err, identifier));
        }
    };
    const makeOfflineNodeProcessor = () => {
        const nodeProcessorMap = new Map([
            ['message', handleMessage],
            ['call', handleCall],
            ['receipt', handleReceipt],
            ['notification', handleNotification]
        ]);
        const nodes = [];
        let isProcessing = false;
        const enqueue = (type, node) => {
            nodes.push({ type, node });
            if (isProcessing) {
                return;
            }
            isProcessing = true;
            const promise = async () => {
                try {
                    while (nodes.length && ws.isOpen) {
                        const { type, node } = nodes.shift();
                        const nodeProcessor = nodeProcessorMap.get(type);
                        if (!nodeProcessor) {
                            onUnexpectedError(new Error(`unknown offline node type: ${type}`), 'processing offline node');
                            continue;
                        }
                        try {
                            await nodeProcessor(node);
                        }
                        catch (error) {
                            onUnexpectedError(error, 'processing offline node');
                        }
                    }
                }
                finally {
                    isProcessing = false;
                }
            };
            promise().catch(error => onUnexpectedError(error, 'processing offline nodes'));
        };
        return { enqueue };
    };
    const offlineNodeProcessor = makeOfflineNodeProcessor();
    const processNode = (type, node, identifier, exec) => {
        const isOffline = !!node.attrs.offline;
        if (isOffline) {
            offlineNodeProcessor.enqueue(type, node);
        }
        else {
            processNodeWithBuffer(node, identifier, exec);
        }
    };
    ws.on('CB:message', (node) => {
        processNode('message', node, 'processing message', handleMessage);
    });
    ws.on('CB:call', async (node) => {
        processNode('call', node, 'handling call', handleCall);
    });
    ws.on('CB:receipt', node => {
        processNode('receipt', node, 'handling receipt', handleReceipt);
    });
    ws.on('CB:notification', async (node) => {
        processNode('notification', node, 'handling notification', handleNotification);
    });
    ws.on('CB:ack,class:message', (node) => {
        handleBadAck(node)
            .catch(error => onUnexpectedError(error, 'handling bad ack'));
    });
    ev.on('call', ([call]) => {
        if (call.status === 'timeout' || (call.status === 'offer' && call.isGroup)) {
            const msg = {
                key: {
                    remoteJid: call.chatId,
                    id: call.id,
                    fromMe: false
                },
                messageTimestamp: (0, Utils_1.unixTimestampSeconds)(call.date),
            };
            if (call.status === 'timeout') {
                if (call.isGroup) {
                    msg.messageStubType = call.isVideo ? Types_1.WAMessageStubType.CALL_MISSED_GROUP_VIDEO : Types_1.WAMessageStubType.CALL_MISSED_GROUP_VOICE;
                }
                else {
                    msg.messageStubType = call.isVideo ? Types_1.WAMessageStubType.CALL_MISSED_VIDEO : Types_1.WAMessageStubType.CALL_MISSED_VOICE;
                }
            }
            else {
                msg.message = { call: { callKey: Buffer.from(call.id) } };
            }
            const protoMsg = WAProto_1.proto.WebMessageInfo.fromObject(msg);
            upsertMessage(protoMsg, call.offline ? 'append' : 'notify');
        }
    });
    ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== Types_1.DisconnectReason.loggedOut;
            if (shouldReconnect) {
                logger.info('Connection closed, will handle reconnection automatically');
            } else {
                logger.warn('Logged out, manual re-authentication required');
            }
        } else if (connection === 'open') {
            sendActiveReceipts = true;
        }
        if (typeof update.isOnline !== 'undefined' && update.isOnline) {
            sendActiveReceipts = true;
            logger.trace(`sendActiveReceipts set to "${sendActiveReceipts}"`);
        }
    });
    ev.on('messages.update', (updates) => {
        const config = (0, performance_config_1.getPerformanceConfig)();
        updates.forEach(update => {
            if (update.update.status === WAProto_1.proto.WebMessageInfo.Status.PENDING &&
                Date.now() - (update.update.timestamp || 0) > 30000) {
                logger.debug({ key: update.key }, 'retrying stuck pending message with anti-ban delay');
                setTimeout(async () => {
                    try {
                        const msg = await getMessage(update.key);
                        if (msg) {
                            await relayMessage(update.key.remoteJid, msg, { messageId: update.key.id });
                        }
                    } catch (err) {
                        logger.error({ err, key: update.key }, 'failed to retry stuck message');
                    }
                }, config.security?.messageDelay?.min || 1000);
            }
        });
    });
    return {
        ...sock,
        sendMessageAck,
        sendRetryRequest,
        rejectCall,
        offerCall,
        fetchMessageHistory,
        requestPlaceholderResend,
    };
};
exports.makeMessagesRecvSocket = makeMessagesRecvSocket;