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

export type Viewer = { id: string; name: string; avatar: string };

export const viewer = (): Viewer | null => {
  const record = pb.authStore.record;
  if (!pb.authStore.isValid || !record) return null;
  return {
    id: record.id,
    name: (record.name as string) || "Player",
    avatar: record.avatar ? pb.files.getURL(record, record.avatar as string) : "",
  };
};

export const artUrl = (definition: Definition): string =>
  definition.art ? pb.files.getURL(definition, definition.art) : "";

export const faceUrl = (card: CardRow): string => (card.face ? pb.files.getURL(card, card.face) : "");

export const animationUrl = (card: CardRow): string =>
  card.animation ? pb.files.getURL(card, card.animation) : "";

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
