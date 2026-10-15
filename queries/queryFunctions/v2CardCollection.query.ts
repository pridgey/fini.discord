import { ButtonStyle, ContainerBuilder } from "discord.js";
import { V2_USER_CARD, toBattleCard } from "../../modules/finicardsV2/cardStore";
import { getDecks } from "../../modules/finicardsV2/decks";
import {
  NEUTRAL_ACCENT,
  activeKeyword,
  cardLine,
  rarityLabel,
} from "../../modules/finicardsV2/ui/theme";
import type { V2DeckRecord, V2UserCardRecord } from "../../types/PocketbaseTablesV2";
import {
  QueryFunction,
  QueryParams,
  ResultsBuilder,
} from "../../types/QueryTypes";
import { pb } from "../../utilities/pocketbase";

/**
 * The finicards v2 collection, as a page of the shared pagination system.
 *
 * v2's collection used to slice itself in memory and print a wall of text with
 * a manual `page:` option, which made it the only listing surface in the bot
 * that didn't work like the rest of them. As a query function it gets the
 * prev/next buttons for free, and - more to the point - each row can carry a
 * button, so a card can be looked at without copying its id into another
 * command.
 */

/**
 * Sorted newest-first, matching `getUserCollection`, unless the page was
 * asked for in another order (`collectionFilters.ts`).
 */
const queryV2CardCollection = async ({
  page,
  perPage,
  filterOption,
  sortOption,
}: QueryParams) => {
  const results = await pb
    .collection<V2UserCardRecord>(V2_USER_CARD)
    .getList(page, perPage, {
      sort: sortOption || "-created",
      filter: filterOption,
      expand: "card",
    });

  return {
    items: results.items,
    totalItems: results.totalItems,
    totalPages: results.totalPages,
    currentPage: results.page,
    perPage: results.perPage,
  };
};

/**
 * The names of the decks each card is in, by card id. A copy can sit in more
 * than one deck, so each card gets a list.
 */
export const deckNamesByCard = (decks: V2DeckRecord[]): Map<string, string[]> => {
  const names = new Map<string, string[]>();
  for (const deck of decks) {
    for (const cardId of new Set(deck.cards ?? [])) {
      names.set(cardId, [...(names.get(cardId) ?? []), deck.name]);
    }
  }
  return names;
};

/**
 * The decks of every owner on the page. A page is one player's cards on one
 * server, so this is one read; a failed read just leaves the deck names off.
 */
const decksForPage = async (items: V2UserCardRecord[]): Promise<V2DeckRecord[]> => {
  const owners = new Map(items.map((item) => [`${item.user_id}:${item.server_id}`, item]));
  try {
    const lists = await Promise.all(
      [...owners.values()].map((item) => getDecks(item.user_id, item.server_id)),
    );
    return lists.flat();
  } catch {
    return [];
  }
};

/**
 * One section per card, each with a View button.
 *
 * `queryString` carries the owner label rather than a search term. The
 * pagination context has no field for "a heading to reprint on every page",
 * and `query` is already a free-text string threaded through to every page -
 * `/anistock` uses it the same way. The alternative was re-reading the whole
 * collection on every page turn just to recount it.
 */
const buildV2CardCollectionResult = async ({
  items,
  userId,
  queryString,
  contextId,
}: ResultsBuilder<V2UserCardRecord>) => {
  const container = new ContainerBuilder().setAccentColor(NEUTRAL_ACCENT);

  container.addTextDisplayComponents((text) =>
    text.setContent(`## 🎴 ${queryString || "Collection"}`),
  );

  const inDecks = deckNamesByCard(await decksForPage(items));

  for (const item of items) {
    // A row whose definition failed to expand can't be rendered or battled
    // with; skipping beats printing a blank line with a dead button.
    if (!item.expand?.card) continue;

    const card = toBattleCard({ ...item, definition: item.expand.card });
    const keyword = activeKeyword(card);
    const decks = inDecks.get(item.id ?? "") ?? [];
    const details = [
      rarityLabel(card),
      keyword ? `_${keyword.name}_` : "",
      decks.length > 0 ? `🃏 ${decks.join(", ")}` : "",
      card.series || "no series",
      `id \`${card.instanceId}\``,
    ].filter(Boolean);

    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(
            `${cardLine(card)}\n-# ${details.join(" · ")}`,
          ),
        )
        .setButtonAccessory((button) =>
          button
            .setCustomId(`v2_card_view:${contextId}:${item.id}:${userId}`)
            .setLabel("View")
            .setStyle(ButtonStyle.Secondary),
        ),
    );
  }

  container.addTextDisplayComponents((text) =>
    text.setContent("-# Stats read power/wit/heart."),
  );

  return {
    components: [container],
    useComponentsV2: true,
  };
};

export const v2CardCollectionQuery: QueryFunction<V2UserCardRecord> = {
  query: queryV2CardCollection,
  id: "v2_card_collection",
  buildResults: buildV2CardCollectionResult,
};
