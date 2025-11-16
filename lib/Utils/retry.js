"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryWithBackoff = void 0;

async function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        if (signal) {
            const onAbort = () => {
                clearTimeout(t);
                reject(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }));
            };
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

function computeDelay(attempt, baseMs, maxMs, jitter) {
    const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
    if (!jitter) return exp;
    // full jitter strategy: random between 0 and exp
    const rand = Math.random() * exp;
    return Math.min(maxMs, rand);
}

async function retryWithBackoff(fn, opts = {}) {
	const {
		retries = 3,
		baseMs = 300,
		maxMs = 5000,
		jitter = true,
        timeoutPerAttemptMs,
        signal,
		onRetry,
		shouldRetry
	} = opts;
	let lastErr;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
            if (timeoutPerAttemptMs && timeoutPerAttemptMs > 0) {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), timeoutPerAttemptMs);
                try {
                    return await fn({ signal: ctrl.signal });
                } finally {
                    clearTimeout(timer);
                }
            }
            return await fn({ signal });
		} catch (err) {
			lastErr = err;
			if (attempt === retries) break;
			if (shouldRetry && !shouldRetry(err)) break;
			if (onRetry) {
				try { onRetry(err, attempt + 1); } catch {}
			}
            await sleep(computeDelay(attempt, baseMs, maxMs, jitter), signal);
		}
	}
	throw lastErr;
}
exports.retryWithBackoff = retryWithBackoff;
