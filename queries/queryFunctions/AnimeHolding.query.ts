import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
} from "discord.js";
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

  const sellButton = new ButtonBuilder()
    .setCustomId(
      `anistock_sell:${holdingItem.id}:${holdingItem.user_id.slice(1)}`,
    )
    .setLabel("Sell")
    .setStyle(ButtonStyle.Secondary);

  const sellActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    sellButton,
  );

  const investedTotal = holdingItem.total_invested;
  const currentTotal = holdingItem.current_value;
  const profitLoss = currentTotal - investedTotal;
  const profitLossPercent =
    investedTotal === 0 ? 0 : (profitLoss / investedTotal) * 100;
  const profitLossString =
    profitLoss >= 0
      ? `+${profitLoss.toLocaleString()}`
      : profitLoss.toLocaleString();
  const percentageString = `(${
    profitLossPercent >= 0 ? "+" : ""
  }${profitLossPercent.toFixed(2)}%)`;

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
        `**Season:** ${holdingItem.season || "N/A"} • **Year:** ${
          holdingItem.year || "N/A"
        } • **Status:** ${holdingItem.status || "N/A"}`,
      ),
    )
    .addSeparatorComponents((sep) => sep)
    .addTextDisplayComponents((text) =>
      text.setContent(
        `**Latest Price:** ${holdingItem.current_price.toFixed(
          2,
        )} • **Shares Owned:** ${
          holdingItem.shares_owned
        } • **Avg Buy Price:** ${holdingItem.avg_buy_price.toLocaleString()}`,
      ),
    )
    .addSeparatorComponents((sep) => sep)
    .addTextDisplayComponents((text) =>
      text.setContent(
        `**Current Value:** ${holdingItem.current_value.toLocaleString()} • **Overall Change:** ${profitLossString} ${percentageString}`,
      ),
    )
    .addActionRowComponents(() => sellActionRow);

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
