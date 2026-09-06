/**
 * A sliding-window rate limiter for outbound Discord calls.
 *
 * discord.js already queues requests against the buckets Discord reports back,
 * so this is not what stops a 429 - it is what stops us *generating* the burst
 * in the first place. That matters for anything that edits one message on a
 * loop: repeated 429s count toward Discord's invalid-request ceiling, which is
 * answered with a temporary IP ban rather than a slower queue, and a command
 * that quietly gets throttled downstream produces an animation that stutters
 * and finishes late.
 *
 * Two independent constraints, because they catch different mistakes:
 *   - `minIntervalMs` keeps successive calls evenly spaced, which is what makes
 *     an animation look deliberate rather than lurching.
 *   - `budget` per `windowMs` is the backstop that holds even if a caller asks
 *     for a burst.
 */

export type RateLimiterOptions = {
  /** Most calls allowed inside any `windowMs` stretch. */
  budget: number;
  /** Width of the sliding window, in milliseconds. */
  windowMs: number;
  /** Smallest gap between two consecutive calls, in milliseconds. */
  minIntervalMs?: number;
  /** Injectable for tests; defaults to the real clock. */
  now?: () => number;
  /** Injectable for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
};

export type RateLimiter = {
  /** Resolves once it is safe to make the next call. */
  acquire: () => Promise<void>;
};

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Creates a limiter that paces calls.
 *
 * Calls are serialised: two overlapping `acquire()`s queue behind each other
 * rather than both seeing the same free slot and going at once.
 * @param options Budget, window, and optional spacing and clock overrides
 * @returns A limiter to `await` before each outbound call
 */
export const createRateLimiter = ({
  budget,
  windowMs,
  minIntervalMs = 0,
  now = Date.now,
  sleep = realSleep,
}: RateLimiterOptions): RateLimiter => {
  /** Timestamps of calls still inside the window. */
  const recent: number[] = [];

  // Without this, two concurrent callers both read the same state before
  // either records its slot, and both proceed.
  let queue: Promise<void> = Promise.resolve();

  const reserve = async (): Promise<void> => {
    // A slot is free once it is far enough from the previous call, and once
    // the window has room. Loop rather than sleeping once, because sleeping
    // for one constraint can leave the other unmet.
    for (;;) {
      const current = now();

      while (recent.length && current - recent[0] >= windowMs) recent.shift();

      const sinceLast = recent.length
        ? current - recent[recent.length - 1]
        : Infinity;
      const spacingWait = Math.max(minIntervalMs - sinceLast, 0);
      const windowWait =
        recent.length >= budget ? windowMs - (current - recent[0]) : 0;
      const waitMs = Math.max(spacingWait, windowWait);

      if (waitMs <= 0) {
        recent.push(current);
        return;
      }

      await sleep(waitMs);
    }
  };

  return {
    acquire: () => {
      const next = queue.then(reserve);
      // Keep the chain alive even if a caller's own work later rejects.
      queue = next.catch(() => undefined);
      return next;
    },
  };
};
