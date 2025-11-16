"use strict";
const NodeCache = require('node-cache');
const { getPerformanceConfig } = require('./performance-config');

class CacheManager {
    constructor() {
        const config = getPerformanceConfig();
        this.caches = {};
        this.memoryCheckInterval = null;
        
        // Inizializza le cache con TTL
        Object.entries(config.cache).forEach(([name, options]) => {
            this.caches[name] = new NodeCache({
                stdTTL: options.ttl / 1000, // Converti da ms a secondi
                checkperiod: options.cleanupInterval / 1000,
                maxKeys: options.maxSize
            });
        });
        
        if (config.performance.enableMetrics) {
            this.startMemoryMonitoring(config.performance.memoryThreshold);
        }
    }
    
    startMemoryMonitoring(threshold) {
        this.memoryCheckInterval = setInterval(() => {
            const used = process.memoryUsage().heapUsed;
            const total = process.memoryUsage().heapTotal;
            const ratio = used / total;
            
            if (ratio > threshold) {
                this.evictLeastUsed();
            }
        }, 60000); // Controlla ogni minuto
    }
    
    evictLeastUsed() {
        Object.values(this.caches).forEach(cache => {
            const stats = cache.getStats();
            if (stats.keys > 100) { // Mantieni almeno 100 chiavi
                const keys = cache.keys();
                // Rimuovi il 20% delle chiavi meno usate
                const toRemove = Math.floor(keys.length * 0.2);
                keys.slice(0, toRemove).forEach(key => cache.del(key));
            }
        });
    }
    
    get(cacheName, key) {
        return this.caches[cacheName]?.get(key);
    }
    
    set(cacheName, key, value, ttl = undefined) {
        return this.caches[cacheName]?.set(key, value, ttl);
    }
    
    async setAsync(cacheName, key, fetchData, ttl = undefined) {
        const value = await fetchData();
        return this.set(cacheName, key, value, ttl);
    }
    
    del(cacheName, key) {
        return this.caches[cacheName]?.del(key);
    }
    
    getStats(cacheName) {
        return this.caches[cacheName]?.getStats();
    }
    
    // Enhanced cleanup for bad ACK entries
    on(event, callback) {
        if (event === 'bad_ack') {
            // Setup cleanup listener for bad ACKs
            this.badAckCallback = callback;
        }
    }

    // Method to trigger bad ACK cleanup
    cleanupBadAck(key) {
        if (this.badAckCallback) {
            this.badAckCallback(key);
        }
    }

    shutdown() {
        if (this.memoryCheckInterval) {
            clearInterval(this.memoryCheckInterval);
        }
        Object.values(this.caches).forEach(cache => cache.close());
    }
}

module.exports = new CacheManager();
