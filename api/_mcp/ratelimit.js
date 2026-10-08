// @ts-check
// R-N12 — fixed-window rate limit per key, in memory.
//
// Serverless instances do not share memory, so this bounds each instance
// rather than the whole deployment. That is enough to stop a runaway client;
// a shared store is a later step if the endpoint ever serves many keys.

/**
 * @param {{ max?: number, windowMs?: number, now?: () => number }} [opts]
 */
export function createRateLimiter({ max = 120, windowMs = 60_000, now = () => Date.now() } = {}) {
  /** @type {Map<string, { start: number, count: number }>} */
  const windows = new Map();
  const windowLabel = windowMs % 1000 === 0 ? `${windowMs / 1000}s` : `${windowMs}ms`;

  return {
    /** Count one request for `key`; throws when the window is exhausted. */
    check(key) {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      w.count += 1;
      if (w.count > max) {
        throw new Error(`Rate limit exceeded: ${max} requests per ${windowLabel}`);
      }
      return { remaining: max - w.count };
    },
  };
}
