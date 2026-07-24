const taskQueues = new Map()
let outboundBackpressureUntil = 0
let outboundBackpressureReason = ''
const DEFAULT_BACKPRESSURE_MS = 30 * 1000

export const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))

export const isRateLimitError = (error) => {
    const statusCode = Number(error?.status || error?.statusCode || error?.data || error?.output?.statusCode)
    if (statusCode === 429) return true
    return /429|rate limit|too many requests/i.test(String(error?.message || ''))
}

export function activateOutboundBackpressure(reason = 'rate-limit', durationMs = DEFAULT_BACKPRESSURE_MS) {
    return 0
}

export function isOutboundBackpressureActive() {
    return false 
}

export function getOutboundBackpressureState() {
    return {
        active: false,
        remainingMs: 0,
        reason: '',
        until: 0,
    }
}

export async function retryOnRateLimit(task, options = {}) {
    const attempts = Math.max(1, Number(options.attempts) || 3)
    const delayMs = Math.max(500, Number(options.delayMs) || 5000)
    const backoff = Math.max(1, Number(options.backoff) || 1.5)
    const shouldRetry = typeof options.shouldRetry === 'function'
        ? options.shouldRetry
        : isRateLimitError

    let lastError = null

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await task(attempt)
        } catch (error) {
            lastError = error
            if (attempt >= attempts || !shouldRetry(error, attempt)) break
            await sleep(Math.round(delayMs * Math.pow(backoff, attempt - 1)))
        }
    }

    throw lastError
}

export async function enqueueTask(queueKey, task, options = {}) {
    const key = String(queueKey || 'default')
    const queue = taskQueues.get(key) || { tail: Promise.resolve(), size: 0 }
    const position = queue.size + 1
    const previous = queue.tail.catch(() => {})

    queue.size += 1
    taskQueues.set(key, queue)

    if (position > 1 && typeof options.onQueued === 'function') {
        await Promise.resolve(options.onQueued(position)).catch(() => {})
    }

    const run = previous
        .then(async () => {
            if (typeof options.onStart === 'function') {
                await Promise.resolve(options.onStart(position)).catch(() => {})
            }

            return task({ key, position, queued: position > 1 })
        })
        .finally(() => {
            queue.size = Math.max(0, queue.size - 1)
            if (queue.size === 0 && queue.tail === run) {
                taskQueues.delete(key)
            }
        })

    queue.tail = run
    return run
}

export function getQueueSize(queueKey) {
    const key = String(queueKey || 'default')
    return taskQueues.get(key)?.size || 0
}
