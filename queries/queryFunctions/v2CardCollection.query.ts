import { ButtonStyle, ContainerBuilder } from "discord.js";
import { V2_USER_CARD, toBattleCard } from "../../modules/finicardsV2/cardStore";
import { NEUTRAL_ACCENT, cardLine, rarityLabel } from "../../modules/finicardsV2/ui/theme";
import type { V2UserCardRecord } from "../../types/PocketbaseTablesV2";
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
 * Sorted newest-first, matching `getUserCollection`.
 *
 * Grouping by rarity would read better, but `v2_card_definition` has no
 * `rarity_order` column the way v1's `card_definition` does, and the rarity
 * names don't sort usefully as strings ("common", "full_art", "uncommon").
 * That wants a migration rather than a surprising sort here.
 */
const queryV2CardCollection = async ({
  page,
  perPage,
  filterOption,
}: QueryParams) => {
  const results = await pb
    .collection<V2UserCardRecord>(V2_USER_CARD)
    .getList(page, perPage, {
      sort: "-created",
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
    text.setContent(`## 🎴 ${queryString || "v2 collection"}`),
  );

  for (const item of items) {
    // A row whose definition failed to expand can't be rendered or battled
    // with; skipping beats printing a blank line with a dead button.
    if (!item.expand?.card) continue;

    const card = toBattleCard({ ...item, definition: item.expand.card });

    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(
            `${cardLine(card)}\n-# ${rarityLabel(card)} · ${card.series || "no series"} · id \`${card.instanceId}\``,
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
