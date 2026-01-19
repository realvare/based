"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateJid = exports.toJid = exports.getSenderLid = exports.normalizeJid = exports.isValidJid = void 0;

const WABinary_1 = require("../WABinary");
const performance_config_1 = require("./performance-config");

/**
 * Check if a JID is valid
 * @param {string} jid - The JID to validate
 * @returns {boolean} True if valid, false otherwise
 */
const isValidJid = (jid) => {
    if (!jid || typeof jid !== 'string') {
        return false;
    }

    // Basic format validation
    if (!jid.includes('@')) {
        return false;
    }

    // Check for valid server domains
    const validDomains = ['s.whatsapp.net', 'c.us', 'g.us', 'broadcast', 'lid', 'newsletter'];
    const domain = jid.split('@')[1];
    return validDomains.some(validDomain => domain === validDomain || domain.endsWith(validDomain));
};

exports.isValidJid = isValidJid;

/**
 * Normalize JID format
 * @param {string} jid - The JID to normalize
 * @returns {string} Normalized JID
 */
const normalizeJid = (jid) => {
    if (!jid) return jid;

    // Convert LID to standard JID format
    if ((0, WABinary_1.isLid)(jid)) {
        const converted = (0, WABinary_1.lidToJid)(jid);
        return converted || jid;
    }

    // Ensure consistent format
    return jid;
};

exports.normalizeJid = normalizeJid;

/**
 * Extract sender LID from message
 * @param {Object} msg - The message object
 * @returns {Object} Object containing jid, lid, and validation status
 */
const getSenderLid = (msg) => {
    try {
        if (!msg || typeof msg !== 'object') {
            return {
                jid: '',
                lid: '',
                isValid: false,
                user: '',
                timestamp: Date.now(),
                error: 'Invalid message object'
            };
        }

        // Extract from different possible fields
        const jid = msg.key?.remoteJid || msg.remoteJid || msg.from;
        const lid = msg.key?.participant || msg.participant || msg.lid;

        if (!jid || typeof jid !== 'string') {
            return {
                jid: '',
                lid: typeof lid === 'string' ? lid : '',
                isValid: false,
                user: '',
                timestamp: Date.now(),
                error: 'Missing or invalid JID'
            };
        }

        // Validate and normalize
        const normalizedJid = normalizeJid(jid);
        const isValid = isValidJid(normalizedJid);

        const decoded = (0, WABinary_1.jidDecode)(normalizedJid);
        const user = decoded?.user || normalizedJid.split('@')[0] || '';

        return {
            jid: normalizedJid,
            lid: typeof lid === 'string' ? lid : '',
            isValid: isValid,
            user,
            timestamp: Date.now(),
            ...(isValid ? {} : { error: 'Invalid JID format' })
        };
    } catch (error) {
        performance_config_1.Logger.error('Error in getSenderLid:', error);
        return {
            jid: '',
            lid: '',
            isValid: false,
            user: '',
            timestamp: Date.now(),
            error: 'Error extracting sender information'
        };
    }
};

exports.getSenderLid = getSenderLid;

/**
 * Convert LID to JID
 * @param {string} lid - The LID to convert
 * @returns {string} Converted JID
 */
const toJid = (lid) => {
    if (!lid) return lid;

    try {
        // Convert LID to JID format
        if ((0, WABinary_1.isLid)(lid)) {
            const converted = (0, WABinary_1.lidToJid)(lid);
            return converted || lid;
        }

        // If already in JID format, return as-is
        return lid;
    } catch (error) {
        performance_config_1.Logger.error('Error in toJid:', error);
        return lid;
    }
};

exports.toJid = toJid;

/**
 * Validate JID with detailed error information
 * @param {string} jid - The JID to validate
 * @returns {Object} Validation result with isValid and error message
 */
const validateJid = (jid) => {
    try {
        if (!jid) {
            return { isValid: false, error: 'JID is null or undefined' };
        }

        if (typeof jid !== 'string') {
            return { isValid: false, error: 'JID is not a string' };
        }

        if (!jid.includes('@')) {
            return { isValid: false, error: 'JID must contain @ character' };
        }

        const parts = jid.split('@');
        if (parts.length !== 2) {
            return { isValid: false, error: 'JID must have exactly one @ character' };
        }

        const [user, domain] = parts;
        if (!user || !domain) {
            return { isValid: false, error: 'JID must have both user and domain parts' };
        }

        // Check for valid domains
        const validDomains = ['s.whatsapp.net', 'c.us', 'g.us', 'broadcast', 'lid', 'newsletter'];
        const isValidDomain = validDomains.some(validDomain =>
            domain === validDomain || domain.endsWith(validDomain)
        );

        if (!isValidDomain) {
            return { isValid: false, error: `Invalid domain: ${domain}` };
        }

        return { isValid: true };

    } catch (error) {
        performance_config_1.Logger.error('Error in validateJid:', error);
        return { isValid: false, error: 'Validation error: ' + error.message };
    }
};

exports.validateJid = validateJid;
