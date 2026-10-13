import PocketBase from "pocketbase";
import type { CardRow, Definition } from "./types";

const url = (import.meta.env.VITE_POCKETBASE_URL as string | undefined) ?? "";

export const configured = !!url;
export const pb = new PocketBase(url);
// Several lists load at once; the client would cancel all but the last.
pb.autoCancellation(false);

/** Opens Discord's consent window and comes back signed in. */
export const signInWithDiscord = async (): Promise<void> => {
  await pb.collection("users").authWithOAuth2({ provider: "discord", scopes: ["identify"] });
};

export const signOut = (): void => pb.authStore.clear();

/**
 * Where a mailbox file is loaded from. On the deployed site that is the CDN
 * (`api/file.ts`), so pictures do not spend the visitor's hourly allowance of
 * requests to the mailbox; in development there is no CDN, and the mailbox is
 * asked directly.
 */
const fileUrl = (record: { id: string; collectionId: string }, name: string): string => {
  if (!name) return "";
  if (import.meta.env.DEV) return pb.files.getURL(record, name);
  return `/api/file?p=${record.collectionId}/${record.id}/${encodeURIComponent(name)}`;
};

export type Viewer = { id: string; name: string; avatar: string };

export const viewer = (): Viewer | null => {
  const record = pb.authStore.record;
  if (!pb.authStore.isValid || !record) return null;
  return {
    id: record.id,
    name: (record.name as string) || "Player",
    avatar: fileUrl(record, (record.avatar as string) ?? ""),
  };
};

export const artUrl = (definition: Definition): string => fileUrl(definition, definition.art);

export const faceUrl = (card: CardRow): string => fileUrl(card, card.face);

export const animationUrl = (card: CardRow): string => fileUrl(card, card.animation);

/**
 * Development only: `?token=...` signs in with a token made by hand, because
 * a local mailbox has no Discord application to sign in through. The whole
 * branch is dropped from a production build.
 */
export const devSignIn = async (): Promise<void> => {
  if (!import.meta.env.DEV) return;
  const token = new URLSearchParams(location.search).get("token");
  if (!token) return;
  pb.authStore.save(token, null);
  await pb.collection("users").authRefresh();
  history.replaceState(null, "", location.pathname + location.hash);
};
