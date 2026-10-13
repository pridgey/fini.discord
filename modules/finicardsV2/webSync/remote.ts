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

/** Shortest time between two writes to the mailbox, in milliseconds. */
const WRITE_GAP_MS = 80;
/** Waits after being told to slow down, in milliseconds. Then it gives up. */
const BACK_OFF_MS = [2_000, 5_000, 10_000, 20_000, 40_000];

let nextWrite = 0;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends one write to the mailbox, no faster than it will take them.
 *
 * A hosted Pocketbase sits behind a limiter that answers 429 to a burst - a
 * first send is thousands of rows - so writes are spaced out, and one that is
 * turned away waits and tries again rather than counting as failed.
 */
export const paced = async <T>(write: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    const now = Date.now();
    const turn = Math.max(now, nextWrite);
    nextWrite = turn + WRITE_GAP_MS;
    if (turn > now) await pause(turn - now);
    try {
      return await write();
    } catch (error) {
      const wait = BACK_OFF_MS[attempt];
      if ((error as { status?: number })?.status !== 429 || wait === undefined) throw error;
      // Everyone waits, not just this write.
      nextWrite = Math.max(nextWrite, Date.now() + wait);
    }
  }
};

/** Signs in as the mailbox's superuser, again whenever the token has run out. */
export const signIn = async (): Promise<void> => {
  if (remote.authStore.isValid) return;
  await remote.collection("_superusers").authWithPassword(email, password);
};
