import {
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { AnimeRecord } from "./stockData";

type BuildAniStockQueryResultCardsParams = {
  queryResults: AnimeRecord[];
  userId: string;
  query?: string;
  sort?: string;
};

/**
 * Utility function to build Discord message components for anime stock query results.
 */
export const buildAniStockQueryResultCards = ({
  queryResults,
  userId,
  query,
  sort,
}: BuildAniStockQueryResultCardsParams) => {
  if (queryResults.length === 0) {
    throw new Error("No anime found for the given query");
  }

  const animeResultsComponents: (ContainerBuilder | TextDisplayBuilder)[] = [];

  const titleText = new TextDisplayBuilder().setContent(
    `**Anime Stock Results**\n${
      query ? `Queried: "${query}"` : "All Results"
    } ${sort ? `by ${sort}` : ""}`,
  );
  animeResultsComponents.push(titleText);

  queryResults.slice(0, 5).forEach((anime, index) => {
    const resultContainer = new ContainerBuilder();

    resultContainer
      .addTextDisplayComponents((text) => text.setContent(`## ${anime.title}`))
      .addSectionComponents((section) =>
        section
          .addTextDisplayComponents((text) =>
            text.setContent(`
                  **MAL ID:** ${
                    anime.mal_id
                  } • **Current Price:** $${anime.initial_stock_price.toFixed(
              2,
            )} • **Hype Score:** ${anime.initial_hype_score}`),
          )
          .setButtonAccessory((button) =>
            button
              .setCustomId(`view_anistock_details:${anime.id}:${userId}`)
              .setLabel("See More")
              .setStyle(ButtonStyle.Secondary),
          ),
      );
    animeResultsComponents.push(resultContainer);
  });

  return animeResultsComponents;
};
