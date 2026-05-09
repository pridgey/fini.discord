import { ContainerBuilder } from "discord.js";
import { AniStock_Holdings } from "../../types/PocketbaseTables";
import {
  QueryFunction,
  QueryParams,
  ResultsBuilder,
} from "../../types/QueryTypes";
import { pb } from "../../utilities/pocketbase";

const queryAnistockHolding = async ({
  page,
  perPage,
  filterOption,
}: QueryParams) => {
  const results = await pb
    .collection<AniStock_Holdings>("anistock_holdings")
    .getList(page, perPage, {
      sort: "title",
      filter: filterOption,
      expand: "anime",
    });

  return {
    items: results.items,
    totalItems: results.totalItems,
    totalPages: results.totalPages,
    currentPage: results.page,
    perPage: results.perPage,
  };
};

const buildAnimeHoldingCard = async ({
  items,
}: ResultsBuilder<AniStock_Holdings>) => {
  const holdingItem = items.at(0);

  if (!holdingItem) {
    throw new Error("No holding found in ani stock holdings query results");
  }

  console.log("Debug - Building anime holding card for item:", {
    holdingItem,
    expand: holdingItem.expand,
  });

  const holdingDetail = new ContainerBuilder()
    .setAccentColor(0x0099ff)
    .addTextDisplayComponents((text) =>
      text.setContent(`## ${holdingItem.title}`),
    )
    .addMediaGalleryComponents((media) =>
      media.addItems((item) =>
        item
          .setURL(holdingItem.image_url)
          .setDescription(`${holdingItem.title} Image`),
      ),
    )
    .addTextDisplayComponents((text) =>
      text.setContent(
        `**Latest Price:** ${holdingItem.current_price.toFixed(
          2,
        )} Finicoin • **Season:** ${holdingItem.season || "N/A"} • **Year:** ${
          holdingItem.year || "N/A"
        } • **Status:** ${holdingItem.status || "N/A"}`,
      ),
    )
    .addSeparatorComponents((sep) => sep)
    .addTextDisplayComponents((text) =>
      text.setContent(
        `**Current Value:** ${holdingItem.current_value.toLocaleString()} • **Shares Owned:** ${
          holdingItem.shares_owned
        } • **Avg Buy Price:** ${holdingItem.avg_buy_price.toLocaleString()}`,
      ),
    );

  return {
    components: [holdingDetail],
    useComponentsV2: true,
  };
};

export const animeHoldingQuery: QueryFunction<AniStock_Holdings> = {
  query: queryAnistockHolding,
  id: "anistock_portfolio",
  buildResults: buildAnimeHoldingCard,
};
