"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceConfig = exports.setPerformanceConfig = exports.getPerformanceConfig = void 0;

/**
 * Configurazione performance per ottimizzazioni LID/JID
 */
class PerformanceConfig {
    constructor() {
        this.cache = {
            lidCache: {
                ttl: 5 * 60 * 1000, // 5 minutes
                maxSize: 10000,
                cleanupInterval: 2 * 60 * 1000 // 2 minutes
            },
            jidCache: {
                ttl: 5 * 60 * 1000, // 5 minutes
                maxSize: 10000,
                cleanupInterval: 2 * 60 * 1000 // 2 minutes
            },
            lidToJidCache: {
                ttl: 5 * 60 * 1000, // 5 minutes
                maxSize: 5000,
                cleanupInterval: 3 * 60 * 1000 // 3 minutes
            },
            groupMetadataCache: {
                ttl: 10 * 60 * 1000, // 10 minutes
                maxSize: 2000,
                cleanupInterval: 5 * 60 * 1000 // 5 minutes
            }
        };

        this.performance = {
            enableCache: true,
            enableLogging: false,
            enableMetrics: true,
            batchSize: 50,
            maxRetries: 3, // Reduced from 5
            retryDelay: 2000, // Reduced from 5000
            retryBackoffMultiplier: 1.5,
            maxRetryDelay: 30000, // Reduced from 60000
            maxMsgRetryCount: 2, // Reduced from 3
            memoryThreshold: 0.85,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            keepAliveIntervalMs: 30000,
            enableNativeLidCache: true,
            enableLidLogging: process.env.DEBUG_LID === 'true',
            logLevel: process.env.LOG_LEVEL || 'debug',
            // Performance optimizations
            enableMessageBatching: true,
            messageBatchSize: 10,
            messageBatchTimeout: 100,
            enableParallelProcessing: true,
            maxConcurrentMessages: 5,
            enableFastAck: true,
            reduceSyncValidation: true
        };

        this.debug = {
            enableLidLogging: process.env.DEBUG_LID === 'true',
            enablePerformanceLogging: process.env.DEBUG_PERFORMANCE === 'true',
            enableErrorLogging: true,
            logLevel: process.env.LOG_LEVEL || 'debug'
        };

        this.security = {
            messageDelay: {
                min: 1000,
                max: 5000
            },
            antiBan: {
                enabled: true,
                maxConsecutiveErrors: 5,
                cooldownPeriod: 15000
            }
        };
    }
    

    /**
     * Aggiorna configurazione cache
     */
    updateCacheConfig(cacheType, config) {
        if (this.cache[cacheType]) {
            this.cache[cacheType] = { ...this.cache[cacheType], ...config };
        }
    }

    /**
     * Aggiorna configurazione performance
     */
    updatePerformanceConfig(config) {
        this.performance = { ...this.performance, ...config };
    }

    /**
     * Aggiorna configurazione debug
     */
    updateDebugConfig(config) {
        this.debug = { ...this.debug, ...config };
    }

    /**
     * Verifica se il logging è abilitato per un livello specifico
     */
    shouldLog(level) {
        const levels = ['error', 'warn', 'info', 'debug'];
        const currentLevelIndex = levels.indexOf(this.debug.logLevel);
        const requestedLevelIndex = levels.indexOf(level);
        return requestedLevelIndex <= currentLevelIndex;
    }
}

// Istanza globale della configurazione
let globalConfig = new PerformanceConfig();

/**
 * Ottieni la configurazione performance globale
 */
const getPerformanceConfig = () => globalConfig;
exports.getPerformanceConfig = getPerformanceConfig;

/**
 * Imposta una nuova configurazione performance
 */
const setPerformanceConfig = (config) => {
    if (config instanceof PerformanceConfig) {
        globalConfig = config;
    } else {
        // Merge con configurazione esistente
        if (config.cache) {
            Object.keys(config.cache).forEach(key => {
                globalConfig.updateCacheConfig(key, config.cache[key]);
            });
        }
        if (config.performance) {
            globalConfig.updatePerformanceConfig(config.performance);
        }
        if (config.debug) {
            globalConfig.updateDebugConfig(config.debug);
        }
    }
};
exports.setPerformanceConfig = setPerformanceConfig;

/**
 * Utility per logging condizionale
 */
class Logger {
    static error(message, ...args) {
        if (globalConfig.shouldLog('error')) {
            console.error(`[LID/JID Error] ${message}`, ...args);
        }
    }

    static warn(message, ...args) {
        if (globalConfig.shouldLog('warn')) {
            console.warn(`[LID/JID Warning] ${message}`, ...args);
        }
    }

    static info(message, ...args) {
        if (globalConfig.shouldLog('info')) {
            console.info(`[LID/JID Info] ${message}`, ...args);
        }
    }

    static debug(message, ...args) {
        if (globalConfig.shouldLog('debug')) {
            console.debug(`[LID/JID Debug] ${message}`, ...args);
        }
    }

    static performance(message, ...args) {
        if (globalConfig.debug.enablePerformanceLogging) {
            console.log(`[LID/JID Performance] ${message}`, ...args);
        }
    }
}

exports.Logger = Logger;
exports.PerformanceConfig = PerformanceConfig;
