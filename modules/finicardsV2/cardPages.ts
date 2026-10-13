import { MessageFlags } from "discord.js";
import { QueryHandler } from "../../queries/QueryHandler";
import type { V2DeckRecord } from "../../types/PocketbaseTablesV2";
import {
  createPaginationContext,
  createPaginationRow,
} from "../../utilities/pagination/pagination";
import { BINDER_PAGE_SIZE } from "./cardArt";
import { DECK_SIZE, loadDeck } from "./decks";
import { compositionString } from "./ui/theme";

/**
 * A set of a player's cards as pages - the list, or the binder - with
 * prev/next and a View button per card.
 *
 * The collection and a deck are both shown this way. They differ only in
 * which cards `filter` picks out and in the heading printed on every page, so
 * anything added to one view (a sort, a filter) is added to both.
 */

/** Lower than the old text listing: a section with a button is a taller row. */
export const COLLECTION_PAGE_SIZE = 10;

export type CardPagesInput = {
  /** Whose buttons these are: the player looking, not the cards' owner. */
  viewerId: string;
  heading: string;
  /** A `v2_user_card` filter picking out the cards to show. */
  filter: string;
  binder: boolean;
};

/** The first page, ready to send as a reply or to put in place of a message. */
export const buildCardPages = async (input: CardPagesInput) => {
  const perPage = input.binder ? BINDER_PAGE_SIZE : COLLECTION_PAGE_SIZE;
  const query = QueryHandler(input.binder ? "v2_card_binder" : "v2_card_collection");
  const results = await query.query({ page: 1, perPage, filterOption: input.filter });

  // The heading rides in the context's `query` field, which is threaded to
  // `buildResults` on every page turn, so no page has to recount the cards.
  const contextId = await createPaginationContext({
    userId: input.viewerId,
    queryId: query.id,
    filter: input.filter,
    query: input.heading,
    perPage,
  });

  const { components, files } = await query.buildResults({
    items: results.items,
    userId: input.viewerId,
    queryString: input.heading,
    contextId,
  });

  const pageRow = createPaginationRow({
    userId: input.viewerId,
    currentPage: results.currentPage,
    totalPages: results.totalPages,
    contextId,
  });

  return {
    components: [...(components ?? []), pageRow],
    files: files ?? [],
    flags: [MessageFlags.IsComponentsV2] as [MessageFlags.IsComponentsV2],
  };
};

/**
 * A deck as pages: the same view as the collection, narrowed to the copies in
 * the deck. Null when none of its cards are still owned - there is nothing to
 * page through, and the caller says so.
 */
export const buildDeckPages = async (
  deck: V2DeckRecord,
  input: { viewerId: string; binder: boolean },
) => {
  const contents = await loadDeck(deck, deck.server_id);
  if (contents.cards.length === 0) return null;

  const composition = { power: 0, wit: 0, heart: 0 };
  for (const card of contents.cards) composition[card.type] += 1;
  const notes = [
    contents.missing.length > 0 ? `${contents.missing.length} no longer owned` : "",
    contents.cards.length < DECK_SIZE ? `too small to play, needs ${DECK_SIZE}` : "",
  ].filter(Boolean);

  return buildCardPages({
    viewerId: input.viewerId,
    binder: input.binder,
    heading: `Deck: ${deck.name} — ${contents.cards.length} cards ${compositionString(composition)}${
      notes.length > 0 ? ` · ⚠️ ${notes.join(", ")}` : ""
    }`,
    filter: `user_id = "${deck.user_id}" && server_id = "${deck.server_id}" && (${contents.cards
      .map((card) => `id = "${card.instanceId}"`)
      .join(" || ")})`,
  });
};
