import type {
  V2DeckRecord,
  V2UserCardRecord,
} from "../../../types/PocketbaseTablesV2";
import { pb } from "../../../utilities/pocketbase";
import { getUserCollection, V2_USER_CARD } from "../cardStore";
import {
  deleteDeck,
  getDecks,
  DECK_SIZE,
  MAX_DECKS_PER_USER,
  V2_DECK,
  validateDeckName,
} from "../decks";
import { remote } from "./remote";

/**
 * Requests from the site.
 *
 * The site cannot change anything. It leaves a request in the mailbox, and
 * Fini decides here whether to do it, checking everything against its own
 * database as if the request were a slash command typed by a stranger -
 * because the mailbox is public, and it may be exactly that.
 *
 * Decks can be asked for, a card can be shown in Discord, and a card can be
 * marked a favorite or to sell. Packs, selling and trades stay in Discord, so
 * the worst a bad request can do is rearrange a deck, mark a card - or post
 * one of the player's own cards in the Finicards channel, at most once a minute.
 */

export type WebRequestRecord = {
  id: string;
  /** The mailbox's user id - not a Discord id. */
  user: string;
  server_id: string;
  kind: "deck_save" | "deck_delete" | "card_show" | "card_mark";
  payload: unknown;
  status: "pending" | "applied" | "rejected";
  created: string;
};

/** A request left longer than this is refused rather than done late. */
export const REQUEST_STALE_MS = 10 * 60 * 1000;

export type DeckDecision =
  | { ok: false; reason: string }
  | { ok: true; action: "create"; name: string; cards: string[] }
  | {
      ok: true;
      action: "update";
      deckId: string;
      name: string;
      cards: string[];
    }
  | { ok: true; action: "delete"; deckId: string; name: string };

const refuse = (reason: string): DeckDecision => ({ ok: false, reason });

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Decides a deck request. Pure, and trusts nothing in `payload`: not its
 * shape, not that the cards are the player's, not that the deck is.
 *
 * @param owned Ids of every copy the player holds on the server
 * @param decks The player's decks on the server
 */
export const decideDeckRequest = (
  kind: string,
  payload: unknown,
  owned: Set<string>,
  decks: V2DeckRecord[],
): DeckDecision => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return refuse("That request could not be read.");
  }
  const { deckId, name, cards } = payload as Record<string, unknown>;
  if (deckId !== undefined && typeof deckId !== "string") {
    return refuse("That request could not be read.");
  }
  const target = deckId ? decks.find((deck) => deck.id === deckId) : undefined;
  if (deckId && !target) return refuse("That deck no longer exists.");

  if (kind === "deck_delete") {
    if (!target) return refuse("No deck was named.");
    return {
      ok: true,
      action: "delete",
      deckId: target.id ?? "",
      name: target.name,
    };
  }
  if (kind !== "deck_save")
    return refuse("Fini does not know that kind of request.");

  if (typeof name !== "string") return refuse("A deck needs a name.");
  const nameError = validateDeckName(name);
  if (nameError) return refuse(nameError);

  if (
    !Array.isArray(cards) ||
    cards.length > DECK_SIZE * 10 ||
    cards.some((id) => typeof id !== "string")
  ) {
    return refuse("That request could not be read.");
  }
  const chosen = [...new Set((cards as string[]).filter(Boolean))];

  const gone = chosen.filter((id) => !owned.has(id)).length;
  if (gone) {
    return refuse(
      `${gone} of those cards ${gone === 1 ? "is" : "are"} no longer in your collection. Reload and try again.`,
    );
  }
  if (chosen.length !== DECK_SIZE) {
    return refuse(
      `A deck is exactly ${DECK_SIZE} cards; that has ${chosen.length}.`,
    );
  }

  const clash = decks.find(
    (deck) => deck.id !== target?.id && sameName(deck.name, name),
  );
  if (clash) return refuse(`You already have a deck called ${clash.name}.`);

  if (target) {
    return {
      ok: true,
      action: "update",
      deckId: target.id ?? "",
      name: name.trim(),
      cards: chosen,
    };
  }
  if (decks.length >= MAX_DECKS_PER_USER) {
    return refuse(
      `You already have ${MAX_DECKS_PER_USER} decks. Delete one first.`,
    );
  }
  return { ok: true, action: "create", name: name.trim(), cards: chosen };
};

/**
 * Posts one of a player's cards in their server's Finicards channel, as the View
 * button shows it. Returns false when the server has no channel to post in. Given by
 * the bot, which holds the Discord client; without it, cards can't be shown.
 */
export type CardPoster = (
  serverId: string,
  discordId: string,
  copyId: string,
) => Promise<boolean>;

/** One card shown a minute, per player: the button is not a way to flood a channel. */
export const SHOW_COOLDOWN_MS = 60 * 1000;
const lastShown = new Map<string, number>();

/** Decides a request to show a card. Pure: the card must be one the player holds. */
export const decideCardShow = (
  payload: unknown,
  owned: Set<string>,
): { ok: false; reason: string } | { ok: true; cardId: string } => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "That request could not be read." };
  }
  const { card } = payload as Record<string, unknown>;
  if (typeof card !== "string" || !card)
    return { ok: false, reason: "That request could not be read." };
  if (!owned.has(card))
    return { ok: false, reason: "That card is no longer in your collection." };
  return { ok: true, cardId: card };
};

export type CardMarks = { favorite: boolean; to_sell: boolean };

/**
 * Decides a request to mark a card. Pure: the card must be one the player
 * holds, and a mark must be true or false. A card is never both a favorite
 * and to sell, so setting one clears the other.
 *
 * @param owned Each copy the player holds, by id, with its marks now
 */
export const decideCardMark = (
  payload: unknown,
  owned: Map<string, CardMarks>,
):
  | { ok: false; reason: string }
  | ({ ok: true; cardId: string } & CardMarks) => {
  const unreadable = {
    ok: false as const,
    reason: "That request could not be read.",
  };
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return unreadable;
  const { card, favorite, to_sell } = payload as Record<string, unknown>;
  if (typeof card !== "string" || !card) return unreadable;
  if (favorite === undefined && to_sell === undefined) return unreadable;
  if (favorite !== undefined && typeof favorite !== "boolean")
    return unreadable;
  if (to_sell !== undefined && typeof to_sell !== "boolean") return unreadable;
  if (favorite && to_sell)
    return { ok: false, reason: "A favorite can't be up for sale." };
  const now = owned.get(card);
  if (!now)
    return { ok: false, reason: "That card is no longer in your collection." };

  const marks = { ...now };
  if (favorite !== undefined) marks.favorite = favorite;
  if (to_sell !== undefined) marks.to_sell = to_sell;
  if (favorite) marks.to_sell = false;
  if (to_sell) marks.favorite = false;
  return { ok: true, cardId: card, ...marks };
};

/**
 * The Discord id behind a mailbox user, as Pocketbase recorded it at sign-in.
 * Read from the mailbox's own table - never from anything the request says.
 */
const discordIdOf = async (userId: string): Promise<string | null> => {
  const links = await remote.collection("_externalAuths").getFullList({
    filter: remote.filter("recordRef = {:user} && provider = 'discord'", {
      user: userId,
    }),
  });
  return (links[0]?.providerId as string) || null;
};

export type RequestOutcome = {
  status: "applied" | "rejected";
  message: string;
  deck?: string;
};

/** Checks one request and, if it stands, does it in Fini's database. */
export const resolveRequest = async (
  request: WebRequestRecord,
  now: number = Date.now(),
  { showCard }: { showCard?: CardPoster } = {},
): Promise<RequestOutcome> => {
  const reject = (message: string): RequestOutcome => ({
    status: "rejected",
    message,
  });

  const age = now - new Date(request.created.replace(" ", "T")).getTime();
  if (!(age < REQUEST_STALE_MS)) {
    return reject(
      "Fini was away when you asked. Nothing was changed - try again.",
    );
  }

  const discordId = await discordIdOf(request.user);
  if (!discordId) return reject("Sign in with Discord to change decks.");

  const collection = await getUserCollection(discordId, request.server_id);
  if (collection.length === 0)
    return reject("You have no cards on that server.");

  if (request.kind === "card_show") {
    if (!showCard) return reject("Fini can't post cards right now.");
    const decision = decideCardShow(
      request.payload,
      new Set(collection.map((card) => card.id ?? "")),
    );
    if (!decision.ok) return reject(decision.reason);
    const wait = (lastShown.get(discordId) ?? 0) + SHOW_COOLDOWN_MS - now;
    if (wait > 0)
      return reject(
        `You can show another card in ${Math.ceil(wait / 1000)} seconds.`,
      );
    if (!(await showCard(request.server_id, discordId, decision.cardId))) {
      return reject(
        "That server has no channel for Finicards. An admin can set one with /config finicards_channel.",
      );
    }
    lastShown.set(discordId, now);
    return {
      status: "applied",
      message: "Posted in the server's Finicards channel.",
    };
  }

  if (request.kind === "card_mark") {
    const decision = decideCardMark(
      request.payload,
      new Map(
        collection.map((card) => [
          card.id ?? "",
          { favorite: !!card.favorite, to_sell: !!card.to_sell },
        ]),
      ),
    );
    if (!decision.ok) return reject(decision.reason);
    await pb
      .collection<V2UserCardRecord>(V2_USER_CARD)
      .update(decision.cardId, {
        favorite: decision.favorite,
        to_sell: decision.to_sell,
      });
    return {
      status: "applied",
      message: decision.favorite
        ? "Marked a favorite."
        : decision.to_sell
          ? "Marked to sell."
          : "Unmarked.",
    };
  }

  const decks = await getDecks(discordId, request.server_id);
  const decision = decideDeckRequest(
    request.kind,
    request.payload,
    new Set(collection.map((card) => card.id ?? "")),
    decks,
  );
  if (!decision.ok) return reject(decision.reason);

  if (decision.action === "delete") {
    await deleteDeck(decision.deckId);
    return {
      status: "applied",
      message: `Deleted ${decision.name}.`,
      deck: decision.deckId,
    };
  }
  if (decision.action === "update") {
    await pb
      .collection<V2DeckRecord>(V2_DECK)
      .update(decision.deckId, { name: decision.name, cards: decision.cards });
    return {
      status: "applied",
      message: `Saved ${decision.name}.`,
      deck: decision.deckId,
    };
  }
  const created = await pb.collection<V2DeckRecord>(V2_DECK).create({
    user_id: discordId,
    server_id: request.server_id,
    identifier: collection[0].identifier ?? "",
    name: decision.name,
    cards: decision.cards,
  });
  return {
    status: "applied",
    message: `Saved ${decision.name}.`,
    deck: created.id,
  };
};

export const pendingRequests = async (): Promise<WebRequestRecord[]> =>
  remote.collection("web_request").getFullList<WebRequestRecord>({
    filter: 'status = "pending"',
    sort: "created",
  });

export const answerRequest = async (
  request: WebRequestRecord,
  outcome: RequestOutcome,
): Promise<void> => {
  await remote.collection("web_request").update(request.id, {
    status: outcome.status,
    message: outcome.message,
    deck: outcome.deck ?? "",
  });
};
