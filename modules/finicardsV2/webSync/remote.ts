import PocketBase from "pocketbase";

/**
 * Fini's connection to the web mailbox - the public Pocketbase the site
 * reads. Always outbound: Fini calls it, and nothing there can call Fini.
 *
 * Off unless all three settings are present, so a bot without them runs
 * exactly as it did before the site existed.
 */

const url = process.env.FINI_WEB_POCKETBASE_URL ?? "";
const email = process.env.FINI_WEB_POCKETBASE_EMAIL ?? "";
const password = process.env.FINI_WEB_POCKETBASE_PASSWORD ?? "";

export const webSyncEnabled = (): boolean => !!(url && email && password);

export const remoteUrl = (): string => url.replace(/\/+$/, "");

export const remote = new PocketBase(url);
// Rows are sent side by side; the client would cancel all but the last.
remote.autoCancellation(false);

/** The gap between two writes to the mailbox, in milliseconds: found, not fixed. */
const GAP = { least: 50, most: 10_000, start: 150 };
/** Times a write turned away is tried again before it counts as failed. */
const TRIES = 8;

let gap = GAP.start;
let nextWrite = 0;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends one write to the mailbox, no faster than it will take them.
 *
 * A hosted Pocketbase sits behind a limiter that answers 429 to too many
 * requests, and does not say what "too many" is. So the pace is found as it
 * goes: each write turned away doubles the gap between writes and is tried
 * again; each one let through narrows the gap a little.
 */
export const paced = async <T>(write: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    const now = Date.now();
    const turn = Math.max(now, nextWrite);
    nextWrite = turn + gap;
    if (turn > now) await pause(turn - now);
    try {
      const result = await write();
      gap = Math.max(GAP.least, gap * 0.97);
      return result;
    } catch (error) {
      if ((error as { status?: number })?.status !== 429 || attempt >= TRIES) throw error;
      gap = Math.min(GAP.most, gap * 2);
      // Everyone waits, not just this write.
      nextWrite = Math.max(nextWrite, Date.now() + gap);
    }
  }
};

/** Signs in as the mailbox's superuser, again whenever the token has run out. */
export const signIn = async (): Promise<void> => {
  if (remote.authStore.isValid) return;
  await remote.collection("_superusers").authWithPassword(email, password);
};
