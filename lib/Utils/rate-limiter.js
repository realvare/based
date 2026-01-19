"use strict";

class RateLimiter {
    /**
     * @param {object} [options] - Configuration options
     * @param {number} [options.limitPerSecond=1] - Number of tasks to process per second
     * @param {number} [options.maxRandomDelayMs=500] - Maximum random delay to add after each task in milliseconds
     */
    constructor(options = {}) {
        const { limitPerSecond = 1, maxRandomDelayMs = 500 } = options;

        this.limitPerSecond = limitPerSecond;
        this.interval = 1000 / this.limitPerSecond;
        this.maxRandomDelayMs = maxRandomDelayMs;

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
    async process() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const { task, resolve, reject } = this.queue.shift();
            const now = Date.now();
            const timeSinceLastSend = now - this.lastSendTime;
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
            if (this.maxRandomDelayMs > 0) {
                const randomDelay = Math.random() * this.maxRandomDelayMs;
                await new Promise(r => setTimeout(r, randomDelay));
            }
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
    clear() {
        this.queue.forEach(({ reject }) => {
            reject(new Error('Rate limiter cleared'));
        });
        this.queue = [];
    }
}

module.exports = RateLimiter;