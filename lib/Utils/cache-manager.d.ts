declare const cacheManager: {
    setMessageStore(msgStore: any): void;
    startMemoryMonitoring(threshold: number): void;
    evictLeastUsed(): void;
    get(cacheName: string, key: string): any;
    set(cacheName: string, key: string, value: any, ttl?: number): any;
    setAsync<T>(cacheName: string, key: string, fetchData: () => Promise<T>, ttl?: number): Promise<any>;
    del(cacheName: string, key: string): any;
    getStats(cacheName: string): any;
    on(event: 'bad_ack', callback: (key: any) => void): void;
    cleanupBadAck(key: any): void;
    shutdown(): void;
    caches?: Record<string, any>;
};
export declare const CacheManager: typeof cacheManager;
export default cacheManager;
