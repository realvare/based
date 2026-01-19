"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeUSyncSocket = void 0;
const boom_1 = require("@hapi/boom");
const WABinary_1 = require("../WABinary");
const socket_1 = require("./socket");
const retry_1 = require("../Utils/retry");
const makeUSyncSocket = (config) => {
    const sock = (0, socket_1.makeSocket)(config);
    const { generateMessageTag, query, } = sock;
    const executeUSyncQuery = async (usyncQuery) => {
        if (usyncQuery.protocols.length === 0) {
            throw new boom_1.Boom('USyncQuery must have at least one protocol');
        }
        
        // Validate users and filter out invalid ones
        const validUsers = [];
        const invalidUsers = [];
        
        for (const user of usyncQuery.users) {
            // Check if user has valid identifier (either id or phone)
            if (user.id || user.phone) {
                // Additional validation for JID format if id is provided
                if (user.id) {
                    // Check if it's a valid JID format (user@server)
                    const decodedJid = (0, WABinary_1.jidDecode)(user.id);
                    if (decodedJid && decodedJid.user && decodedJid.server) {
                        validUsers.push(user);
                    } else {
                        invalidUsers.push(user);
                    }
                } else if (user.phone && typeof user.phone === 'string' && user.phone.length > 0) {
                    validUsers.push(user);
                } else {
                    invalidUsers.push(user);
                }
            } else {
                invalidUsers.push(user);
            }
        }
        
        // Log warning for invalid users
        if (invalidUsers.length > 0) {
            config.logger?.warn({
                invalidUsers: invalidUsers.map(u => ({ id: u.id, phone: u.phone })),
                totalUsers: usyncQuery.users.length,
                validUsers: validUsers.length
            }, `Found ${invalidUsers.length} invalid users in USync query, they will be excluded`);
        }
        
        // Throw warning if no valid users found
        if (validUsers.length === 0) {
            throw new boom_1.Boom('No valid users found in USync query', { statusCode: 400 });
        }
        const userNodes = validUsers.map((user) => {
            return {
                tag: 'user',
                attrs: {
                    jid: !user.phone ? user.id : undefined,
                },
                content: usyncQuery.protocols
                    .map((a) => a.getUserElement(user))
                    .filter(a => a !== null)
            };
        });
        const listNode = {
            tag: 'list',
            attrs: {},
            content: userNodes
        };
        const queryNode = {
            tag: 'query',
            attrs: {},
            content: usyncQuery.protocols.map((a) => a.getQueryElement())
        };
        const iq = {
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'get',
                xmlns: 'usync',
            },
            content: [
                {
                    tag: 'usync',
                    attrs: {
                        context: usyncQuery.context,
                        mode: usyncQuery.mode,
                        sid: generateMessageTag(),
                        last: 'true',
                        index: '0',
                    },
                    content: [
                        queryNode,
                        listNode
                    ]
                }
            ],
        };
        const result = await (0, retry_1.retryWithBackoff)(() => query(iq), {
            retries: 2,
            baseMs: 2000,
            maxMs: 10000,
            jitter: true,
            timeoutPerAttemptMs: 15000,
            shouldRetry: (err) => {
                if (err.message.includes('WebSocket is not open')) {
                    return false;
                }
                var _a;
                const status = ((_a = err.output) === null || _a === void 0 ? void 0 : _a.statusCode) || (err === null || err === void 0 ? void 0 : err.statusCode);
                return !status || (status >= 500 || status === 408 || status === 429);
            },
            onRetry: (err, n) => sock.logger.warn({ err, attempt: n }, 'retrying usync query')
        });
        return usyncQuery.parseUSyncQueryResult(result);
    };
    return {
        ...sock,
        executeUSyncQuery,
    };
};
exports.makeUSyncSocket = makeUSyncSocket;
