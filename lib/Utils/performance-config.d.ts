/**
 * Configurazione performance per ottimizzazioni LID/JID
 */
export interface CacheConfig {
    ttl: number;
    maxSize: number;
    cleanupInterval: number;
}

export interface PerformanceSettings {
    enableCache: boolean;
    enableLogging: boolean;
    enableMetrics: boolean;
    batchSize: number;
    maxRetries: number;
    retryDelay: number;
    retryBackoffMultiplier: number;
    maxRetryDelay: number;
    maxMsgRetryCount: number;
    memoryThreshold: number;
    // Anti-ban specific settings
    markOnlineOnConnect?: boolean;
    syncFullHistory?: boolean;
    keepAliveIntervalMs?: number;
}

export interface DebugSettings {
    enableLidLogging: boolean;
    enablePerformanceLogging: boolean;
    enableErrorLogging: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
}

export interface PerformanceConfigInterface {
    cache: {
        lidCache: CacheConfig;
        jidCache: CacheConfig;
        lidToJidCache: CacheConfig;
    };
    performance: PerformanceSettings;
    debug: DebugSettings;
}

export declare class PerformanceConfig implements PerformanceConfigInterface {
    cache: {
        lidCache: CacheConfig;
        jidCache: CacheConfig;
        lidToJidCache: CacheConfig;
    };
    performance: PerformanceSettings;
    debug: DebugSettings;
    
    updateCacheConfig(cacheType: string, config: Partial<CacheConfig>): void;
    updatePerformanceConfig(config: Partial<PerformanceSettings>): void;
    updateDebugConfig(config: Partial<DebugSettings>): void;
    shouldLog(level: string): boolean;
}

export declare class Logger {
    static error(message: string, ...args: any[]): void;
    static warn(message: string, ...args: any[]): void;
    static info(message: string, ...args: any[]): void;
    static debug(message: string, ...args: any[]): void;
    static performance(message: string, ...args: any[]): void;
}

export declare const getPerformanceConfig: () => PerformanceConfig;
export declare const setPerformanceConfig: (config: Partial<PerformanceConfigInterface> | PerformanceConfig) => void;
