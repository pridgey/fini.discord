import type {
  CardRarity,
  CardType,
  V2DeckRecord,
} from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
import { getUserCollection, toBattleCard } from "./cardStore";
import { RULES } from "./rules";
import type { BattleCard, OwnedCard } from "./types";

/**
 * Decks.
 *
 * A deck is what a battle draws from, and also how a player organises a
 * collection - so decks may overlap freely and a card can sit in several. Only
 * one deck is used per battle, so overlap can never cause a conflict.
 *
 * Drawing from a deck rather than the whole collection is what keeps collection
 * depth worth anything. Measured over 4000 matches, a 120-card collection beats
 * a 6-card one 69% of the time when both draw five from a deck they built, and
 * 50% - dead even - when the draw comes straight off the collection. A deck is
 * the difference between owning cards mattering and not.
 */

export const V2_DECK = "v2_deck";

/**
 * Every deck is played at exactly this size.
 *
 * Twenty, so a hand is a draw and not a choice: a battle deals five and a
 * dungeon run six, and a deck barely bigger than that would hand its owner the
 * same best cards every time. One size, because a range was no choice either -
 * hands are dealt at random, so every card past the minimum only waters down
 * the best ones, and everybody would have built the minimum.
 */
export const DECK_SIZE = 20;
export const MAX_DECKS_PER_USER = 10;
export const MAX_DECK_NAME_LENGTH = 32;

export const getDecks = async (
  userId: string,
  serverId: string,
): Promise<V2DeckRecord[]> =>
  pb.collection<V2DeckRecord>(V2_DECK).getFullList({
    filter: pb.filter("user_id = {:user_id} && server_id = {:server_id}", {
      user_id: userId,
      server_id: serverId,
    }),
    sort: "name",
  });

export const getDeck = async (deckId: string): Promise<V2DeckRecord | null> => {
  try {
    return await pb.collection<V2DeckRecord>(V2_DECK).getOne(deckId);
  } catch {
    return null;
  }
};

/** Finds a deck by name, case-insensitively, for a given owner. */
export const findDeckByName = async (
  userId: string,
  serverId: string,
  name: string,
): Promise<V2DeckRecord | null> => {
  const decks = await getDecks(userId, serverId);
  const needle = (name ?? "").trim().toLowerCase();
  return (
    decks.find((deck) => deck.name.toLowerCase() === needle) ??
    decks.find((deck) => deck.name.toLowerCase().startsWith(needle)) ??
    null
  );
};

export type DeckResult =
  { ok: true; deck: V2DeckRecord } | { ok: false; reason: string };

export const validateDeckName = (name: string): string | null => {
  const clean = (name ?? "").trim();
  if (!clean) return "A deck needs a name.";
  if (clean.length > MAX_DECK_NAME_LENGTH) {
    return `Deck names are limited to ${MAX_DECK_NAME_LENGTH} characters.`;
  }
  return null;
};

export type SaveDeckInput = {
  userId: string;
  serverId: string;
  identifier: string;
  name: string;
  cards: string[];
};

/**
 * Creates or replaces a deck by name.
 *
 * Cards are deduplicated: a deck holds specific copies, and the same copy twice
 * would let a player field one card in two slots of the same lineup.
 */
export const saveDeck = async (input: SaveDeckInput): Promise<DeckResult> => {
  const nameError = validateDeckName(input.name);
  if (nameError) return { ok: false, reason: nameError };

  const cards = [...new Set(input.cards.filter(Boolean))];

  if (cards.length !== DECK_SIZE) {
    return {
      ok: false,
      reason: `A deck is exactly ${DECK_SIZE} cards - a battle draws ${RULES.rounds + 2} from it. That has ${cards.length}.`,
    };
  }

  const existing = await findDeckByName(
    input.userId,
    input.serverId,
    input.name,
  );

  if (existing) {
    const updated = await pb
      .collection<V2DeckRecord>(V2_DECK)
      .update(existing.id!, { name: input.name.trim(), cards });
    return { ok: true, deck: updated };
  }

  const decks = await getDecks(input.userId, input.serverId);
  if (decks.length >= MAX_DECKS_PER_USER) {
    return {
      ok: false,
      reason: `You already have ${MAX_DECKS_PER_USER} decks. Delete one first.`,
    };
  }

  const created = await pb.collection<V2DeckRecord>(V2_DECK).create({
    user_id: input.userId,
    server_id: input.serverId,
    identifier: input.identifier,
    name: input.name.trim(),
    cards,
  });

  return { ok: true, deck: created };
};

export const deleteDeck = async (deckId: string): Promise<void> => {
  await pb.collection<V2DeckRecord>(V2_DECK).delete(deckId);
};

/** The deck a player brings when they don't name one, if they've set it. */
export const activeDeck = (decks: V2DeckRecord[]): V2DeckRecord | null =>
  decks.find((deck) => deck.active) ?? null;

/**
 * Makes `deck` the one its owner brings when they don't name a deck, and
 * clears any other they'd set - one active deck per player per server.
 */
export const setActiveDeck = async (deck: V2DeckRecord): Promise<void> => {
  const decks = await getDecks(deck.user_id, deck.server_id);
  for (const other of decks) {
    if (other.id !== deck.id && other.active)
      await pb.collection<V2DeckRecord>(V2_DECK).update(other.id!, {
        active: false,
      });
  }
  await pb.collection<V2DeckRecord>(V2_DECK).update(deck.id!, { active: true });
};

/**
 * Adds or removes cards on an existing deck. A deck may be left short - taking
 * one card out and putting another in is two steps - and simply cannot be
 * played until it is back to size. It may never go over.
 */
export const updateDeckCards = async (
  deck: V2DeckRecord,
  changes: { add?: string[]; remove?: string[] },
): Promise<DeckResult> => {
  const removing = new Set(changes.remove ?? []);
  const cards = [
    ...new Set([
      ...(deck.cards ?? []).filter((id) => !removing.has(id)),
      ...(changes.add ?? []),
    ]),
  ];

  if (cards.length > DECK_SIZE) {
    return {
      ok: false,
      reason: `A deck is exactly ${DECK_SIZE} cards and that would make ${cards.length}. Take one out first.`,
    };
  }

  const updated = await pb
    .collection<V2DeckRecord>(V2_DECK)
    .update(deck.id!, { cards });

  return { ok: true, deck: updated };
};

/* -------------------------------------------------------------------------- */
/* Auto-building                                                              */
/* -------------------------------------------------------------------------- */

export type DeckBuildFilter = {
  /** Only cards of this type. */
  type?: CardType;
  /** Only cards of this rarity. */
  rarity?: CardRarity;
  /** Only cards carrying this tag. */
  tag?: string;
};

/**
 * Builds a deck from a collection without anyone typing an id.
 *
 * Cards are ranked by their type stat, so "build me a deck" gives the strongest
 * legal answer to whatever filter was asked for. Ties keep collection order,
 * which makes the result stable if it is rebuilt.
 */
export const buildDeckCards = (
  collection: OwnedCard[],
  filter: DeckBuildFilter = {},
  /** Only the simulator asks for another size, to measure what size does. */
  size: number = DECK_SIZE,
): string[] => {
  const eligible = collection.filter((owned) => {
    const definition = owned.definition;
    if (filter.type && definition.card_type !== filter.type) return false;
    if (filter.rarity && definition.rarity !== filter.rarity) return false;
    if (filter.tag && !(definition.tags ?? []).includes(filter.tag)) {
      return false;
    }
    return true;
  });

  return eligible
    .map((owned) => ({ owned, card: toBattleCard(owned) }))
    .sort((a, b) => b.card.stats[b.card.type] - a.card.stats[a.card.type])
    .slice(0, size)
    .map((entry) => entry.owned.id!)
    .filter(Boolean);
};

export type AutoBuildResult =
  | { ok: true; deck: V2DeckRecord; taken: number; eligible: number }
  | { ok: false; reason: string };

export const autoBuildDeck = async (input: {
  userId: string;
  serverId: string;
  identifier: string;
  name: string;
  filter?: DeckBuildFilter;
}): Promise<AutoBuildResult> => {
  const collection = await getUserCollection(input.userId, input.serverId);

  if (collection.length < DECK_SIZE) {
    return {
      ok: false,
      reason: `You have ${collection.length} cards and a deck is ${DECK_SIZE}. Try \`/finicard pack\`.`,
    };
  }

  const cards = buildDeckCards(collection, input.filter);

  if (cards.length < DECK_SIZE) {
    return {
      ok: false,
      reason: `Only ${cards.length} of your cards match that filter, and a deck is ${DECK_SIZE}.`,
    };
  }

  const saved = await saveDeck({
    userId: input.userId,
    serverId: input.serverId,
    identifier: input.identifier,
    name: input.name,
    cards,
  });

  if (!saved.ok) return saved;

  return {
    ok: true,
    deck: saved.deck,
    taken: cards.length,
    eligible: collection.length,
  };
};

/* -------------------------------------------------------------------------- */
/* Reading a deck for play                                                    */
/* -------------------------------------------------------------------------- */

export type DeckContents = {
  deck: V2DeckRecord;
  /** Cards still owned, in deck order. */
  cards: BattleCard[];
  /** Ids in the deck whose card is gone - sold, traded, or deleted. */
  missing: string[];
};

/**
 * Why a deck may not be played, or null if it may. A deck is checked when it
 * is built and edited, but it can shrink afterwards - a card in it sold or
 * traded away leaves a hole - so it is checked again whenever a hand is about
 * to be dealt from it.
 */
export const unplayableReason = (contents: DeckContents): string | null => {
  if (contents.cards.length >= DECK_SIZE) return null;
  const gone = contents.missing.length;
  return `**${contents.deck.name}** has ${contents.cards.length} cards and a deck needs ${DECK_SIZE} to play.${
    gone > 0
      ? ` ${gone} of its cards ${gone === 1 ? "is" : "are"} no longer in your collection.`
      : ""
  } Add more with \`/finicard deck add\`.`;
};

/**
 * Loads a deck's playable contents.
 *
 * A deck stores specific copies, so a card sold or traded away leaves a hole.
 * Those are reported rather than silently dropped, and a deck that can no longer
 * fill a hand is caught before a battle starts rather than mid-draw.
 */
export const loadDeck = async (
  deck: V2DeckRecord,
  serverId: string,
): Promise<DeckContents> => {
  const collection = await getUserCollection(deck.user_id, serverId);
  const owned = new Map(collection.map((entry) => [entry.id!, entry]));

  const cards: BattleCard[] = [];
  const missing: string[] = [];

  for (const id of deck.cards ?? []) {
    const match = owned.get(id);
    if (match) cards.push(toBattleCard(match));
    else missing.push(id);
  }

  return { deck, cards, missing };
};
