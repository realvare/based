"use strict";

/**
 * RateLimiter class for controlling message sending frequency
 * to prevent ban detection by simulating human-like behavior
 */
class RateLimiter {
    constructor(limitPerSecond = 1) {
        this.limitPerSecond = limitPerSecond;
        this.interval = 1000 / limitPerSecond; // milliseconds between messages
        this.queue = [];
        this.processing = false;
        this.lastSendTime = 0;
    }

    /**
     * Add a task to the rate limiting queue
     * @param {Function} task - Async function to execute
     * @returns {Promise} - Promise that resolves when task is complete
     */
    async add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            if (!this.processing) {
                this.process();
            }
        });
    }

    /**
     * Process the queue with rate limiting
     */
    async process() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const { task, resolve, reject } = this.queue.shift();
            const now = Date.now();
            const timeSinceLastSend = now - this.lastSendTime;

            // Wait if we need to respect the rate limit
            if (timeSinceLastSend < this.interval) {
                const waitTime = this.interval - timeSinceLastSend;
                await new Promise(r => setTimeout(r, waitTime));
            }

            try {
                const result = await task();
                this.lastSendTime = Date.now();
                resolve(result);
            } catch (error) {
                reject(error);
            }

            // Add small random delay to simulate human behavior (0-500ms)
            const randomDelay = Math.random() * 500;
            await new Promise(r => setTimeout(r, randomDelay));
        }

        this.processing = false;
    }

    /**
     * Update the rate limit
     * @param {number} newLimit - New messages per second limit
     */
    setLimit(newLimit) {
        this.limitPerSecond = newLimit;
        this.interval = 1000 / newLimit;
    }

    /**
     * Get current queue length
     * @returns {number} - Number of pending tasks
     */
    getQueueLength() {
        return this.queue.length;
    }

    /**
     * Clear all pending tasks
     */
    clear() {
        this.queue.forEach(({ reject }) => {
            reject(new Error('Rate limiter cleared'));
        });
        this.queue = [];
    }
}

module.exports = RateLimiter;
