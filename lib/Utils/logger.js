"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const { getPerformanceConfig } = require('./performance-config');
const defaultLogger = (0, pino_1.default)({ timestamp: () => `,"time":"${new Date().toJSON()}"` });
class EnhancedLogger {
    constructor() {
        this.config = getPerformanceConfig();
    }

    static error(...args) {
        if (defaultLogger.isLevelEnabled('error')) {
            defaultLogger.error(...args);
        }
        // Additional error tracking if enabled
        if (this.config?.debug?.enableErrorTracking) {
            // Could send to external monitoring service
            console.error('[ERROR TRACK]', ...args);
        }
    }

    static warn(...args) {
        if (defaultLogger.isLevelEnabled('warn')) {
            defaultLogger.warn(...args);
        }
    }

    static info(...args) {
        if (this.config?.debug?.enableInfoLogging && defaultLogger.isLevelEnabled('info')) {
            defaultLogger.info(...args);
        }
    }

    static debug(...args) {
        if (this.config?.debug?.enableDebugLogging && defaultLogger.isLevelEnabled('debug')) {
            defaultLogger.debug(...args);
        }
    }
    static createBaileysLogger(level = 'info', prefix = 'Based') {
        return {
            level,
            debug: (...args) => this.debug(`[${prefix}]`, ...args),
            info: (...args) => this.info(`[${prefix}]`, ...args),
            warn: (...args) => this.warn(`[${prefix}]`, ...args),
            error: (...args) => this.error(`[${prefix}]`, ...args),
            trace: (...args) => this.debug(`[${prefix} TRACE]`, ...args),
            child: (bindings) => ({
                ...this.createBaileysLogger(level, prefix),
                bindings
            })
        };
    }
}

exports.EnhancedLogger = EnhancedLogger;
exports.default = defaultLogger;
