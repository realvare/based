"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cache_1 = __importDefault(require("@cacheable/node-cache"));
const Defaults_1 = require("../Defaults");
const business_1 = require("./business");
// export the last socket layer
const makeWASocket = (config) => {
    const inputConfig = config;
    const hasBrowserOverride = Object.prototype.hasOwnProperty.call(inputConfig, 'browser');
    config = {
        ...Defaults_1.DEFAULT_CONNECTION_CONFIG,
        ...config,
    };
    const creds = config.auth?.creds;
    if (!hasBrowserOverride && creds?.browser) {
        config.browser = creds.browser;
    }
    else if (creds && !creds.browser) {
        creds.browser = config.browser;
    }
    if (!config.lidCache) {
        config.lidCache = new node_cache_1.default({
            stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.LID_JID,
            useClones: false
        });
    }
    return (0, business_1.makeBusinessSocket)(config);
};
exports.default = makeWASocket;
