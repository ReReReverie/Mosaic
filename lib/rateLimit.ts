interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const buckets = new Map<string, RateLimitBucket>();

function pruneExpiredBuckets(now: number): void {
  if (buckets.size <= 10_000) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function consumeRateLimit(key: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  pruneExpiredBuckets(now);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getRequestKey(headers: Headers): string {
  const forwarded = (
    headers.get("x-vercel-forwarded-for") || headers.get("x-forwarded-for")
  )
    ?.split(",")[0]
    ?.trim();
  return forwarded || headers.get("x-real-ip") || "anonymous";
}
