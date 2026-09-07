/**
 * Admission control and time budgeting for media jobs.
 *
 * Both are about the same failure: ffmpeg and yt-dlp are the heaviest things
 * this bot runs, and they run on the same box as the bot itself. Four people
 * converting video at once does not produce four slow conversions, it produces
 * a bot that stops answering anything - `index.ts` starts pocketbase and
 * llama.cpp under one `concurrently --kill-others-on-fail`, so the whole stack
 * is competing for the same cores.
 */

/**
 * Jobs allowed to run at once.
 *
 * Two rather than one so a quick audio extraction is not stuck behind
 * someone's ten minute video, and rather than four because ffmpeg already
 * threads across every core it can find.
 */
export const MAX_CONCURRENT_MEDIA_JOBS = 2;

let activeJobs = 0;

/**
 * Takes a job slot if one is free.
 *
 * Deliberately a try-and-fail rather than a queue: a queued job would still be
 * waiting when its interaction token expires fifteen minutes later, so the
 * user gets a spinner that ends in nothing. Being told to come back in a
 * minute is the better outcome.
 * @returns A release function, or null when the bot is already busy
 */
export const tryAcquireMediaSlot = (): (() => void) | null => {
  if (activeJobs >= MAX_CONCURRENT_MEDIA_JOBS) return null;

  activeJobs += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeJobs -= 1;
  };
};

/**
 * How many jobs are running, for the "I'm busy" reply.
 * @returns The current job count
 */
export const activeMediaJobs = (): number => activeJobs;

/**
 * Total wall clock a job may take.
 *
 * Discord invalidates the interaction token fifteen minutes after the command
 * is invoked, and an upload of tens of megabytes has to happen inside that
 * too. Twelve minutes leaves room for the upload and for the reply that
 * reports a failure.
 */
export const JOB_BUDGET_MS = 12 * 60 * 1000;

/** Never hand a subprocess less than this; a one second cap is just a failure. */
const MIN_STAGE_MS = 5_000;

export class DeadlineError extends Error {
  constructor() {
    super("Ran out of time");
    this.name = "DeadlineError";
  }
}

export type JobDeadline = {
  /** Milliseconds left in the budget, floored at zero. */
  remainingMs: () => number;
  /**
   * Timeout for the next subprocess.
   * @param stageMs What this stage would like
   * @returns The smaller of the request and the time left
   * @throws DeadlineError when there is no time left
   */
  budget: (stageMs: number) => number;
};

/**
 * Starts a job's clock.
 *
 * Stages take their timeout from what remains rather than each having its own
 * fixed cap, because the caps have to add up to less than the token's life -
 * and separate fixed caps drift out of that agreement the moment one of them
 * is tuned.
 * @param totalMs The job's whole budget, defaulting to `JOB_BUDGET_MS`
 * @param now Injectable clock for tests
 * @returns The deadline
 */
export const createJobDeadline = (
  totalMs = JOB_BUDGET_MS,
  now: () => number = Date.now,
): JobDeadline => {
  const endsAt = now() + totalMs;

  const remainingMs = () => Math.max(0, endsAt - now());

  return {
    remainingMs,
    budget: (stageMs: number) => {
      const left = remainingMs();
      if (left <= 0) throw new DeadlineError();

      return Math.max(MIN_STAGE_MS, Math.min(stageMs, left));
    },
  };
};
