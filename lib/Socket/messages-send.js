"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMessagesSocket = void 0;
const boom_1 = require("@hapi/boom");
const node_cache_1 = __importDefault(require("@cacheable/node-cache"));
const crypto_1 = require("crypto");
const AbortController = require("abort-controller");
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const Utils_1 = require("../Utils");
const retry_1 = require("../Utils/retry");
const link_preview_1 = require("../Utils/link-preview");
const WABinary_1 = require("../WABinary");
const WAUSync_1 = require("../WAUSync");
const newsletter_1 = require("./newsletter");
const makeMessagesSocket = (config) => {
    const { logger, linkPreviewImageThumbnailWidth, generateHighQualityLinkPreview, options: axiosOptions, patchMessageBeforeSending, cachedGroupMetadata, } = config;
    const sock = (0, newsletter_1.makeNewsletterSocket)(config);
    const { ev, authState, processingMutex, signalRepository, upsertMessage, query, fetchPrivacySettings, sendNode, groupMetadata, groupToggleEphemeral, } = sock;
    const userDevicesCache = config.userDevicesCache || new node_cache_1.default({
        stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.USER_DEVICES, // 5 minutes
        useClones: false
    });
    const inFlightDeviceFetch = new Map();
    let mediaConn;
    const refreshMediaConn = async (forceGet = false) => {
        const media = await mediaConn;
        if (!media || forceGet || (new Date().getTime() - media.fetchDate.getTime()) > media.ttl * 1000) {
            mediaConn = (async () => {
                const result = await query({
                    tag: 'iq',
                    attrs: {
                        type: 'set',
                        xmlns: 'w:m',
                        to: WABinary_1.S_WHATSAPP_NET,
                    },
                    content: [{ tag: 'media_conn', attrs: {} }]
                });
                const mediaConnNode = (0, WABinary_1.getBinaryNodeChild)(result, 'media_conn');
                const node = {
                    hosts: (0, WABinary_1.getBinaryNodeChildren)(mediaConnNode, 'host').map(({ attrs }) => ({
                        hostname: attrs.hostname,
                        maxContentLengthBytes: +attrs.maxContentLengthBytes,
                    })),
                    auth: mediaConnNode.attrs.auth,
                    ttl: +mediaConnNode.attrs.ttl,
                    fetchDate: new Date()
                };
                logger.debug('fetched media conn');
                return node;
            })();
        }
        return mediaConn;
    };
    /**
     * generic send receipt function
     * used for receipts of phone call, read, delivery etc.
     * */
    const sendReceipt = async (jid, participant, messageIds, type) => {
        const node = {
            tag: 'receipt',
            attrs: {
                id: messageIds[0],
            },
        };
        const isReadReceipt = type === 'read' || type === 'read-self';
        if (isReadReceipt) {
            node.attrs.t = (0, Utils_1.unixTimestampSeconds)().toString();
        }
        if (type === 'sender' && (0, WABinary_1.isJidUser)(jid)) {
            node.attrs.recipient = jid;
            node.attrs.to = participant;
        }
        else {
            node.attrs.to = jid;
            if (participant) {
                node.attrs.participant = participant;
            }
        }
        if (type) {
            node.attrs.type = (0, WABinary_1.isJidNewsletter)(jid) ? 'read-self' : type;
        }
        const remainingMessageIds = messageIds.slice(1);
        if (remainingMessageIds.length) {
            node.content = [
                {
                    tag: 'list',
                    attrs: {},
                    content: remainingMessageIds.map(id => ({
                        tag: 'item',
                        attrs: { id }
                    }))
                }
            ];
        }
        logger.debug({ attrs: node.attrs, messageIds }, 'sending receipt for messages');
        await sendNode(node);
    };
    /** Correctly bulk send receipts to multiple chats, participants */
    const sendReceipts = async (keys, type) => {
        const recps = (0, Utils_1.aggregateMessageKeysNotFromMe)(keys);
        for (const { jid, participant, messageIds } of recps) {
            await sendReceipt(jid, participant, messageIds, type);
        }
    };
    /** Bulk read messages. Keys can be from different chats & participants */
    const readMessages = async (keys) => {
        const privacySettings = await fetchPrivacySettings();
        // based on privacy settings, we have to change the read type
        const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self';
        await sendReceipts(keys, readType);
    };
    /** Fetch all the devices we've to send a message to */
    const getUSyncDevices = async (jids, useCache, ignoreZeroDevices) => {
        var _a;
        const deviceResults = [];
        if (!useCache) {
            logger.debug('not using cache for devices');
        }
        const toFetch = [];
        const usersToFetch = new Set();
        const inFlightPromises = [];
        jids = Array.from(new Set(jids));
        for (let jid of jids) {
            const user = (_a = (0, WABinary_1.jidDecode)(jid)) === null || _a === void 0 ? void 0 : _a.user;
            jid = (0, WABinary_1.jidNormalizedUser)(jid);
            if (useCache) {
                const devices = userDevicesCache.get(user);
                if (devices) {
                    deviceResults.push(...devices);
                    logger.trace({ user }, 'using cache for devices');
                }
                else {
                    const inFlight = user ? inFlightDeviceFetch.get(user) : undefined;
                    if (inFlight) {
                        inFlightPromises.push(inFlight.then(devs => {
                            if (devs && devs.length) {
                                deviceResults.push(...devs);
                            }
                        }));
                    }
                    else {
                        toFetch.push(jid);
                        if (user) {
                            usersToFetch.add(user);
                        }
                    }
                }
            }
            else {
                toFetch.push(jid);
                if (user) {
                    usersToFetch.add(user);
                }
            }
        }
        if (inFlightPromises.length) {
            await Promise.all(inFlightPromises);
        }
        if (!toFetch.length) {
            return deviceResults;
        }
        const fetchPromise = (async () => {
            const query = new WAUSync_1.USyncQuery()
                .withContext('message')
                .withDeviceProtocol();
            for (const jid of toFetch) {
                query.withUser(new WAUSync_1.USyncUser().withId(jid));
            }
            const result = await sock.executeUSyncQuery(query);
            const deviceMap = {};
            if (result) {
                const extracted = (0, Utils_1.extractDeviceJids)(result === null || result === void 0 ? void 0 : result.list, authState.creds.me.id, ignoreZeroDevices);
                for (const item of extracted) {
                    deviceMap[item.user] = deviceMap[item.user] || [];
                    deviceMap[item.user].push(item);
                    deviceResults.push(item);
                }
                for (const key in deviceMap) {
                    userDevicesCache.set(key, deviceMap[key]);
                }
            }
            return deviceMap;
        })();
        for (const user of usersToFetch) {
            inFlightDeviceFetch.set(user, fetchPromise.then(deviceMap => deviceMap[user] || []));
        }
        try {
            await fetchPromise;
        }
        finally {
            for (const user of usersToFetch) {
                const current = inFlightDeviceFetch.get(user);
                if (current) {
                    inFlightDeviceFetch.delete(user);
                }
            }
        }
        return deviceResults;
    };
    // Cache to track JIDs that have failed session fetching to prevent infinite loops
    const failedSessionFetchCache = new Map();
    const FAILED_SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    // Cache to track recently sent messages to prevent duplicate sends
    const recentlySentMessagesCache = new node_cache_1.default({
        stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.MSG_RETRY, // 1 hour
        useClones: false,
        maxKeys: 1000 // Limit to prevent memory issues
    });
    const inFlightSessionFetch = new Map();
    
    // Cleanup function to remove expired entries from the cache
    const cleanupFailedSessionCache = () => {
        const now = Date.now();
        for (const [jid, failureTime] of failedSessionFetchCache.entries()) {
            if (now - failureTime >= FAILED_SESSION_CACHE_TTL) {
                failedSessionFetchCache.delete(jid);
            }
        }
    };
    
    // Run cleanup every 5 minutes
    const cleanupInterval = setInterval(cleanupFailedSessionCache, 5 * 60 * 1000);
    
    // Helper function to check if message was recently sent
    const wasMessageRecentlySent = (msgId, jid) => {
        const cacheKey = `${msgId}:${jid}`;
        return recentlySentMessagesCache.has(cacheKey);
    };
    
    // Helper function to mark message as recently sent
    const markMessageAsSent = (msgId, jid) => {
        const cacheKey = `${msgId}:${jid}`;
        recentlySentMessagesCache.set(cacheKey, true);
    };
    
    const assertSessions = async (jids, force) => {
        let didFetchNewSession = false;
        let jidsRequiringFetch = [];
        if (force) {
            // Filter out JIDs that have recently failed session fetching
            jidsRequiringFetch = jids.filter(jid => {
                const failureTime = failedSessionFetchCache.get(jid);
                if (failureTime && (Date.now() - failureTime) < FAILED_SESSION_CACHE_TTL) {
                    logger.debug({ jid }, 'skipping session fetch for recently failed JID');
                    return false;
                }
                return true;
            });
            
            // If all JIDs are filtered out, return early without attempting fetch
            if (jidsRequiringFetch.length === 0 && jids.length > 0) {
                logger.debug({ originalJids: jids }, 'all JIDs recently failed, skipping session fetch entirely');
                return didFetchNewSession;
            }
        }
        else {
            const addrs = jids.map(jid => (signalRepository
                .jidToSignalProtocolAddress(jid)));
            const sessions = await authState.keys.get('session', addrs);
            for (const jid of jids) {
                const signalId = signalRepository
                    .jidToSignalProtocolAddress(jid);
                if (!sessions[signalId]) {
                    // Also check if this JID recently failed
                    const failureTime = failedSessionFetchCache.get(jid);
                    if (!failureTime || (Date.now() - failureTime) >= FAILED_SESSION_CACHE_TTL) {
                        jidsRequiringFetch.push(jid);
                    }
                }
            }
        }
        if (jidsRequiringFetch.length) {
            const awaitingInflight = [];
            const uniqueJids = Array.from(new Set(jidsRequiringFetch));
            jidsRequiringFetch = [];
            for (const jid of uniqueJids) {
                const inFlight = inFlightSessionFetch.get(jid);
                if (inFlight) {
                    awaitingInflight.push(inFlight);
                }
                else {
                    jidsRequiringFetch.push(jid);
                }
            }
            logger.debug({ jidsRequiringFetch }, 'fetching sessions');
            const TOTAL_TIMEOUT_MS = 120000; // 120 seconds
            const abortController = new AbortController();
            const timeout = setTimeout(() => abortController.abort(), TOTAL_TIMEOUT_MS);
            try {
                const BATCH_SIZE = 50;
                for (let i = 0; i < jidsRequiringFetch.length; i += BATCH_SIZE) {
                    const batch = jidsRequiringFetch.slice(i, i + BATCH_SIZE);
                    try {
                        const batchPromise = (0, retry_1.retryWithBackoff)(() => query({
                            tag: 'iq',
                            attrs: {
                                xmlns: 'encrypt',
                                type: 'get',
                                to: WABinary_1.S_WHATSAPP_NET,
                            },
                            content: [
                                {
                                    tag: 'key',
                                    attrs: {},
                                    content: batch.map(jid => ({
                                        tag: 'user',
                                        attrs: { jid },
                                    }))
                                }
                            ]
                        }), {
                            retries: 4,
                            baseMs: 2000,
                            maxMs: 10000,
                            jitter: true,
                            timeoutPerAttemptMs: 25000,
                            shouldRetry: (err) => {
                                var _a;
                                const status = ((_a = err.output) === null || _a === void 0 ? void 0 : _a.statusCode) || (err === null || err === void 0 ? void 0 : err.statusCode);
                                // Don't retry "not-acceptable" (406) errors as they indicate permission issues
                                // Don't retry aborted requests as they were intentionally cancelled
                                if (status === 406 || err.message === 'aborted' || err.code === 'ABORT_ERR') {
                                    return false;
                                }
                                return !status || (status >= 500 || status === 408 || status === 429) || err.message.includes('WebSocket is not open');
                            },
                            onRetry: (err, n) => logger === null || logger === void 0 ? void 0 : logger.warn({ err, attempt: n }, 'retrying fetch sessions'),
                            signal: abortController.signal
                        });
                        for (const jid of batch) {
                            inFlightSessionFetch.set(jid, batchPromise.then(() => undefined));
                        }
                        const result = await batchPromise;
                        await (0, Utils_1.parseAndInjectE2ESessions)(result, signalRepository);
                        didFetchNewSession = true;
                        for (const jid of batch) {
                            inFlightSessionFetch.delete(jid);
                        }
                    } catch (err) {
                        // Cache failed JIDs to prevent infinite retries
                        logger.warn({ err, batch }, 'session fetch failed for batch, caching failed JIDs');
                        for (const jid of batch) {
                            failedSessionFetchCache.set(jid, Date.now());
                            inFlightSessionFetch.delete(jid);
                        }
                        // Re-throw the error so the caller knows the fetch failed
                        throw err;
                    }
                }
                if (awaitingInflight.length) {
                    await Promise.all(awaitingInflight);
                }
            } finally {
                clearTimeout(timeout);
            }
        }
        return didFetchNewSession;
    };
    const sendPeerMessage = async (protocolMessageContent, options = {}) => {
        var _a;
        if (!((_a = authState.creds.me) === null || _a === void 0 ? void 0 : _a.id)) {
            throw new boom_1.Boom('Not authenticated');
        }
        
        const protocolMessage = {
            protocolMessage: protocolMessageContent
        };
        
        const meJid = (0, WABinary_1.jidNormalizedUser)(authState.creds.me.id);
        const msgId = await relayMessage(meJid, protocolMessage, {
            additionalAttributes: {
                category: 'peer',
                // eslint-disable-next-line camelcase
                push_priority: 'high_force',
                ...options.additionalAttributes
            },
            ...options
        });
        return msgId;
    };
    
    const sendPeerDataOperationMessage = async (pdoMessage) => {
        return sendPeerMessage({
            peerDataOperationRequestMessage: pdoMessage,
            type: WAProto_1.proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE
        });
    };
    const createParticipantNodes = async (jids, message, extraAttrs) => {
        let patched = await patchMessageBeforeSending(message, jids);
        if (!Array.isArray(patched)) {
            patched = jids ? jids.map(jid => ({ recipientJid: jid, ...patched })) : [patched];
        }
        let shouldIncludeDeviceIdentity = false;
        const nodes = await Promise.all(patched.map(async (patchedMessageWithJid) => {
            const { recipientJid: jid, ...patchedMessage } = patchedMessageWithJid;
            if (!jid) {
                return {};
            }
            const bytes = (0, Utils_1.encodeWAMessage)(patchedMessage);
            const { type, ciphertext } = await signalRepository
                .encryptMessage({ jid, data: bytes });
            if (type === 'pkmsg') {
                shouldIncludeDeviceIdentity = true;
            }
            const node = {
                tag: 'to',
                attrs: { jid },
                content: [{
                        tag: 'enc',
                        attrs: {
                            v: '2',
                            type,
                            ...extraAttrs || {}
                        },
                        content: ciphertext
                    }]
            };
            return node;
        }));
        return { nodes, shouldIncludeDeviceIdentity };
    };
    const relayMessage = async (jid, message, { messageId: msgId, participant, additionalAttributes, additionalNodes, useUserDevicesCache, useCachedGroupMetadata, statusJidList }) => {
        var _a;
        const meId = authState.creds.me.id;
        let shouldIncludeDeviceIdentity = false;
        const { user, server } = (0, WABinary_1.jidDecode)(jid);
        const statusJid = 'status@broadcast';
        const isGroup = server === 'g.us';
        const isNewsletter = server === 'newsletter';
        const isStatus = jid === statusJid;
        const isLid = server === 'lid';
        msgId = msgId || (0, Utils_1.generateMessageIDV2)((_a = sock.user) === null || _a === void 0 ? void 0 : _a.id);
        
        // Check if this message was recently sent to prevent duplicate sends
        if (wasMessageRecentlySent(msgId, jid)) {
            logger.debug({ msgId, jid }, 'message recently sent, skipping duplicate send');
            return msgId;
        }
        
        useUserDevicesCache = useUserDevicesCache !== false;
        useCachedGroupMetadata = useCachedGroupMetadata !== false && !isStatus;
        const participants = [];
        const destinationJid = (!isStatus) ? (0, WABinary_1.jidEncode)(user, isLid ? 'lid' : isGroup ? 'g.us' : isNewsletter ? 'newsletter' : 's.whatsapp.net') : statusJid;
        const binaryNodeContent = [];
        const devices = [];
        const meMsg = {
            deviceSentMessage: {
                destinationJid,
                message
            },
            messageContextInfo: message.messageContextInfo
        };
        const extraAttrs = {};
        if (participant) {
            // when the retry request is not for a group
            // only send to the specific device that asked for a retry
            // otherwise the message is sent out to every device that should be a recipient
            if (!isGroup && !isStatus) {
                additionalAttributes = { ...additionalAttributes, 'device_fanout': 'false' };
            }
            const { user, device } = (0, WABinary_1.jidDecode)(participant.jid);
            devices.push({ user, device });
        }
        await authState.keys.transaction(async () => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
            const mediaType = getMediaType(message);
            if (mediaType) {
                extraAttrs['mediatype'] = mediaType;
            }
            if ((_a = (0, Utils_1.normalizeMessageContent)(message)) === null || _a === void 0 ? void 0 : _a.pinInChatMessage) {
                extraAttrs['decrypt-fail'] = 'hide';
            }
            if (isGroup || isStatus) {
                const [groupData, senderKeyMap] = await Promise.all([
                    (async () => {
                        let groupData = useCachedGroupMetadata && cachedGroupMetadata ? await cachedGroupMetadata(jid) : undefined;
                        if (groupData && Array.isArray(groupData === null || groupData === void 0 ? void 0 : groupData.participants)) {
                            logger.trace({ jid, participants: groupData.participants.length }, 'using cached group metadata');
                        }
                        else if (!isStatus) {
                            groupData = await groupMetadata(jid);
                        }
                        return groupData;
                    })(),
                    (async () => {
                        if (!participant && !isStatus) {
                            const result = await authState.keys.get('sender-key-memory', [jid]);
                            return result[jid] || {};
                        }
                        return {};
                    })()
                ]);
                if (!participant) {
                    const participantsList = (groupData && !isStatus) ? groupData.participants.map(p => p.id) : [];
                    if (isStatus && statusJidList) {
                        participantsList.push(...statusJidList);
                    }
                    if (!isStatus) {
                        additionalAttributes = {
                            ...additionalAttributes,
                            // eslint-disable-next-line camelcase
                            addressing_mode: (groupData === null || groupData === void 0 ? void 0 : groupData.addressingMode) || 'pn'
                        };
                    }
                    const additionalDevices = await getUSyncDevices(participantsList, !!useUserDevicesCache, false);
                    devices.push(...additionalDevices);
                }
                const patched = await patchMessageBeforeSending(message);
                if (Array.isArray(patched)) {
                    throw new boom_1.Boom('Per-jid patching is not supported in groups');
                }
                const bytes = (0, Utils_1.encodeWAMessage)(patched);
                const { ciphertext, senderKeyDistributionMessage } = await signalRepository.encryptGroupMessage({
                    group: destinationJid,
                    data: bytes,
                    meId,
                });
                const senderKeyJids = [];
                // ensure a connection is established with every device
                for (const { user, device } of devices) {
                    const jid = (0, WABinary_1.jidEncode)(user, (groupData === null || groupData === void 0 ? void 0 : groupData.addressingMode) === 'lid' ? 'lid' : 's.whatsapp.net', device);
                    if (!senderKeyMap[jid] || !!participant) {
                        senderKeyJids.push(jid);
                        // store that this person has had the sender keys sent to them
                        senderKeyMap[jid] = true;
                    }
                }
                // if there are some participants with whom the session has not been established
                // if there are, we re-send the senderkey
                if (senderKeyJids.length) {
                    logger.debug({ senderKeyJids }, 'sending new sender key');
                    const senderKeyMsg = {
                        senderKeyDistributionMessage: {
                            axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage,
                            groupId: destinationJid
                        }
                    };
                    await assertSessions(senderKeyJids, false);
                    const result = await createParticipantNodes(senderKeyJids, senderKeyMsg, extraAttrs);
                    shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || result.shouldIncludeDeviceIdentity;
                    participants.push(...result.nodes);
                }
                binaryNodeContent.push({
                    tag: 'enc',
                    attrs: { v: '2', type: 'skmsg' },
                    content: ciphertext
                });
                await authState.keys.set({ 'sender-key-memory': { [jid]: senderKeyMap } });
            }
            else if (isNewsletter) {
                // Message edit
                if ((_b = message.protocolMessage) === null || _b === void 0 ? void 0 : _b.editedMessage) {
                    msgId = (_c = message.protocolMessage.key) === null || _c === void 0 ? void 0 : _c.id;
                    message = message.protocolMessage.editedMessage;
                }
                // Message delete
                if (((_d = message.protocolMessage) === null || _d === void 0 ? void 0 : _d.type) === WAProto_1.proto.Message.ProtocolMessage.Type.REVOKE) {
                    msgId = (_e = message.protocolMessage.key) === null || _e === void 0 ? void 0 : _e.id;
                    message = {};
                }
                const patched = await patchMessageBeforeSending(message, []);
                if (Array.isArray(patched)) {
                    throw new boom_1.Boom('Per-jid patching is not supported in channel');
                }
                const bytes = (0, Utils_1.encodeNewsletterMessage)(patched);
                binaryNodeContent.push({
                    tag: 'plaintext',
                    attrs: mediaType ? { mediatype: mediaType } : {},
                    content: bytes
                });
            }
            else {
                const { user: meUser } = (0, WABinary_1.jidDecode)(meId);
                if (!participant) {
                    devices.push({ user });
                    if (user !== meUser) {
                        devices.push({ user: meUser });
                    }
                    if ((additionalAttributes === null || additionalAttributes === void 0 ? void 0 : additionalAttributes['category']) !== 'peer') {
                        const additionalDevices = await getUSyncDevices([meId, jid], !!useUserDevicesCache, true);
                        devices.push(...additionalDevices);
                    }
                }
                const allJids = [];
                const meJids = [];
                const otherJids = [];
                for (const { user, device } of devices) {
                    const isMe = user === meUser;
                    const jid = (0, WABinary_1.jidEncode)(isMe && isLid ? ((_g = (_f = authState.creds) === null || _f === void 0 ? void 0 : _f.me) === null || _g === void 0 ? void 0 : _g.lid.split(':')[0]) || user : user, isLid ? 'lid' : 's.whatsapp.net', device);
                    if (isMe) {
                        meJids.push(jid);
                    }
                    else {
                        otherJids.push(jid);
                    }
                    allJids.push(jid);
                }
                await assertSessions(allJids, false);
                const [{ nodes: meNodes, shouldIncludeDeviceIdentity: s1 }, { nodes: otherNodes, shouldIncludeDeviceIdentity: s2 }] = await Promise.all([
                    createParticipantNodes(meJids, meMsg, extraAttrs),
                    createParticipantNodes(otherJids, message, extraAttrs)
                ]);
                participants.push(...meNodes);
                participants.push(...otherNodes);
                shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || s1 || s2;
            }
            if (participants.length) {
                if ((additionalAttributes === null || additionalAttributes === void 0 ? void 0 : additionalAttributes['category']) === 'peer') {
                    const peerNode = (_j = (_h = participants[0]) === null || _h === void 0 ? void 0 : _h.content) === null || _j === void 0 ? void 0 : _j[0];
                    if (peerNode) {
                        binaryNodeContent.push(peerNode); // push only enc
                    }
                }
                else {
                    binaryNodeContent.push({
                        tag: 'participants',
                        attrs: {},
                        content: participants
                    });
                }
            }
            const stanza = {
                tag: 'message',
                attrs: {
                    id: msgId,
                    type: isNewsletter ? getTypeMessage(message) : 'text',
                    ...(additionalAttributes || {})
                },
                content: binaryNodeContent
            };
            // if the participant to send to is explicitly specified (generally retry recp)
            // ensure the message is only sent to that person
            // if a retry receipt is sent to everyone -- it'll fail decryption for everyone else who received the msg
            if (participant) {
                if ((0, WABinary_1.isJidGroup)(destinationJid)) {
                    stanza.attrs.to = destinationJid;
                    stanza.attrs.participant = participant.jid;
                }
                else if ((0, WABinary_1.areJidsSameUser)(participant.jid, meId)) {
                    stanza.attrs.to = participant.jid;
                    stanza.attrs.recipient = destinationJid;
                }
                else {
                    stanza.attrs.to = participant.jid;
                }
            }
            else {
                stanza.attrs.to = destinationJid;
            }
            if (shouldIncludeDeviceIdentity) {
                stanza.content.push({
                    tag: 'device-identity',
                    attrs: {},
                    content: (0, Utils_1.encodeSignedDeviceIdentity)(authState.creds.account, true)
                });
                logger.debug({ jid }, 'adding device identity');
            }
            if (additionalNodes && additionalNodes.length > 0) {
                stanza.content.push(...additionalNodes);
            }
            const content = (0, Utils_1.normalizeMessageContent)(message);
            const contentType = (0, Utils_1.getContentType)(content);
            if (((0, WABinary_1.isJidGroup)(jid) || (0, WABinary_1.isJidUser)(jid)) && (contentType === 'interactiveMessage' ||
                contentType === 'buttonsMessage' ||
                contentType === 'listMessage')) {
                const bizNode = { tag: 'biz', attrs: {} };
                if ((((_l = (_k = message === null || message === void 0 ? void 0 : message.viewOnceMessage) === null || _k === void 0 ? void 0 : _k.message) === null || _l === void 0 ? void 0 : _l.interactiveMessage) || ((_o = (_m = message === null || message === void 0 ? void 0 : message.viewOnceMessageV2) === null || _m === void 0 ? void 0 : _m.message) === null || _o === void 0 ? void 0 : _o.interactiveMessage) || ((_q = (_p = message === null || message === void 0 ? void 0 : message.viewOnceMessageV2Extension) === null || _p === void 0 ? void 0 : _p.message) === null || _q === void 0 ? void 0 : _q.interactiveMessage) || (message === null || message === void 0 ? void 0 : message.interactiveMessage)) || (((_s = (_r = message === null || message === void 0 ? void 0 : message.viewOnceMessage) === null || _r === void 0 ? void 0 : _r.message) === null || _s === void 0 ? void 0 : _s.buttonsMessage) || ((_u = (_t = message === null || message === void 0 ? void 0 : message.viewOnceMessageV2) === null || _t === void 0 ? void 0 : _t.message) === null || _u === void 0 ? void 0 : _u.buttonsMessage) || ((_w = (_v = message === null || message === void 0 ? void 0 : message.viewOnceMessageV2Extension) === null || _v === void 0 ? void 0 : _v.message) === null || _w === void 0 ? void 0 : _w.buttonsMessage) || (message === null || message === void 0 ? void 0 : message.buttonsMessage))) {
                    bizNode.content = [{
                            tag: 'interactive',
                            attrs: {
                                type: 'native_flow',
                                v: '1'
                            },
                            content: [{
                                    tag: 'native_flow',
                                    attrs: { v: '9', name: 'mixed' }
                                }]
                        }];
                }
                else if (message === null || message === void 0 ? void 0 : message.listMessage) {
                    // list message only support in private chat
                    bizNode.content = [{
                            tag: 'list',
                            attrs: {
                                type: 'product_list',
                                v: '2'
                            }
                        }];
                }
                else if (message?.interactiveMessage?.carouselMessage || 
                         message?.viewOnceMessage?.message?.interactiveMessage?.carouselMessage ||
                         message?.viewOnceMessageV2?.message?.interactiveMessage?.carouselMessage ||
                         message?.viewOnceMessageV2Extension?.message?.interactiveMessage?.carouselMessage) {
                    bizNode.content = [{
                            tag: 'interactive',
                            attrs: {
                                type: 'carousel',
                                v: '1'
                            },
                            content: [{
                                    tag: 'carousel',
                                    attrs: { v: '1' }
                                }]
                        }];
                }
                stanza.content.push(bizNode);
            }
            logger.debug({ msgId }, `sending message to ${participants.length} devices`);
            await (0, retry_1.retryWithBackoff)(({ signal }) => sendNode(stanza, { signal }), {
                retries: 2,       // Riduci i tentativi
                baseMs: 100,      // Riduci l'attesa iniziale
                maxMs: 2000,      // Riduci l'attesa massima
                jitter: true,
                timeoutPerAttemptMs: 5000,
                shouldRetry: (err) => {
                    const status = err?.output?.statusCode || err?.statusCode;
                    // retry on transient failures
                    return !status || (status >= 500 || status === 408 || status === 429);
                },
                onRetry: (err, n) => logger?.warn?.({ err, attempt: n }, 'retrying sendNode')
            });
            
            // Mark message as successfully sent to prevent duplicate sends
            markMessageAsSent(msgId, jid);
        });
        return msgId;
    };
    const getTypeMessage = (msg) => {
        if (msg.viewOnceMessage) {
            return getTypeMessage(msg.viewOnceMessage.message);
        }
        else if (msg.viewOnceMessageV2) {
            return getTypeMessage(msg.viewOnceMessageV2.message);
        }
        else if (msg.viewOnceMessageV2Extension) {
            return getTypeMessage(msg.viewOnceMessageV2Extension.message);
        }
        else if (msg.ephemeralMessage) {
            return getTypeMessage(msg.ephemeralMessage.message);
        }
        else if (msg.documentWithCaptionMessage) {
            return getTypeMessage(msg.documentWithCaptionMessage.message);
        }
        else if (msg.reactionMessage) {
            return 'reaction';
        }
        else if (msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3 || msg.pollUpdateMessage) {
            return 'poll';
        }
        else if (getMediaType(msg)) {
            return 'media';
        }
        else {
            return 'text';
        }
    };
    const getMediaType = (message) => {
        if (message.imageMessage) {
            return 'image';
        }
        else if (message.videoMessage) {
            return message.videoMessage.gifPlayback ? 'gif' : 'video';
        }
        else if (message.audioMessage) {
            return message.audioMessage.ptt ? 'ptt' : 'audio';
        }
        else if (message.contactMessage) {
            return 'vcard';
        }
        else if (message.documentMessage) {
            return 'document';
        }
        else if (message.contactsArrayMessage) {
            return 'contact_array';
        }
        else if (message.liveLocationMessage) {
            return 'livelocation';
        }
        else if (message.stickerMessage) {
            return 'sticker';
        }
        else if (message.listMessage) {
            return 'list';
        }
        else if (message.listResponseMessage) {
            return 'list_response';
        }
        else if (message.buttonsResponseMessage) {
            return 'buttons_response';
        }
        else if (message.orderMessage) {
            return 'order';
        }
        else if (message.productMessage) {
            return 'product';
        }
        else if (message.interactiveResponseMessage) {
            return 'native_flow_response';
        }
        else if (message.groupInviteMessage) {
            return 'url';
        }
    };
    const getPrivacyTokens = async (jids) => {
        const t = (0, Utils_1.unixTimestampSeconds)().toString();
        const result = await query({
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'privacy'
            },
            content: [
                {
                    tag: 'tokens',
                    attrs: {},
                    content: jids.map(jid => ({
                        tag: 'token',
                        attrs: {
                            jid: (0, WABinary_1.jidNormalizedUser)(jid),
                            t,
                            type: 'trusted_contact'
                        }
                    }))
                }
            ]
        });
        return result;
    };
     const waUploadToServer = (0, Utils_1.getWAUploadToServer)(config, refreshMediaConn);
     const waitForMsgMediaUpdate = (0, Utils_1.bindWaitForEvent)(ev, 'messages.media-update');
     return {
         ...sock,
         getPrivacyTokens,
         assertSessions,
         relayMessage,
         sendReceipt,
         sendReceipts,
         readMessages,
         sendPeerDataOperationMessage,
         sendPeerMessage,
         getUSyncDevices,
         getFailedSessionCache: () => failedSessionFetchCache,
         getFailedSessionCacheTTL: () => FAILED_SESSION_CACHE_TTL,
         getRecentlySentMessagesCache: () => recentlySentMessagesCache,
        wasMessageRecentlySent,
        markMessageAsSent,
        sendMessage: async (jid, content, options = {}) => {
            var _a, _b, _c;
            const userJid = authState.creds.me.id;
            if (!options.ephemeralExpiration) {
                if ((0, WABinary_1.isJidGroup)(jid)) {
                    const useCache = options.useCachedGroupMetadata !== false;
                    const groupData = (useCache && cachedGroupMetadata) ? await cachedGroupMetadata(jid) : await groupMetadata(jid);
                    options.ephemeralExpiration = (groupData === null || groupData === void 0 ? void 0 : groupData.ephemeralDuration) || 0;
                }
            }
            if (typeof content === 'object' &&
                'disappearingMessagesInChat' in content &&
                typeof content['disappearingMessagesInChat'] !== 'undefined' &&
                (0, WABinary_1.isJidGroup)(jid)) {
                const { disappearingMessagesInChat } = content;
                const value = typeof disappearingMessagesInChat === 'boolean' ?
                    (disappearingMessagesInChat ? Defaults_1.WA_DEFAULT_EPHEMERAL : 0) :
                    disappearingMessagesInChat;
                await groupToggleEphemeral(jid, value);
            }
            // Handle pin messages
            if (typeof content === 'object' && 'pin' in content && content.pin) {
                const pinData = typeof content.pin === 'object' ? content.pin : { key: content.pin };
                // Map type: 1 = PIN_FOR_ALL, 2 = UNPIN_FOR_ALL
                const pinType = pinData.type !== undefined ? pinData.type : (content.type !== undefined ? content.type : WAProto_1.proto.Message.PinInChatMessage.Type.PIN_FOR_ALL);
                const msgId = (0, Utils_1.generateMessageIDV2)((_c = sock.user) === null || _c === void 0 ? void 0 : _c.id);
                const pinMessage = {
                    pinInChatMessage: {
                        key: pinData.key,
                        type: pinType,
                        senderTimestampMs: Date.now()
                    }
                };
                // Add messageContextInfo only for PIN (type 1), not for UNPIN (type 2)
                if (pinType === WAProto_1.proto.Message.PinInChatMessage.Type.PIN_FOR_ALL) {
                    pinMessage.messageContextInfo = {
                        messageAddOnDurationInSecs: pinData.time || content.time || 86400, // Default 24 hours
                        messageAddOnExpiryType: WAProto_1.proto.MessageContextInfo.MessageAddonExpiryType.STATIC
                    };
                }
                const fullMsg = {
                    key: {
                        remoteJid: jid,
                        fromMe: true,
                        id: msgId,
                        participant: userJid
                    },
                    message: pinMessage,
                    messageTimestamp: (0, Utils_1.unixTimestampSeconds)()
                };
                await relayMessage(jid, fullMsg.message, { //oopsie, questo è il fix per il pin 😿
                    messageId: fullMsg.key.id,
                    useCachedGroupMetadata: options.useCachedGroupMetadata,
                    additionalAttributes: {
                        edit: '2',
                        ...(options.additionalAttributes || {})
                    }
                });
                if (config.emitOwnEvents) {
                    process.nextTick(() => {
                        processingMutex.mutex(() => (upsertMessage(fullMsg, 'append')));
                    });
                }
                return fullMsg;
            }
            if (typeof content === 'object' && 'album' in content && content.album) {
                const { album, caption } = content;
                if (caption && !album[0].caption) {
                    album[0].caption = caption;
                }
                let mediaHandle;
                let mediaMsg;
                const albumMsg = (0, Utils_1.generateWAMessageFromContent)(jid, {
                    albumMessage: {
                        expectedImageCount: album.filter(item => 'image' in item).length,
                        expectedVideoCount: album.filter(item => 'video' in item).length
                    }
                }, { userJid, ...options });
                await relayMessage(jid, albumMsg.message, {
                    messageId: albumMsg.key.id
                });
                for (const i in album) {
                    const media = album[i];
                    if ('image' in media) {
                        mediaMsg = await (0, Utils_1.generateWAMessage)(jid, {
                            image: media.image,
                            ...(media.caption ? { caption: media.caption } : {}),
                            ...options
                        }, {
                            userJid,
                            upload: async (readStream, opts) => {
                                const up = await waUploadToServer(readStream, { ...opts, newsletter: (0, WABinary_1.isJidNewsletter)(jid) });
                                mediaHandle = up.handle;
                                return up;
                            },
                            ...options,
                        });
                    }
                    else if ('video' in media) {
                        mediaMsg = await (0, Utils_1.generateWAMessage)(jid, {
                            video: media.video,
                            ...(media.caption ? { caption: media.caption } : {}),
                            ...(media.gifPlayback !== undefined ? { gifPlayback: media.gifPlayback } : {}),
                            ...options
                        }, {
                            userJid,
                            upload: async (readStream, opts) => {
                                const up = await waUploadToServer(readStream, { ...opts, newsletter: (0, WABinary_1.isJidNewsletter)(jid) });
                                mediaHandle = up.handle;
                                return up;
                            },
                            ...options,
                        });
                    }
                    if (mediaMsg) {
                        mediaMsg.message.messageContextInfo = {
                            messageSecret: (0, crypto_1.randomBytes)(32),
                            messageAssociation: {
                                associationType: 1,
                                parentMessageKey: albumMsg.key
                            }
                        };
                    }
                    await relayMessage(jid, mediaMsg.message, {
                        messageId: mediaMsg.key.id
                    });
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                return albumMsg;
            }
            else {
                let mediaHandle;
                const fullMsg = await (0, Utils_1.generateWAMessage)(jid, content, {
                    logger,
                    userJid,
                    getUrlInfo: text => (0, link_preview_1.getUrlInfo)(text, {
                        thumbnailWidth: linkPreviewImageThumbnailWidth,
                        fetchOpts: {
                            timeout: 3000,
                            ...axiosOptions || {}
                        },
                        logger,
                        uploadImage: generateHighQualityLinkPreview
                            ? waUploadToServer
                            : undefined
                    }),
                    getProfilePicUrl: sock.profilePictureUrl,
                    upload: async (readStream, opts) => {
                        const up = await waUploadToServer(readStream, { ...opts, newsletter: (0, WABinary_1.isJidNewsletter)(jid) });
                        mediaHandle = up.handle;
                        return up;
                    },
                    mediaCache: config.mediaCache,
                    options: config.options,
                    messageId: (0, Utils_1.generateMessageIDV2)((_c = sock.user) === null || _c === void 0 ? void 0 : _c.id),
                    ...options,
                });
                const isDeleteMsg = 'delete' in content && !!content.delete;
                const isEditMsg = 'edit' in content && !!content.edit;
                const isPinMsg = 'pin' in content && !!content.pin;
                const isKeepMsg = 'keep' in content && content.keep;
                const isPollMessage = 'poll' in content && !!content.poll;
                const isAiMsg = 'ai' in content && !!content.ai;
                const isAiRichResponseMsg = 'richResponse' in content && !!content.richResponse;
                const additionalAttributes = {};
                const additionalNodes = [];
                // required for delete
                if (isDeleteMsg) {
                    // if the chat is a group, and I am not the author, then delete the message as an admin
                    if (((0, WABinary_1.isJidGroup)(content.delete.remoteJid) && !content.delete.fromMe) || (0, WABinary_1.isJidNewsletter)(jid)) {
                        additionalAttributes.edit = '8';
                    }
                    else {
                        additionalAttributes.edit = '7';
                    }
                    // required for edit message
                }
                else if (isEditMsg) {
                    additionalAttributes.edit = (0, WABinary_1.isJidNewsletter)(jid) ? '3' : '1';
                    // required for pin message
                }
                else if (isPinMsg) {
                    additionalAttributes.edit = '2';
                    // required for keep message
                }
                else if (isKeepMsg) {
                    additionalAttributes.edit = '6';
                    // required for polling message
                }
                else if (isPollMessage) {
                    additionalNodes.push({
                        tag: 'meta',
                        attrs: {
                            polltype: 'creation'
                        },
                    });
                    // required to display AI icon on message
                }
                else if (isAiMsg || isAiRichResponseMsg) {
                    additionalNodes.push({
                        attrs: {
                            biz_bot: '1'
                        },
                        tag: "bot"
                    });
                }
                if (mediaHandle) {
                    additionalAttributes['media_id'] = mediaHandle;
                }
                if ('cachedGroupMetadata' in options) {
                    logger.warn('cachedGroupMetadata in sendMessage are deprecated, now cachedGroupMetadata is part of the socket config.');
                }
                await relayMessage(jid, fullMsg.message, { messageId: fullMsg.key.id, useCachedGroupMetadata: options.useCachedGroupMetadata, additionalAttributes, additionalNodes: (isAiMsg || isAiRichResponseMsg) ? additionalNodes : options.additionalNodes, statusJidList: options.statusJidList });
                if (config.emitOwnEvents) {
                    process.nextTick(() => {
                        processingMutex.mutex(() => (upsertMessage(fullMsg, 'append')));
                    });
                }
                return fullMsg;
            }
        }
    };
    
    // Import interactive methods
    const { makeInteractiveSocket } = require('./messages-interactive');
    const interactiveSocket = makeInteractiveSocket(config);
    
    return {
        ...sock,
        ...interactiveSocket,
        sendMessage
    };
};
exports.makeMessagesSocket = makeMessagesSocket;