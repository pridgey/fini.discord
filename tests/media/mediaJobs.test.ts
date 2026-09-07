import { describe, expect, it } from "bun:test";
import {
  DeadlineError,
  MAX_CONCURRENT_MEDIA_JOBS,
  activeMediaJobs,
  createJobDeadline,
  tryAcquireMediaSlot,
} from "../../modules/media/mediaJobs";

describe("tryAcquireMediaSlot", () => {
  it("hands out exactly the configured number of slots", () => {
    const held = Array.from({ length: MAX_CONCURRENT_MEDIA_JOBS }, () =>
      tryAcquireMediaSlot(),
    );

    expect(held.every(Boolean)).toBe(true);
    expect(activeMediaJobs()).toBe(MAX_CONCURRENT_MEDIA_JOBS);
    expect(tryAcquireMediaSlot()).toBeNull();

    held.forEach((release) => release!());
    expect(activeMediaJobs()).toBe(0);
  });

  // Commands release from a `finally` that can run after an error path has
  // already released, and a double decrement would leak slots until restart.
  it("ignores a second release of the same slot", () => {
    const release = tryAcquireMediaSlot()!;

    release();
    release();

    expect(activeMediaJobs()).toBe(0);
  });
});

describe("createJobDeadline", () => {
  it("gives a stage what it asked for while there is time", () => {
    const deadline = createJobDeadline(600_000, () => 0);

    expect(deadline.budget(60_000)).toBe(60_000);
    expect(deadline.remainingMs()).toBe(600_000);
  });

  it("cuts a stage down to the time actually left", () => {
    let now = 0;
    const deadline = createJobDeadline(100_000, () => now);

    now = 90_000;

    expect(deadline.budget(60_000)).toBe(10_000);
  });

  it("throws rather than starting a stage with no time left", () => {
    let now = 0;
    const deadline = createJobDeadline(1000, () => now);

    now = 5000;

    expect(deadline.remainingMs()).toBe(0);
    expect(() => deadline.budget(1000)).toThrow(new DeadlineError().message);
  });

  // A one second cap is not a stage, it is a guaranteed timeout with an
  // ffmpeg process started and killed for nothing.
  it("never hands out a uselessly short budget", () => {
    let now = 0;
    const deadline = createJobDeadline(100_000, () => now);

    now = 99_900;

    expect(deadline.budget(60_000)).toBeGreaterThanOrEqual(5_000);
  });
});
