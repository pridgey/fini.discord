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

/** Signs in as the mailbox's superuser, again whenever the token has run out. */
export const signIn = async (): Promise<void> => {
  if (remote.authStore.isValid) return;
  await remote.collection("_superusers").authWithPassword(email, password);
};
