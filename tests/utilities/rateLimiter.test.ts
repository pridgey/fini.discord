import { describe, expect, it } from "bun:test";
import { createRateLimiter } from "../../utilities/rateLimiter";

/**
 * A fake clock, so these run instantly and deterministically rather than
 * actually waiting seconds and hoping the machine isn't busy.
 */
const fakeClock = () => {
  let current = 0;

  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
    },
    advance: (ms: number) => {
      current += ms;
    },
    get time() {
      return current;
    },
  };
};

/** Records the clock time at which each acquisition was granted. */
const timesOf = async (
  limiter: { acquire: () => Promise<void> },
  clock: ReturnType<typeof fakeClock>,
  count: number,
) => {
  const times: number[] = [];

  for (let i = 0; i < count; i++) {
    await limiter.acquire();
    times.push(clock.time);
  }

  return times;
};

describe("createRateLimiter", () => {
  it("lets the first call through immediately", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      budget: 5,
      windowMs: 5000,
      ...clock,
    });

    expect(await timesOf(limiter, clock, 1)).toEqual([0]);
  });

  it("spaces calls by minIntervalMs", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      budget: 100,
      windowMs: 5000,
      minIntervalMs: 1000,
      ...clock,
    });

    expect(await timesOf(limiter, clock, 4)).toEqual([0, 1000, 2000, 3000]);
  });

  // The budget has to hold even when the caller asks for no spacing at all.
  it("never exceeds the budget inside the window", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ budget: 3, windowMs: 1000, ...clock });

    const times = await timesOf(limiter, clock, 7);

    for (const start of times) {
      const inWindow = times.filter(
        (time) => time >= start && time < start + 1000,
      );
      expect(inWindow.length).toBeLessThanOrEqual(3);
    }
  });

  it("bursts up to the budget, then paces", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ budget: 3, windowMs: 1000, ...clock });

    expect(await timesOf(limiter, clock, 5)).toEqual([0, 0, 0, 1000, 1000]);
  });

  // The horsey settings: spacing set to window/budget so the window cap is
  // never the binding constraint and frames land at a steady cadence.
  it("paces evenly when minInterval matches the sustainable rate", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      budget: 5,
      windowMs: 5000,
      minIntervalMs: 1000,
      ...clock,
    });

    expect(await timesOf(limiter, clock, 11)).toEqual([
      0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
    ]);
  });

  it("forgets calls that have aged out of the window", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ budget: 2, windowMs: 1000, ...clock });

    await timesOf(limiter, clock, 2);
    clock.advance(1500);

    // The window is clear again, so this should not have to wait.
    expect(await timesOf(limiter, clock, 1)).toEqual([1500]);
  });

  // Two callers reading the same free slot before either records it is the
  // classic way a limiter silently lets a burst through.
  it("serialises concurrent acquisitions", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      budget: 100,
      windowMs: 5000,
      minIntervalMs: 500,
      ...clock,
    });

    const granted: number[] = [];
    await Promise.all(
      Array.from({ length: 4 }, () =>
        limiter.acquire().then(() => {
          granted.push(clock.time);
        }),
      ),
    );

    expect(granted).toEqual([0, 500, 1000, 1500]);
  });

  it("keeps working after a caller's own work throws", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      budget: 100,
      windowMs: 5000,
      minIntervalMs: 100,
      ...clock,
    });

    await limiter
      .acquire()
      .then(() => {
        throw new Error("the edit failed");
      })
      .catch(() => undefined);

    // A rejected downstream call must not poison the queue for later frames.
    expect(await timesOf(limiter, clock, 1)).toEqual([100]);
  });
});
