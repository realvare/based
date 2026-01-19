"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeChatsSocket = void 0;
const boom_1 = require("@hapi/boom");
const node_cache_1 = __importDefault(require("@cacheable/node-cache"));
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const Types_1 = require("../Types");
const Utils_1 = require("../Utils");
const make_mutex_1 = require("../Utils/make-mutex");
const process_message_1 = __importDefault(require("../Utils/process-message"));
const WABinary_1 = require("../WABinary");
const WAUSync_1 = require("../WAUSync");
const usync_1 = require("./usync");
const retry_1 = require("../Utils/retry");
const MAX_SYNC_ATTEMPTS = 2;
const APP_STATE_RESYNC_COOLDOWN_MS = 60000;
const makeChatsSocket = (config) => {
    const { logger, markOnlineOnConnect, fireInitQueries, appStateMacVerification, shouldIgnoreJid, shouldSyncHistoryMessage, } = config;
    const sock = (0, usync_1.makeUSyncSocket)(config);
    const { ev, ws, authState, generateMessageTag, sendNode, query, onUnexpectedError, } = sock;
    let privacySettings;
    let needToFlushWithAppStateSync = false;
    let pendingAppStateSync = false;
    let lastSelfPresenceType;
    let lastSelfPresenceTs = 0;
    /** this mutex ensures that the notifications (receipts, messages etc.) are processed in order */
    const processingMutex = (0, make_mutex_1.makeMutex)();
    const placeholderResendCache = config.placeholderResendCache || new node_cache_1.default({
        stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.MSG_RETRY, // 1 hour
        useClones: false
    });
    if (!config.placeholderResendCache) {
        config.placeholderResendCache = placeholderResendCache;
    }
    const profilePictureUrlCache = config.profilePictureUrlCache || new node_cache_1.default({
        stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.PROFILE_PIC,
        useClones: false
    });
    if (!config.profilePictureUrlCache) {
        config.profilePictureUrlCache = profilePictureUrlCache;
    }
    const inFlightProfilePictureUrl = new Map();
    const resolveJid = WABinary_1.resolveJid;
    /** helper function to fetch the given app state sync key */
    const getAppStateSyncKey = async (keyId) => {
        const { [keyId]: key } = await authState.keys.get('app-state-sync-key', [keyId]);
        return key;
    };
    const fetchPrivacySettings = async (force = false) => {
        if (!privacySettings || force) {
            const { content } = await query({
                tag: 'iq',
                attrs: {
                    xmlns: 'privacy',
                    to: WABinary_1.S_WHATSAPP_NET,
                    type: 'get'
                },
                content: [
                    { tag: 'privacy', attrs: {} }
                ]
            });
            privacySettings = (0, WABinary_1.reduceBinaryNodeToDictionary)(content === null || content === void 0 ? void 0 : content[0], 'category');
        }
        return privacySettings;
    };
    /** helper function to run a privacy IQ query */
    const privacyQuery = async (name, value) => {
        await query({
            tag: 'iq',
            attrs: {
                xmlns: 'privacy',
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set'
            },
            content: [{
                    tag: 'privacy',
                    attrs: {},
                    content: [
                        {
                            tag: 'category',
                            attrs: { name, value }
                        }
                    ]
                }]
        });
    };
    const updateMessagesPrivacy = async (value) => {
        await privacyQuery('messages', value);
    };
    const updateCallPrivacy = async (value) => {
        await privacyQuery('calladd', value);
    };
    const updateLastSeenPrivacy = async (value) => {
        await privacyQuery('last', value);
    };
    const updateOnlinePrivacy = async (value) => {
        await privacyQuery('online', value);
    };
    const updateProfilePicturePrivacy = async (value) => {
        await privacyQuery('profile', value);
    };
    const updateStatusPrivacy = async (value) => {
        await privacyQuery('status', value);
    };
    const updateReadReceiptsPrivacy = async (value) => {
        await privacyQuery('readreceipts', value);
    };
    const updateGroupsAddPrivacy = async (value) => {
        await privacyQuery('groupadd', value);
    };
    const updateDefaultDisappearingMode = async (duration) => {
        await query({
            tag: 'iq',
            attrs: {
                xmlns: 'disappearing_mode',
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set'
            },
            content: [{
                    tag: 'disappearing_mode',
                    attrs: {
                        duration: duration.toString()
                    }
                }]
        });
    };
    const getBotListV2 = async () => {
        const resp = await query({
            tag: 'iq',
            attrs: {
                xmlns: 'bot',
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'get'
            },
            content: [{
                    tag: 'bot',
                    attrs: {
                        v: '2'
                    }
                }]
        });
        const botNode = (0, WABinary_1.getBinaryNodeChild)(resp, 'bot');
        const botList = [];
        for (const section of (0, WABinary_1.getBinaryNodeChildren)(botNode, 'section')) {
            if (section.attrs.type === 'all') {
                for (const bot of (0, WABinary_1.getBinaryNodeChildren)(section, 'bot')) {
                    botList.push({
                        jid: resolveJid(bot.attrs.jid),
                        personaId: bot.attrs['persona_id']
                    });
                }
            }
        }
        return botList;
    };
    const onWhatsApp = async (...jids) => {
        const usyncQuery = new WAUSync_1.USyncQuery()
            .withContactProtocol()
            .withLIDProtocol();
        for (const jid of jids) {
            if (jid.includes('@')) {
                usyncQuery.withUser(new WAUSync_1.USyncUser().withId(resolveJid(jid)));
            } else {
                const phone = `+${jid}`;
                usyncQuery.withUser(new WAUSync_1.USyncUser().withPhone(phone));
            }
        }
        const results = await sock.executeUSyncQuery(usyncQuery);
        if (results) {
            return results.list.filter((a) => !!a.contact).map(({ contact, id, lid }) => ({ jid: resolveJid(id), exists: contact, lid }));
        }
    };
    const fetchStatus = async (...jids) => {
        jids = jids.map(resolveJid);
        const usyncQuery = new WAUSync_1.USyncQuery()
            .withStatusProtocol();
        for (const jid of jids) {
            usyncQuery.withUser(new WAUSync_1.USyncUser().withId(jid));
        }
        const result = await sock.executeUSyncQuery(usyncQuery);
        if (result) {
            return result.list;
        }
    };
    const fetchDisappearingDuration = async (...jids) => {
        jids = jids.map(resolveJid);
        const usyncQuery = new WAUSync_1.USyncQuery()
            .withDisappearingModeProtocol();
        for (const jid of jids) {
            usyncQuery.withUser(new WAUSync_1.USyncUser().withId(jid));
        }
        const result = await sock.executeUSyncQuery(usyncQuery);
        if (result) {
            return result.list;
        }
    };
    /** update the profile picture for yourself or a group */
    const updateProfilePicture = async (jid, content) => {
        jid = resolveJid(jid);
        let targetJid;
        if (!jid) {
            throw new boom_1.Boom('Illegal no-jid profile update. Please specify either your ID or the ID of the chat you wish to update');
        }
        if ((0, WABinary_1.jidNormalizedUser)(jid) !== (0, WABinary_1.jidNormalizedUser)(authState.creds.me.id)) {
            targetJid = (0, WABinary_1.jidNormalizedUser)(jid); // in case it is someone other than us
        }
        const { img } = await (0, Utils_1.generateProfilePicture)(content);
        await query({
            tag: 'iq',
            attrs: {
                target: targetJid,
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'w:profile:picture'
            },
            content: [
                {
                    tag: 'picture',
                    attrs: { type: 'image' },
                    content: img
                }
            ]
        });
    };
    /** remove the profile picture for yourself or a group */
    const removeProfilePicture = async (jid) => {
        jid = resolveJid(jid);
        let targetJid;
        if (!jid) {
            throw new boom_1.Boom('Illegal no-jid profile update. Please specify either your ID or the ID of the chat you wish to update');
        }
        if ((0, WABinary_1.jidNormalizedUser)(jid) !== (0, WABinary_1.jidNormalizedUser)(authState.creds.me.id)) {
            targetJid = (0, WABinary_1.jidNormalizedUser)(jid); // in case it is someone other than us
        }
        await query({
            tag: 'iq',
            attrs: {
                target: targetJid,
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'w:profile:picture'
            }
        });
    };
    /** update the profile status for yourself */
    const updateProfileStatus = async (status) => {
        await query({
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'status'
            },
            content: [
                {
                    tag: 'status',
                    attrs: {},
                    content: Buffer.from(status, 'utf-8')
                }
            ]
        });
    };
    const updateProfileName = async (name) => {
        await chatModify({ pushNameSetting: name }, '');
    };
    const fetchBlocklist = async () => {
        const result = await query({
            tag: 'iq',
            attrs: {
                xmlns: 'blocklist',
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'get'
            }
        });
        const listNode = (0, WABinary_1.getBinaryNodeChild)(result, 'list');
        return (0, WABinary_1.getBinaryNodeChildren)(listNode, 'item')
            .map(n => resolveJid(n.attrs.jid));
    };
    const updateBlockStatus = async (jid, action) => {
        jid = resolveJid(jid);
        await query({
            tag: 'iq',
            attrs: {
                xmlns: 'blocklist',
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set'
            },
            content: [
                {
                    tag: 'item',
                    attrs: {
                        action,
                        jid
                    }
                }
            ]
        });
    };
    const reportUser = async (jid, reason = 'spam', waitForAckMs = 5000) => {
        jid = resolveJid(jid);
        const reasonCodes = {
            'spam': 1,
            'harassment': 2,
            'impersonation': 3,
            'scam': 4,
            'other': 5
        };
        const reasonCode = reasonCodes[reason] || 1;
        const reportTo = WABinary_1.S_WHATSAPP_NET.replace(/^@/, '');
        const node = {
            tag: 'iq',
            attrs: {
                id: generateMessageTag(),
                xmlns: 'w:report',
                to: reportTo,
                type: 'set'
            },
            content: [
                {
                    tag: 'user',
                    attrs: {
                        jid,
                        reason: reasonCode.toString()
                    }
                }
            ]
        };
        logger.debug({ node }, 'sending report user node');
        try {
            await query(node, waitForAckMs);
            logger.info({ jid, reason }, 'reported user (ack received)');
            return true;
        }
        catch (err) {
            const statusCode = err?.output?.statusCode || err?.statusCode;
            const isTimeout = statusCode === 408 || (err?.message && err.message.toLowerCase().includes('timed out'));
            if (isTimeout) {
                logger.warn({ jid, reason }, 'reported user (no ack; request likely sent)');
                return false;
            }
            throw err;
        }
    };
    const reportMessage = async (jid, messageId, reason = 'spam', participantJid, waitForAckMs = 5000) => {
        jid = resolveJid(jid);
        if (participantJid) {
            participantJid = resolveJid(participantJid);
        }
        const reasonCodes = {
            'spam': 1,
            'harassment': 2,
            'impersonation': 3,
            'scam': 4,
            'other': 5
        };
        const reasonCode = reasonCodes[reason] || 1;
        const reportTo = WABinary_1.S_WHATSAPP_NET.replace(/^@/, '');
        const msgAttrs = {
            id: messageId,
            reason: reasonCode.toString()
        };
        if (participantJid) {
            msgAttrs.participant = participantJid;
        }
        const node = {
            tag: 'iq',
            attrs: {
                id: generateMessageTag(),
                xmlns: 'w:report',
                to: reportTo,
                type: 'set'
            },
            content: [
                {
                    tag: 'message',
                    attrs: msgAttrs
                }
            ]
        };
        logger.debug({ node }, 'sending report message node');
        try {
            await query(node, waitForAckMs);
            logger.info({ jid, messageId, reason, participantJid }, 'reported message (ack received)');
            return true;
        }
        catch (err) {
            const statusCode = err?.output?.statusCode || err?.statusCode;
            const isTimeout = statusCode === 408 || (err?.message && err.message.toLowerCase().includes('timed out'));
            if (isTimeout) {
                logger.warn({ jid, messageId, reason, participantJid }, 'reported message (no ack; request likely sent)');
                return false;
            }
            throw err;
        }
    };
    const reportAndBlockUser = async (jid, reason = 'spam', waitForAckMs = 5000) => {
        jid = resolveJid(jid);
        const ack = await reportUser(jid, reason, waitForAckMs);
        await updateBlockStatus(jid, 'block');
        logger.info({ jid, reason, ack }, 'reported and blocked user');
        return ack;
    };
    const getBusinessProfile = async (jid) => {
        jid = resolveJid(jid);
        var _a, _b, _c, _d, _e, _f, _g;
        const results = await query({
            tag: 'iq',
            attrs: {
                to: 's.whatsapp.net',
                xmlns: 'w:biz',
                type: 'get'
            },
            content: [{
                    tag: 'business_profile',
                    attrs: { v: '244' },
                    content: [{
                            tag: 'profile',
                            attrs: { jid }
                        }]
                }]
        });
        const profileNode = (0, WABinary_1.getBinaryNodeChild)(results, 'business_profile');
        const profiles = (0, WABinary_1.getBinaryNodeChild)(profileNode, 'profile');
        if (profiles) {
            const address = (0, WABinary_1.getBinaryNodeChild)(profiles, 'address');
            const description = (0, WABinary_1.getBinaryNodeChild)(profiles, 'description');
            const website = (0, WABinary_1.getBinaryNodeChild)(profiles, 'website');
            const email = (0, WABinary_1.getBinaryNodeChild)(profiles, 'email');
            const category = (0, WABinary_1.getBinaryNodeChild)((0, WABinary_1.getBinaryNodeChild)(profiles, 'categories'), 'category');
            const businessHours = (0, WABinary_1.getBinaryNodeChild)(profiles, 'business_hours');
            const businessHoursConfig = businessHours
                ? (0, WABinary_1.getBinaryNodeChildren)(businessHours, 'business_hours_config')
                : undefined;
            const websiteStr = (_a = website === null || website === void 0 ? void 0 : website.content) === null || _a === void 0 ? void 0 : _a.toString();
            return {
                wid: (_b = profiles.attrs) === null || _b === void 0 ? void 0 : _b.jid,
                address: (_c = address === null || address === void 0 ? void 0 : address.content) === null || _c === void 0 ? void 0 : _c.toString(),
                description: ((_d = description === null || description === void 0 ? void 0 : description.content) === null || _d === void 0 ? void 0 : _d.toString()) || '',
                website: websiteStr ? [websiteStr] : [],
                email: (_e = email === null || email === void 0 ? void 0 : email.content) === null || _e === void 0 ? void 0 : _e.toString(),
                category: (_f = category === null || category === void 0 ? void 0 : category.content) === null || _f === void 0 ? void 0 : _f.toString(),
                'business_hours': {
                    timezone: (_g = businessHours === null || businessHours === void 0 ? void 0 : businessHours.attrs) === null || _g === void 0 ? void 0 : _g.timezone,
                    'business_config': businessHoursConfig === null || businessHoursConfig === void 0 ? void 0 : businessHoursConfig.map(({ attrs }) => attrs)
                }
            };
        }
    };
    const cleanDirtyBits = async (type, fromTimestamp) => {
        logger.info({ fromTimestamp }, 'clean dirty bits ' + type);
        await sendNode({
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'urn:xmpp:whatsapp:dirty',
                id: generateMessageTag(),
            },
            content: [
                {
                    tag: 'clean',
                    attrs: {
                        type,
                        ...(fromTimestamp ? { timestamp: fromTimestamp.toString() } : null),
                    }
                }
            ]
        });
    };
    const newAppStateChunkHandler = (isInitialSync) => {
        return {
            onMutation(mutation) {
                (0, Utils_1.processSyncAction)(mutation, ev, authState.creds.me, isInitialSync ? { accountSettings: authState.creds.accountSettings } : undefined, logger);
            }
        };
    };
    const appStateResyncCooldown = new Map();
    const resyncAppState = ev.createBufferedFunction(async (collections, isInitialSync) => {
        const now = Date.now();
        const collectionsToSync = collections.filter(name => {
            const until = appStateResyncCooldown.get(name) || 0;
            return until <= now;
        });
        if (!collectionsToSync.length) {
            return;
        }
        // we use this to determine which events to fire
        // otherwise when we resync from scratch -- all notifications will fire
        const initialVersionMap = {};
        const globalMutationMap = {};
        await authState.keys.transaction(async () => {
            var _a;
            const collectionsToHandle = new Set(collectionsToSync);
            // in case something goes wrong -- ensure we don't enter a loop that cannot be exited from
            const attemptsMap = {};
            // keep executing till all collections are done
            // sometimes a single patch request will not return all the patches (God knows why)
            // so we fetch till they're all done (this is determined by the "has_more_patches" flag)
            while (collectionsToHandle.size) {
                const states = {};
                const nodes = [];
                for (const name of collectionsToHandle) {
                    const result = await authState.keys.get('app-state-sync-version', [name]);
                    let state = result[name];
                    if (state) {
                        if (typeof initialVersionMap[name] === 'undefined') {
                            initialVersionMap[name] = state.version;
                        }
                    }
                    else {
                        state = (0, Utils_1.newLTHashState)();
                    }
                    states[name] = state;
                    logger.info(`resyncing ${name} from v${state.version}`);
                    nodes.push({
                        tag: 'collection',
                        attrs: {
                            name,
                            version: state.version.toString(),
                            // return snapshot if being synced from scratch
                            'return_snapshot': (!state.version).toString()
                        }
                    });
                }
                const result = await query({
                    tag: 'iq',
                    attrs: {
                        to: WABinary_1.S_WHATSAPP_NET,
                        xmlns: 'w:sync:app:state',
                        type: 'set'
                    },
                    content: [
                        {
                            tag: 'sync',
                            attrs: {},
                            content: nodes
                        }
                    ]
                });
                // extract from binary node
                const decoded = await (0, Utils_1.extractSyncdPatches)(result, config === null || config === void 0 ? void 0 : config.options);
                for (const key in decoded) {
                    const name = key;
                    const { patches, hasMorePatches, snapshot } = decoded[name];
                    try {
                        if (snapshot) {
                            const { state: newState, mutationMap } = await (0, Utils_1.decodeSyncdSnapshot)(name, snapshot, getAppStateSyncKey, initialVersionMap[name], appStateMacVerification.snapshot);
                            states[name] = newState;
                            Object.assign(globalMutationMap, mutationMap);
                            logger.info(`restored state of ${name} from snapshot to v${newState.version} with mutations`);
                            await authState.keys.set({ 'app-state-sync-version': { [name]: newState } });
                        }
                        // only process if there are syncd patches
                        if (patches.length) {
                            const { state: newState, mutationMap } = await (0, Utils_1.decodePatches)(name, patches, states[name], getAppStateSyncKey, config.options, initialVersionMap[name], logger, appStateMacVerification.patch);
                            await authState.keys.set({ 'app-state-sync-version': { [name]: newState } });
                            logger.info(`synced ${name} to v${newState.version}`);
                            initialVersionMap[name] = newState.version;
                            Object.assign(globalMutationMap, mutationMap);
                        }
                        if (hasMorePatches) {
                            logger.info(`${name} has more patches...`);
                        }
                        else { // collection is done with sync
                            collectionsToHandle.delete(name);
                        }
                    }
                    catch (error) {
                        // if retry attempts overshoot
                        // or key not found
                        const isIrrecoverableError = attemptsMap[name] >= MAX_SYNC_ATTEMPTS
                            || ((_a = error.output) === null || _a === void 0 ? void 0 : _a.statusCode) === 404
                            || error.name === 'TypeError';
                        logger.info({ name, error: error.stack }, `failed to sync state from version${isIrrecoverableError ? '' : ', removing and trying from scratch'}`);
                        await authState.keys.set({ 'app-state-sync-version': { [name]: null } });
                        if (((_a = error.output) === null || _a === void 0 ? void 0 : _a.statusCode) === 404) {
                            appStateResyncCooldown.set(name, Date.now() + APP_STATE_RESYNC_COOLDOWN_MS);
                        }
                        // increment number of retries
                        attemptsMap[name] = (attemptsMap[name] || 0) + 1;
                        if (isIrrecoverableError) {
                            // stop retrying
                            collectionsToHandle.delete(name);
                        }
                    }
                }
            }
        });
        const { onMutation } = newAppStateChunkHandler(isInitialSync);
        for (const key in globalMutationMap) {
            onMutation(globalMutationMap[key]);
        }
    });
    /**
     * fetch the profile picture of a user/group
     * type = "preview" for a low res picture
     * type = "image for the high res picture"
     */
    const profilePictureUrl = async (jid, type = 'preview', timeoutMs) => {
        jid = resolveJid(jid);
        var _a;
        jid = (0, WABinary_1.jidNormalizedUser)(jid);
        const cacheKey = `${jid}:${type}`;
        const cached = profilePictureUrlCache.get(cacheKey);
        if (typeof cached !== 'undefined') {
            return cached || undefined;
        }
        const inFlight = inFlightProfilePictureUrl.get(cacheKey);
        if (inFlight) {
            return inFlight;
        }
        const fetchPromise = (async () => {
            const result = await query({
                tag: 'iq',
                attrs: {
                    target: jid,
                    to: WABinary_1.S_WHATSAPP_NET,
                    type: 'get',
                    xmlns: 'w:profile:picture'
                },
                content: [
                    { tag: 'picture', attrs: { type, query: 'url' } }
                ]
            }, timeoutMs);
            const child = (0, WABinary_1.getBinaryNodeChild)(result, 'picture');
            const url = (_a = child === null || child === void 0 ? void 0 : child.attrs) === null || _a === void 0 ? void 0 : _a.url;
            profilePictureUrlCache.set(cacheKey, url || null);
            return url;
        })();
        inFlightProfilePictureUrl.set(cacheKey, fetchPromise);
        try {
            return await fetchPromise;
        }
        finally {
            inFlightProfilePictureUrl.delete(cacheKey);
        }
    };
    const sendPresenceUpdate = async (type, toJid) => {
        toJid = resolveJid(toJid);
        const me = authState.creds.me;
        const retryOptions = {
            retries: 2,
            baseMs: 1000,
            maxMs: 5000,
            jitter: true,
            timeoutPerAttemptMs: 10000,
            shouldRetry: (err) => {
                if (err.message.includes('WebSocket is not open')) {
                    return false;
                }
                var _a;
                const status = ((_a = err.output) === null || _a === void 0 ? void 0 : _a.statusCode) || (err === null || err === void 0 ? void 0 : err.statusCode);
                return !status || (status >= 500 || status === 408 || status === 429);
            },
            onRetry: (err, n) => logger === null || logger === void 0 ? void 0 : logger.warn({ err, attempt: n }, 'retrying presence update')
        };
        if (type === 'available' || type === 'unavailable') {
            if (!me.name) {
                logger.warn('no name present, ignoring presence update request...');
                return;
            }
            if (!toJid) {
                const now = Date.now();
                if (lastSelfPresenceType === type && (now - lastSelfPresenceTs) < 3000) {
                    return;
                }
                lastSelfPresenceType = type;
                lastSelfPresenceTs = now;
            }
            ev.emit('connection.update', { isOnline: type === 'available' });
            await (0, retry_1.retryWithBackoff)(() => sendNode({
                tag: 'presence',
                attrs: {
                    name: me.name.replace(/@/g, ''),
                    type
                }
            }), retryOptions);
        }
        else {
            const { server } = (0, WABinary_1.jidDecode)(toJid);
            const isLid = server === 'lid';
            await (0, retry_1.retryWithBackoff)(() => sendNode({
                tag: 'chatstate',
                attrs: {
                    from: isLid ? me.lid : me.id,
                    to: toJid,
                },
                content: [
                    {
                        tag: type === 'recording' ? 'composing' : type,
                        attrs: type === 'recording' ? { media: 'audio' } : {}
                    }
                ]
            }), retryOptions);
        }
    };
    /**
     * @param toJid the jid to subscribe to
     * @param tcToken token for subscription, use if present
     */
    const presenceSubscribe = (toJid, tcToken) => (sendNode({
        tag: 'presence',
        attrs: {
            to: resolveJid(toJid),
            id: generateMessageTag(),
            type: 'subscribe'
        },
        content: tcToken
            ? [
                {
                    tag: 'tctoken',
                    attrs: {},
                    content: tcToken
                }
            ]
            : undefined
    }));
    const handlePresenceUpdate = ({ tag, attrs, content }) => {
        var _a;
        let presence;
        const jid = resolveJid(attrs.from);
        const participant = resolveJid(attrs.participant || attrs.from);
        if (shouldIgnoreJid(jid) && jid != '@s.whatsapp.net') {
            return;
        }
        if (tag === 'presence') {
            presence = {
                lastKnownPresence: attrs.type === 'unavailable' ? 'unavailable' : 'available',
                lastSeen: attrs.last && attrs.last !== 'deny' ? +attrs.last : undefined
            };
        }
        else if (Array.isArray(content)) {
            const [firstChild] = content;
            let type = firstChild.tag;
            if (type === 'paused') {
                type = 'available';
            }
            if (((_a = firstChild.attrs) === null || _a === void 0 ? void 0 : _a.media) === 'audio') {
                type = 'recording';
            }
            presence = { lastKnownPresence: type };
        }
        else {
            logger.error({ tag, attrs, content }, 'recv invalid presence node');
        }
        if (presence) {
            ev.emit('presence.update', { id: jid, presences: { [participant]: presence } });
        }
    };
    const appPatch = async (patchCreate) => {
        const name = patchCreate.type;
        const myAppStateKeyId = authState.creds.myAppStateKeyId;
        if (!myAppStateKeyId) {
            throw new boom_1.Boom('App state key not present!', { statusCode: 400 });
        }
        let initial;
        let encodeResult;
        await processingMutex.mutex(async () => {
            await authState.keys.transaction(async () => {
                logger.debug({ patch: patchCreate }, 'applying app patch');
                await resyncAppState([name], false);
                const { [name]: currentSyncVersion } = await authState.keys.get('app-state-sync-version', [name]);
                initial = currentSyncVersion || (0, Utils_1.newLTHashState)();
                encodeResult = await (0, Utils_1.encodeSyncdPatch)(patchCreate, myAppStateKeyId, initial, getAppStateSyncKey);
                const { patch, state } = encodeResult;
                const node = {
                    tag: 'iq',
                    attrs: {
                        to: WABinary_1.S_WHATSAPP_NET,
                        type: 'set',
                        xmlns: 'w:sync:app:state'
                    },
                    content: [
                        {
                            tag: 'sync',
                            attrs: {},
                            content: [
                                {
                                    tag: 'collection',
                                    attrs: {
                                        name,
                                        version: (state.version - 1).toString(),
                                        'return_snapshot': 'false'
                                    },
                                    content: [
                                        {
                                            tag: 'patch',
                                            attrs: {},
                                            content: WAProto_1.proto.SyncdPatch.encode(patch).finish()
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                };
                await query(node);
                await authState.keys.set({ 'app-state-sync-version': { [name]: state } });
            });
        });
        if (config.emitOwnEvents) {
            const { onMutation } = newAppStateChunkHandler(false);
            const { mutationMap } = await (0, Utils_1.decodePatches)(name, [{ ...encodeResult.patch, version: { version: encodeResult.state.version }, }], initial, getAppStateSyncKey, config.options, undefined, logger);
            for (const key in mutationMap) {
                onMutation(mutationMap[key]);
            }
        }
    };
    /** sending non-abt props may fix QR scan fail if server expects */
    const fetchProps = async () => {
        var _a, _b, _c;
        const resultNode = await query({
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                xmlns: 'w',
                type: 'get',
            },
            content: [
                { tag: 'props', attrs: {
                        protocol: '2',
                        hash: ((_a = authState === null || authState === void 0 ? void 0 : authState.creds) === null || _a === void 0 ? void 0 : _a.lastPropHash) || ''
                    } }
            ]
        });
        const propsNode = (0, WABinary_1.getBinaryNodeChild)(resultNode, 'props');
        let props = {};
        if (propsNode) {
            if ((_b = propsNode.attrs) === null || _b === void 0 ? void 0 : _b.hash) { // on some clients, the hash is returning as undefined
                authState.creds.lastPropHash = (_c = propsNode === null || propsNode === void 0 ? void 0 : propsNode.attrs) === null || _c === void 0 ? void 0 : _c.hash;
                ev.emit('creds.update', authState.creds);
            }
            props = (0, WABinary_1.reduceBinaryNodeToDictionary)(propsNode, 'prop');
        }
        logger.debug('fetched props');
        return props;
    };
    /**
     * modify a chat -- mark unread, read etc.
     * lastMessages must be sorted in reverse chronologically
     * requires the last messages till the last message received; required for archive & unread
    */
    const chatModify = (mod, jid) => {
        jid = resolveJid(jid);
        const patch = (0, Utils_1.chatModificationToAppPatch)(mod, jid);
        return appPatch(patch);
    };
    /**
     * Star or Unstar a message
     */
    const star = (jid, messages, star) => {
        jid = resolveJid(jid);
        return chatModify({
            star: {
                messages,
                star
            }
        }, jid);
    };
    /**
     * Adds label for the chats
     */
    const addChatLabel = (jid, labelId) => {
        jid = resolveJid(jid);
        return chatModify({
            addChatLabel: {
                labelId
            }
        }, jid);
    };
    /**
     * Removes label for the chat
     */
    const removeChatLabel = (jid, labelId) => {
        jid = resolveJid(jid);
        return chatModify({
            removeChatLabel: {
                labelId
            }
        }, jid);
    };
    /**
     * Adds label for the message
     */
    const addMessageLabel = (jid, messageId, labelId) => {
        jid = resolveJid(jid);
        return chatModify({
            addMessageLabel: {
                messageId,
                labelId
            }
        }, jid);
    };
    /**
     * Removes label for the message
     */
    const removeMessageLabel = (jid, messageId, labelId) => {
        jid = resolveJid(jid);
        return chatModify({
            removeMessageLabel: {
                messageId,
                labelId
            }
        }, jid);
    };
    /**
     * queries need to be fired on connection open
     * help ensure parity with WA Web
     * */
    const executeInitQueries = async () => {
        await Promise.all([
            fetchProps(),
            fetchBlocklist(),
            fetchPrivacySettings(),
        ]);
    };
    const upsertMessage = ev.createBufferedFunction(async (msg, type) => {
        var _a, _b, _c;
        try {
            const r0 = msg?.key?.remoteJid;
            const p0 = msg?.key?.participant;

            if (r0) {
                const rd = (0, WABinary_1.jidDecode)(r0);
                if (rd?.user) {
                    // preserve LID form (original if provided, otherwise derived)
                    msg.key.remoteLid = (0, WABinary_1.isLid)(r0) ? r0 : (0, WABinary_1.jidEncode)(rd.user, 'lid');
                }
                // always expose a standard jid to consumers
                msg.key.remoteJid = (0, WABinary_1.jidNormalizedUser)((0, WABinary_1.lidToJid)(r0));
                msg.key.remoteJidNormalized = msg.key.remoteJid;
            }

            if (p0) {
                const pd = (0, WABinary_1.jidDecode)(p0);
                if (pd?.user) {
                    msg.key.participantLid = (0, WABinary_1.isLid)(p0) ? p0 : (0, WABinary_1.jidEncode)(pd.user, 'lid');
                }
                msg.key.participant = (0, WABinary_1.jidNormalizedUser)((0, WABinary_1.lidToJid)(p0));
            }
            if (msg === null || msg === void 0 ? void 0 : msg.participant) {
                msg.participant = (0, WABinary_1.jidNormalizedUser)((0, WABinary_1.lidToJid)(msg.participant));
            }
        } catch {}
        ev.emit('messages.upsert', { messages: [msg], type });
        if (!!msg.pushName) {
            let jid = msg.key.fromMe ? authState.creds.me.id : (msg.key.participant || msg.key.remoteJid);
            jid = (0, WABinary_1.jidNormalizedUser)(jid);
            if (!msg.key.fromMe) {
                ev.emit('contacts.update', [{ id: jid, notify: msg.pushName, verifiedName: msg.verifiedBizName }]);
            }
            // update our pushname too
            if (msg.key.fromMe && msg.pushName && ((_a = authState.creds.me) === null || _a === void 0 ? void 0 : _a.name) !== msg.pushName) {
                ev.emit('creds.update', { me: { ...authState.creds.me, name: msg.pushName } });
            }
        }
        const historyMsg = (0, Utils_1.getHistoryMsg)(msg.message);
        const shouldProcessHistoryMsg = historyMsg
            ? (shouldSyncHistoryMessage(historyMsg)
                && Defaults_1.PROCESSABLE_HISTORY_TYPES.includes(historyMsg.syncType))
            : false;
        if (historyMsg && !authState.creds.myAppStateKeyId) {
            logger.warn('skipping app state sync, as myAppStateKeyId is not set');
            pendingAppStateSync = true;
        }
        await Promise.all([
            (async () => {
                if (historyMsg
                    && authState.creds.myAppStateKeyId) {
                    pendingAppStateSync = false;
                    await doAppStateSync();
                }
            })(),
            (0, process_message_1.default)(msg, {
                shouldProcessHistoryMsg,
                placeholderResendCache,
                ev,
                creds: authState.creds,
                keyStore: authState.keys,
                logger,
                options: config.options,
                getMessage: config.getMessage,
            })
        ]);
        if (((_c = (_b = msg.message) === null || _b === void 0 ? void 0 : _b.protocolMessage) === null || _c === void 0 ? void 0 : _c.appStateSyncKeyShare)
            && pendingAppStateSync) {
            await doAppStateSync();
            pendingAppStateSync = false;
        }
        async function doAppStateSync() {
            if (!authState.creds.accountSyncCounter) {
                logger.info('doing initial app state sync');
                await resyncAppState(Types_1.ALL_WA_PATCH_NAMES, true);
                const accountSyncCounter = (authState.creds.accountSyncCounter || 0) + 1;
                ev.emit('creds.update', { accountSyncCounter });
                if (needToFlushWithAppStateSync) {
                    logger.debug('flushing with app state sync');
                    ev.flush();
                }
            }
        }
    });
    ws.on('CB:presence', handlePresenceUpdate);
    ws.on('CB:chatstate', handlePresenceUpdate);
    ws.on('CB:ib,,dirty', async (node) => {
        const { attrs } = (0, WABinary_1.getBinaryNodeChild)(node, 'dirty');
        const type = attrs.type;
        switch (type) {
            case 'account_sync':
                if (attrs.timestamp) {
                    let { lastAccountSyncTimestamp } = authState.creds;
                    if (lastAccountSyncTimestamp) {
                        await cleanDirtyBits('account_sync', lastAccountSyncTimestamp);
                    }
                    lastAccountSyncTimestamp = +attrs.timestamp;
                    ev.emit('creds.update', { lastAccountSyncTimestamp });
                }
                break;
            case 'groups':
                // handled in groups.ts
                break;
            default:
                logger.info({ node }, 'received unknown sync');
                break;
        }
    });
    ev.on('connection.update', ({ connection, receivedPendingNotifications, isOnline }) => {
        var _a;
        if (connection === 'open') {
            if (fireInitQueries) {
                executeInitQueries()
                    .catch(error => onUnexpectedError(error, 'init queries'));
            }
            sendPresenceUpdate(markOnlineOnConnect ? 'available' : 'unavailable')
                .catch(error => onUnexpectedError(error, 'presence update requests'));
        }
        if (receivedPendingNotifications && // if we don't have the app state key
            // we keep buffering events until we finally have
            // the key and can sync the messages
            !((_a = authState.creds) === null || _a === void 0 ? void 0 : _a.myAppStateKeyId)) {
            ev.buffer();
            needToFlushWithAppStateSync = true;
        }
        if (typeof isOnline !== 'undefined' && isOnline) {
            sendPresenceUpdate('available').catch(error => onUnexpectedError(error, 'presence update on online'));
        }
    });
    return {
        ...sock,
        getBotListV2,
        processingMutex,
        fetchPrivacySettings,
        upsertMessage,
        appPatch,
        sendPresenceUpdate,
        presenceSubscribe,
        profilePictureUrl,
        onWhatsApp,
        fetchBlocklist,
        fetchDisappearingDuration,
        fetchStatus,
        updateProfilePicture,
        removeProfilePicture,
        updateProfileStatus,
        updateProfileName,
        updateBlockStatus,
        reportUser,
        reportMessage,
        reportAndBlockUser,
        updateCallPrivacy,
        updateMessagesPrivacy,
        updateLastSeenPrivacy,
        updateOnlinePrivacy,
        updateProfilePicturePrivacy,
        updateStatusPrivacy,
        updateReadReceiptsPrivacy,
        updateGroupsAddPrivacy,
        updateDefaultDisappearingMode,
        getBusinessProfile,
        resyncAppState,
        chatModify,
        cleanDirtyBits,
        addChatLabel,
        removeChatLabel,
        addMessageLabel,
        removeMessageLabel,
        star
    };
};
exports.makeChatsSocket = makeChatsSocket;