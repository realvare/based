"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAndConvertLidToJid = exports.validateAndCleanJid = exports.lidToJidEnhanced = exports.resolveJid = exports.lidToJid = exports.getBotJid = exports.jidNormalizedUser = exports.isJidBot = exports.isJidStatusBroadcast = exports.isJidGroup = exports.isJidNewsletter = exports.isJidBroadcast = exports.isLid = exports.assertLid = exports.isJidUser = exports.isJidMetaAi = exports.areJidsSameUser = exports.jidDecode = exports.jidEncode = exports.META_AI_JID = exports.STORIES_JID = exports.PSA_WID = exports.SERVER_JID = exports.OFFICIAL_BIZ_JID = exports.S_WHATSAPP_NET = void 0;
exports.S_WHATSAPP_NET = '@s.whatsapp.net';
exports.OFFICIAL_BIZ_JID = '16505361212@c.us';
exports.SERVER_JID = 'server@c.us';
exports.PSA_WID = '0@c.us';
exports.STORIES_JID = 'status@broadcast';
exports.META_AI_JID = '13135550002@c.us';
const jidEncode = (user, server, device, agent) => {
    return `${user || ''}${!!agent ? `_${agent}` : ''}${!!device ? `:${device}` : ''}@${server}`;
};
exports.jidEncode = jidEncode;
const jidDecode = (jid) => {
    const sepIdx = typeof jid === 'string' ? jid.indexOf('@') : -1;
    if (sepIdx < 0) {
        return undefined;
    }
    const server = jid.slice(sepIdx + 1);
    const userCombined = jid.slice(0, sepIdx);
    const [userAgent, device] = userCombined.split(':');
    const user = userAgent.split('_')[0];
    return {
        server: server,
        user,
        domainType: server === 'lid' ? 1 : 0,
        device: device ? +device : undefined
    };
};
exports.jidDecode = jidDecode;
/** is the jid a user */
const areJidsSameUser = (jid1, jid2) => {
    var _a, _b;
    return (((_a = (0, exports.jidDecode)(jid1)) === null || _a === void 0 ? void 0 : _a.user) === ((_b = (0, exports.jidDecode)(jid2)) === null || _b === void 0 ? void 0 : _b.user));
};
exports.areJidsSameUser = areJidsSameUser;
/** is the jid Meta IA */
const isJidMetaAi = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@bot'));
exports.isJidMetaAi = isJidMetaAi;
/** is the jid a user */
const isJidUser = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@s.whatsapp.net'));
exports.isJidUser = isJidUser;
/** is the jid a group */
const isLid = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@lid'));
exports.isLid = isLid;
exports.isLidUser = isLid;
/** assert the jid is a LID */
const assertLid = (jid) => {
    if (!isLid(jid)) {
        throw new Error(`JID "${jid}" is not a LID`);
    }
};
exports.assertLid = assertLid;
/** is the jid a broadcast */
const isJidBroadcast = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@broadcast'));
exports.isJidBroadcast = isJidBroadcast;
/** is the jid a newsletter */
const isJidNewsletter = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@newsletter'));
exports.isJidNewsletter = isJidNewsletter;
/** is the jid a group */
const isJidGroup = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@g.us'));
exports.isJidGroup = isJidGroup;
/** is the jid the status broadcast */
const isJidStatusBroadcast = (jid) => jid === 'status@broadcast';
exports.isJidStatusBroadcast = isJidStatusBroadcast;
const botRegexp = /^1313555\d{4}$|^131655500\d{2}$/;
const isJidBot = (jid) => (jid && botRegexp.test(jid.split('@')[0]) && jid.endsWith('@c.us'));
exports.isJidBot = isJidBot;
const jidNormalizedUser = (jid) => {
    const result = (0, exports.jidDecode)(jid);
    if (!result) {
        return '';
    }
    const { user, server } = result;
    return (0, exports.jidEncode)(user, server === 'c.us' ? 's.whatsapp.net' : server);
};
exports.jidNormalizedUser = jidNormalizedUser;
// Node.js helpers for optional dynamic bot map loading
const fs = require('fs');
const path = require('path');

// LRU cache semplice per lidToJid (leggero, senza dipendenze)
class SimpleLRU {
    constructor(maxSize = 5000, ttl = 5 * 60 * 1000) {
        this.maxSize = maxSize;
        this.ttl = ttl;
        this.map = new Map(); // mantiene l'ordine di inserimento
    }
    get(key) {
        const entry = this.map.get(key);
        if (!entry)
            return undefined;
        if (Date.now() - entry.ts > this.ttl) {
            this.map.delete(key);
            return undefined;
        }
        // promuovi a MRU
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }
    set(key, value) {
        if (this.map.has(key))
            this.map.delete(key);
        this.map.set(key, { value, ts: Date.now() });
        if (this.map.size > this.maxSize) {
            // rimuovi LRU (primo elemento)
            const it = this.map.keys();
            const lru = it.next().value;
            if (lru)
                this.map.delete(lru);
        }
    }
}

const DEFAULT_LID_CACHE_TTL = 5 * 60 * 1000; // 5 minuti
const DEFAULT_LID_CACHE_MAX = 5000;
const lidToJidCache = new SimpleLRU(DEFAULT_LID_CACHE_MAX, DEFAULT_LID_CACHE_TTL);

const lidToJid = (jid) => {
    try {
        if (!jid || typeof jid !== 'string') {
            return jid;
        }
        const cached = lidToJidCache.get(jid);
        if (cached)
            return cached;

        let result = jid;
        if (jid.endsWith('@lid')) {
            const lidPart = jid.replace('@lid', '');
            
            // Check if this LID exists in BOT_MAP first
            if (BOT_MAP.has(lidPart)) {
                result = BOT_MAP.get(lidPart) + '@s.whatsapp.net';
            } else {
                // Check if lidPart is a valid phone number (digits only, reasonable length)
                const isValidPhoneNumber = /^[0-9]+$/.test(lidPart) && lidPart.length >= 8 && lidPart.length <= 15;
                
                if (isValidPhoneNumber) {
                    result = lidPart + '@s.whatsapp.net';
                } else {
                    // Not a valid phone number, keep as LID or return original
                    result = jid; // Keep original LID if it's not a valid phone number
                }
            }
        }

        lidToJidCache.set(jid, result);
        return result;
    }
    catch (error) {
        try {
            const { Logger } = require('../Utils/performance-config');
            Logger.error('Error in lidToJid:', error && error.message ? error.message : error, 'Input:', jid);
        } catch (_) {
            // Fallback if logger is not available
        }
        return jid;
    }
};
exports.lidToJid = lidToJid;

const resolveJid = (jid) => {
    if (typeof jid === 'string' && jid.endsWith('@lid')) {
        return lidToJid(jid);
    }
    return jid;
};
exports.resolveJid = resolveJid;

/**
 * Enhanced LID to JID conversion with phone number validation
 * Validates that the phone number has a valid international format
 */
const validateAndConvertLidToJid = async (jid, onWhatsApp) => {
    try {
        if (!jid || typeof jid !== 'string') {
            return jid;
        }
        
        // First, try basic conversion
        const convertedJid = lidToJid(jid);
        
        // If it's still a LID, return as-is (invalid phone number)
        if (isLid(convertedJid)) {
            return convertedJid;
        }
        
        // If it's already a JID (not converted), validate it exists on WhatsApp
        if (!jid.endsWith('@lid') && convertedJid === jid) {
            if (onWhatsApp) {
                try {
                    const validation = await onWhatsApp(convertedJid);
                    if (validation && validation.length > 0 && validation[0].exists) {
                        return convertedJid;
                    } else {
                        // JID doesn't exist on WhatsApp, return original
                        return jid;
                    }
                } catch (error) {
                    // If validation fails, return converted JID (better than nothing)
                    return convertedJid;
                }
            } else {
                // No onWhatsApp available, return as-is
                return convertedJid;
            }
        }
        
        // For newly converted JIDs, validate they exist on WhatsApp
        if (convertedJid !== jid && onWhatsApp) {
            try {
                const validation = await onWhatsApp(convertedJid);
                if (validation && validation.length > 0 && validation[0].exists) {
                    return convertedJid;
                } else {
                    // Converted JID doesn't exist on WhatsApp, keep original LID
                    return jid;
                }
            } catch (error) {
                // If validation fails, return converted JID
                return convertedJid;
            }
        }
        
        return convertedJid;
    }
    catch (error) {
        try {
            const { Logger } = require('../Utils/performance-config');
            Logger.error('Error in validateAndConvertLidToJid:', error && error.message ? error.message : error, 'Input:', jid);
        } catch (_) {
            // ignore if logger not available
        }
        return jid;
    }
};

/**
 * Simple phone number validation based on international format
 * Checks if the number has a valid country code and reasonable length
 */
const isValidInternationalPhoneNumber = (phoneNumber) => {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        return false;
    }
    
    // Remove any non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Check length (8-15 digits is typical for international numbers)
    if (digits.length < 8 || digits.length > 15) {
        return false;
    }
    
    // Check if it starts with a valid country code (1-3 digits)
    // Most country codes are 1-3 digits long
    const firstThreeDigits = digits.substring(0, 3);
    const firstTwoDigits = digits.substring(0, 2);
    const firstDigit = digits.substring(0, 1);
    
    // Common valid country codes (this is not exhaustive but covers most cases)
    const validCountryCodes = [
        '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
        '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '247', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299', '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '380', '381', '382', '383', '385', '386', '387', '389', '420', '421', '423', '424', '425', '426', '427', '428', '430', '431', '432', '433', '434', '435', '436', '437', '438', '439', '440', '441', '442', '443', '445', '446', '447', '448', '449', '450', '451', '452', '453', '454', '455', '456', '457', '458', '459', '460', '461', '462', '463', '464', '465', '466', '467', '468', '469', '470', '471', '472', '473', '474', '475', '476', '477', '478', '479', '480', '481', '482', '483', '484', '485', '486', '487', '488', '489', '490', '491', '492', '493', '494', '495', '496', '497', '498', '499', '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595', '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '684', '685', '686', '687', '688', '689', '690', '691', '692', '693', '694', '695', '696', '697', '698', '699', '850', '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '979', '992', '993', '994', '995', '996', '998'
    ];
    
    // Check if the number starts with a valid country code
    const hasValidCountryCode = validCountryCodes.includes(firstThreeDigits) || 
                                validCountryCodes.includes(firstTwoDigits) || 
                                validCountryCodes.includes(firstDigit);
    
    // Special case: reject numbers that start with suspicious patterns
    // 101, 999, 000, etc. are not valid country codes
    const suspiciousPatterns = ['101', '999', '000', '123', '456', '789'];
    const hasSuspiciousPattern = suspiciousPatterns.includes(firstThreeDigits) || 
                                suspiciousPatterns.includes(firstTwoDigits);
    
    return hasValidCountryCode && !hasSuspiciousPattern;
};

/**
 * Enhanced LID to JID conversion with international phone validation
 * Uses phone number format validation instead of WhatsApp API calls
 */
const lidToJidEnhanced = (jid) => {
    try {
        if (!jid || typeof jid !== 'string') {
            return jid;
        }
        
        let result = jid;
        
        // Handle LID conversion
        if (jid.endsWith('@lid')) {
            const lidPart = jid.replace('@lid', '');
            
            // Check if this LID exists in BOT_MAP first
            if (BOT_MAP.has(lidPart)) {
                result = BOT_MAP.get(lidPart) + '@s.whatsapp.net';
            } else {
                // Check if lidPart is a valid international phone number
                if (isValidInternationalPhoneNumber(lidPart)) {
                    result = lidPart + '@s.whatsapp.net';
                } else {
                    // Not a valid international phone number, keep as LID
                    result = jid;
                }
            }
        }
        // Handle existing JID validation
        else if (jid.endsWith('@s.whatsapp.net')) {
            const phoneNumber = jid.replace('@s.whatsapp.net', '');
            
            // Validate if this JID has a valid international phone number
            if (!isValidInternationalPhoneNumber(phoneNumber)) {
                // This JID is invalid, but we can't convert it back to LID
                // Keep it as-is but log the issue
                try {
                    const { Logger } = require('../Utils/performance-config');
                    Logger.warn('Invalid JID detected:', jid, 'Phone number:', phoneNumber);
                } catch (_) {
                    // ignore if logger not available
                }
                result = jid; // Keep the invalid JID for now
            }
        }
        
        return result;
    }
    catch (error) {
        try {
            const { Logger } = require('../Utils/performance-config');
            Logger.error('Error in lidToJidEnhanced:', error && error.message ? error.message : error, 'Input:', jid);
        } catch (_) {
            // ignore if logger not available
        }
        return jid;
    }
};

/**
 * Validates and cleans existing JIDs, converting invalid ones back to LID if possible
 */
const validateAndCleanJid = (jid) => {
    try {
        if (!jid || typeof jid !== 'string') {
            return jid;
        }
        
        // If it's a LID, use enhanced conversion
        if (jid.endsWith('@lid')) {
            return lidToJidEnhanced(jid);
        }
        
        // If it's a JID, validate it
        if (jid.endsWith('@s.whatsapp.net')) {
            const phoneNumber = jid.replace('@s.whatsapp.net', '');
            
            // Check if this is a valid international phone number
            if (!isValidInternationalPhoneNumber(phoneNumber)) {
                // This JID is invalid, try to convert back to LID
                // Check if it might be from our suspicious patterns
                const firstThreeDigits = phoneNumber.substring(0, 3);
                const suspiciousPatterns = ['101', '999', '000', '123', '456', '789'];
                
                if (suspiciousPatterns.includes(firstThreeDigits)) {
                    // Convert back to LID
                    return phoneNumber + '@lid';
                }
                
                // For other invalid numbers, we'll keep the JID but mark it
                try {
                    const { Logger } = require('../Utils/performance-config');
                    Logger.warn('Invalid JID kept:', jid, 'Phone number:', phoneNumber);
                } catch (_) {
                    // ignore if logger not available
                }
            }
        }
        
        return jid;
    }
    catch (error) {
        try {
            const { Logger } = require('../Utils/performance-config');
            Logger.error('Error in validateAndCleanJid:', error && error.message ? error.message : error, 'Input:', jid);
        } catch (_) {
            // ignore if logger not available
        }
        return jid;
    }
};
exports.validateAndConvertLidToJid = validateAndConvertLidToJid;

// Static BOT map kept for fallback. Created once to avoid recreating Map on each call.
const BOT_MAP_STATIC = new Map([["867051314767696", "13135550002"], ["1061492271844689", "13135550005"], ["245886058483988", "13135550009"], ["3509905702656130", "13135550012"], ["1059680132034576", "13135550013"], ["715681030623646", "13135550014"], ["1644971366323052", "13135550015"], ["582497970646566", "13135550019"], ["645459357769306", "13135550022"], ["294997126699143", "13135550023"], ["1522631578502677", "13135550027"], ["719421926276396", "13135550030"], ["1788488635002167", "13135550031"], ["24232338603080193", "13135550033"], ["689289903143209", "13135550035"], ["871626054177096", "13135550039"], ["362351902849370", "13135550042"], ["1744617646041527", "13135550043"], ["893887762270570", "13135550046"], ["1155032702135830", "13135550047"], ["333931965993883", "13135550048"], ["853748013058752", "13135550049"], ["1559068611564819", "13135550053"], ["890487432705716", "13135550054"], ["240254602395494", "13135550055"], ["1578420349663261", "13135550062"], ["322908887140421", "13135550065"], ["3713961535514771", "13135550067"], ["997884654811738", "13135550070"], ["403157239387035", "13135550081"], ["535242369074963", "13135550082"], ["946293427247659", "13135550083"], ["3664707673802291", "13135550084"], ["1821827464894892", "13135550085"], ["1760312477828757", "13135550086"], ["439480398712216", "13135550087"], ["1876735582800984", "13135550088"], ["984025089825661", "13135550089"], ["1001336351558186", "13135550090"], ["3739346336347061", "13135550091"], ["3632749426974980", "13135550092"], ["427864203481615", "13135550093"], ["1434734570493055", "13135550094"], ["992873449225921", "13135550095"], ["813087747426445", "13135550096"], ["806369104931434", "13135550098"], ["1220982902403148", "13135550099"], ["1365893374104393", "13135550100"], ["686482033622048", "13135550200"], ["1454999838411253", "13135550201"], ["718584497008509", "13135550202"], ["743520384213443", "13135550301"], ["1147715789823789", "13135550302"], ["1173034540372201", "13135550303"], ["974785541030953", "13135550304"], ["1122200255531507", "13135550305"], ["899669714813162", "13135550306"], ["631880108970650", "13135550307"], ["435816149330026", "13135550308"], ["1368717161184556", "13135550309"], ["7849963461784891", "13135550310"], ["3609617065968984", "13135550312"], ["356273980574602", "13135550313"], ["1043447920539760", "13135550314"], ["1052764336525346", "13135550315"], ["2631118843732685", "13135550316"], ["510505411332176", "13135550317"], ["1945664239227513", "13135550318"], ["1518594378764656", "13135550319"], ["1378821579456138", "13135550320"], ["490214716896013", "13135550321"], ["1028577858870699", "13135550322"], ["308915665545959", "13135550323"], ["845884253678900", "13135550324"], ["995031308616442", "13135550325"], ["2787365464763437", "13135550326"], ["1532790990671645", "13135550327"], ["302617036180485", "13135550328"], ["723376723197227", "13135550329"], ["8393570407377966", "13135550330"], ["1931159970680725", "13135550331"], ["401073885688605", "13135550332"], ["2234478453565422", "13135550334"], ["814748673882312", "13135550335"], ["26133635056281592", "13135550336"], ["1439804456676119", "13135550337"], ["889851503172161", "13135550338"], ["1018283232836879", "13135550339"], ["1012781386779537", "13135559000"], ["823280953239532", "13135559001"], ["1597090934573334", "13135559002"], ["485965054020343", "13135559003"], ["1033381648363446", "13135559004"], ["491802010206446", "13135559005"], ["1017139033184870", "13135559006"], ["499638325922174", "13135559008"], ["468946335863664", "13135559009"], ["1570389776875816", "13135559010"], ["1004342694328995", "13135559011"], ["1012240323971229", "13135559012"], ["392171787222419", "13135559013"], ["952081212945019", "13135559016"], ["444507875070178", "13135559017"], ["1274819440594668", "13135559018"], ["1397041101147050", "13135559019"], ["425657699872640", "13135559020"], ["532292852562549", "13135559021"], ["705863241720292", "13135559022"], ["476449815183959", "13135559023"], ["488071553854222", "13135559024"], ["468693832665397", "13135559025"], ["517422564037340", "13135559026"], ["819805466613825", "13135559027"], ["1847708235641382", "13135559028"], ["716282970644228", "13135559029"], ["521655380527741", "13135559030"], ["476193631941905", "13135559031"], ["485600497445562", "13135559032"], ["440217235683910", "13135559033"], ["523342446758478", "13135559034"], ["514784864360240", "13135559035"], ["505790121814530", "13135559036"], ["420008964419580", "13135559037"], ["492141680204555", "13135559038"], ["388462787271952", "13135559039"], ["423473920752072", "13135559040"], ["489574180468229", "13135559041"], ["432360635854105", "13135559042"], ["477878201669248", "13135559043"], ["351656951234045", "13135559044"], ["430178036732582", "13135559045"], ["434537312944552", "13135559046"], ["1240614300631808", "13135559047"], ["473135945605128", "13135559048"], ["423669800729310", "13135559049"], ["3685666705015792", "13135559050"], ["504196509016638", "13135559051"], ["346844785189449", "13135559052"], ["504823088911074", "13135559053"], ["402669415797083", "13135559054"], ["490939640234431", "13135559055"], ["875124128063715", "13135559056"], ["468788962654605", "13135559057"], ["562386196354570", "13135559058"], ["372159285928791", "13135559059"], ["531017479591050", "13135559060"], ["1328873881401826", "13135559061"], ["1608363646390484", "13135559062"], ["1229628561554232", "13135559063"], ["348802211530364", "13135559064"], ["3708535859420184", "13135559065"], ["415517767742187", "13135559066"], ["479330341612638", "13135559067"], ["480785414723083", "13135559068"], ["387299107507991", "13135559069"], ["333389813188944", "13135559070"], ["391794130316996", "13135559071"], ["457893470576314", "13135559072"], ["435550496166469", "13135559073"], ["1620162702100689", "13135559074"], ["867491058616043", "13135559075"], ["816224117357759", "13135559076"], ["334065176362830", "13135559077"], ["489973170554709", "13135559078"], ["473060669049665", "13135559079"], ["1221505815643060", "13135559080"], ["889000703096359", "13135559081"], ["475235961979883", "13135559082"], ["3434445653519934", "13135559084"], ["524503026827421", "13135559085"], ["1179639046403856", "13135559086"], ["471563305859144", "13135559087"], ["533896609192881", "13135559088"], ["365443583168041", "13135559089"], ["836082305329393", "13135559090"], ["1056787705969916", "13135559091"], ["503312598958357", "13135559092"], ["3718606738453460", "13135559093"], ["826066052850902", "13135559094"], ["1033611345091888", "13135559095"], ["3868390816783240", "13135559096"], ["7462677740498860", "13135559097"], ["436288576108573", "13135559098"], ["1047559746718900", "13135559099"], ["1099299455255491", "13135559100"], ["1202037301040633", "13135559101"], ["1720619402074074", "13135559102"], ["1030422235101467", "13135559103"], ["827238979523502", "13135559104"], ["1516443722284921", "13135559105"], ["1174442747196709", "13135559106"], ["1653165225503842", "13135559107"], ["1037648777635013", "13135559108"], ["551617757299900", "13135559109"], ["1158813558718726", "13135559110"], ["2463236450542262", "13135559111"], ["1550393252501466", "13135559112"], ["2057065188042796", "13135559113"], ["506163028760735", "13135559114"], ["2065249100538481", "13135559115"], ["1041382867195858", "13135559116"], ["886500209499603", "13135559117"], ["1491615624892655", "13135559118"], ["486563697299617", "13135559119"], ["1175736513679463", "13135559120"], ["491811473512352", "13165550064"]]);

// Current effective BOT map. May be replaced at runtime via `setBotMap` or `loadBotMapFromFile`.
let BOT_MAP = BOT_MAP_STATIC;

/**
 * Attempt to load a bot map JSON from disk. The JSON should be an object mapping
 * userId -> phoneNumber (both strings). Tries first the provided filePath, then
 * looks in process.cwd() and module directory.
 */
const loadBotMapFromFile = async (filePath) => {
    const candidates = [];
    if (filePath) candidates.push(filePath);
    candidates.push(path.join(process.cwd(), 'bot-map.json'));
    candidates.push(path.join(__dirname, 'bot-map.json'));

    for (const p of candidates) {
        try {
            if (!p) continue;
            const stat = await fs.promises.stat(p).catch(() => null);
            if (!stat || !stat.isFile()) continue;
            const data = await fs.promises.readFile(p, 'utf8');
            const obj = JSON.parse(data);
            if (obj && typeof obj === 'object') {
                BOT_MAP = new Map(Object.entries(obj));
                return BOT_MAP;
            }
        }
        catch (err) {
            // continue to next candidate
        }
    }
    // If no dynamic map found, keep existing BOT_MAP
    return BOT_MAP;
};

/**
 * Replace current BOT map with a provided object or Map.
 */
const setBotMap = (mapLike) => {
    if (!mapLike)
        return;
    if (mapLike instanceof Map) {
        BOT_MAP = mapLike;
        return;
    }
    if (typeof mapLike === 'object') {
        BOT_MAP = new Map(Object.entries(mapLike));
        return;
    }
};

/**
 * Get the mapped bot JID for a given jid (e.g. "123@bot"). Uses a runtime
 * configurable map with a static fallback. Returns the input jid if no mapping.
 */
const getBotJid = (jid) => {
    try {
        const sepIdx = typeof jid === 'string' ? jid.indexOf('@') : -1;
        if (sepIdx < 0) {
            return jid;
        }
        const server = jid.slice(sepIdx + 1);
        if (server !== 'bot')
            return jid;
        const user = jid.slice(0, sepIdx);
        const mappedNumber = BOT_MAP.get(user);
        return mappedNumber ? `${mappedNumber}@s.whatsapp.net` : jid;
    }
    catch (err) {
        // In case of unexpected errors, log and return original jid as safe fallback
        try {
            const { Logger } = require('../Utils/performance-config');
            Logger.error('getBotJid error:', err && err.message ? err.message : err);
        }
        catch (_) {
            // Fallback if logger is not available
        }
        return jid;
    }
};

exports.getBotJid = getBotJid;
exports.loadBotMapFromFile = loadBotMapFromFile;
exports.setBotMap = setBotMap;
exports.validateAndConvertLidToJid = validateAndConvertLidToJid;
exports.lidToJidEnhanced = lidToJidEnhanced;
exports.validateAndCleanJid = validateAndCleanJid;
