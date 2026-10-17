import type {
  V2DeckRecord,
  V2UserCardRecord,
} from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
import { getOwnedCard, V2_USER_CARD } from "./cardStore";
import { V2_DECK } from "./decks";
import type { BattleCard, OwnedCard } from "./types";

/**
 * Selling and trading v2 cards.
 *
 * A card changes hands whole: the copy keeps its keyword, its foil, its number
 * and - for a Legendary - its effect. Selling to Fini destroys the copy, which
 * frees its place in the server's population for a pack to hand out again.
 */

/**
 * What Fini pays for a card, by what the card is. v1 paid 2, 5 and 10 for a
 * common, an uncommon and a full-art, and those carry over.
 */
export const FINI_BUYBACK = {
  common: 2,
  uncommon: 5,
  full_art: 10,
  secret_art: 25,
  legendary: 50,
} as const;

/** How much more Fini pays for a foil copy: half again, rounded up. */
export const FOIL_BUYBACK_BONUS = 1.5;

/** What Fini pays for this copy. */
export const buybackPrice = (
  card: Pick<BattleCard, "rarity" | "secretArt" | "legendary"> & {
    foil?: boolean;
  },
): number => {
  const base = card.legendary
    ? FINI_BUYBACK.legendary
    : card.secretArt
      ? FINI_BUYBACK.secret_art
      : FINI_BUYBACK[card.rarity];
  return card.foil ? Math.ceil(base * FOIL_BUYBACK_BONUS) : base;
};

/**
 * A copy by the id a player typed, if it is theirs on this server. Ids are
 * long, so the start of one is enough when it matches only one of their cards.
 */
export const findSellable = async (
  userId: string,
  serverId: string,
  typed: string,
): Promise<OwnedCard | null> => {
  const needle = (typed ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]{4,15}$/.test(needle)) return null;

  const owned = await pb
    .collection<V2UserCardRecord>(V2_USER_CARD)
    .getFullList({
      filter: `user_id = "${userId.replace(/["\\]/g, "")}" && server_id = "${serverId.replace(/["\\]/g, "")}" && id ~ "${needle}"`,
      requestKey: null,
    });
  const matches = owned.filter((copy) => (copy.id ?? "").startsWith(needle));
  const match =
    matches.find((copy) => copy.id === needle) ??
    (matches.length === 1 ? matches[0] : null);
  return match?.id ? getOwnedCard(match.id) : null;
};

/** Whether `userId` still holds this copy - it may have been sold while a listing sat open. */
export const stillOwns = async (
  userId: string,
  copyId: string,
): Promise<boolean> => {
  const copy = await getOwnedCard(copyId);
  return !!copy && copy.user_id === userId;
};

/** Takes a copy out of every deck its owner has it in. A deck may be left short. */
export const removeFromDecks = async (
  userId: string,
  serverId: string,
  copyId: string,
): Promise<number> => {
  const decks = await pb.collection<V2DeckRecord>(V2_DECK).getFullList({
    filter: `user_id = "${userId.replace(/["\\]/g, "")}" && server_id = "${serverId.replace(/["\\]/g, "")}"`,
    requestKey: null,
  });
  let changed = 0;
  for (const deck of decks) {
    if (!(deck.cards ?? []).includes(copyId)) continue;
    await pb.collection<V2DeckRecord>(V2_DECK).update(deck.id!, {
      cards: deck.cards.filter((id) => id !== copyId),
    });
    changed += 1;
  }
  return changed;
};

/** Moves a copy to another player, and out of the seller's decks. */
export const handOver = async (
  copy: OwnedCard,
  toUserId: string,
  identifier: string,
): Promise<void> => {
  await removeFromDecks(copy.user_id, copy.server_id, copy.id ?? "");
  await pb.collection<V2UserCardRecord>(V2_USER_CARD).update(copy.id ?? "", {
    user_id: toUserId,
    identifier,
    acquired_from: "trade",
  });
};

/** Fini buys the copy: it is destroyed, and comes out of the seller's decks. */
export const sellToFini = async (copy: OwnedCard): Promise<void> => {
  await removeFromDecks(copy.user_id, copy.server_id, copy.id ?? "");
  await pb.collection<V2UserCardRecord>(V2_USER_CARD).delete(copy.id ?? "");
};
