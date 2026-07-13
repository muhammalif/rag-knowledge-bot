/**
 * Gemini free-tier helpers.
 *
 * Free tier caps `generate_content_free_tier_requests` at 20 req/min. Bursty eval
 * runs trip HTTP 429. Two safeguards:
 *  - ensureRateLimit(): minimum interval between consecutive Gemini calls (interval
 *    from GEMINI_THROTTLE_MS, default 0 = disabled so production stays fast).
 *  - callWithRetry(): on a 429, back off for the server-suggested delay and retry,
 *    so a run self-heals instead of crashing on a transient quota dip.
 */
let lastCall = 0;

export async function ensureRateLimit(): Promise<void> {
  const interval = Number(process.env.GEMINI_THROTTLE_MS ?? 0);
  if (!interval || Number.isNaN(interval)) return;
  const wait = Math.max(0, lastCall + interval - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export async function callWithRetry<T>(fn: () => Promise<T>, maxAttempts = 6): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isRateLimited =
        /429|RESOURCE_EXHAUSTED|exceeded your current quota|Too Many Requests/i.test(msg);
      if (!isRateLimited || attempt === maxAttempts) throw e;
      const m = msg.match(/retry in ([\d.]+)s/i);
      const waitMs = m ? Math.ceil(Number(m[1]) * 1000) + 2000 : 20000;
      console.warn(
        `  ⚠ 429 rate limit (attempt ${attempt}/${maxAttempts}) — backing off ${Math.round(
          waitMs / 1000,
        )}s...`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      lastErr = e;
    }
  }
  throw lastErr;
}
