import { ButtonStyle, ContainerBuilder } from "discord.js";
import { AnimeRecord } from "./stockData";

type BuildAniStockQueryResultCardsParams = {
  QueryResults: AnimeRecord[];
  UserId: string;
};

/**
 * Utility function to build Discord message components for anime stock query results.
 */
export const buildAniStockQueryResultCards = ({
  QueryResults,
  UserId,
}: BuildAniStockQueryResultCardsParams) => {
  if (QueryResults.length === 0) {
    throw new Error("No anime found for the given query");
  }

  const animeResultsComponents: ContainerBuilder[] = [];

  QueryResults.slice(0, 5).forEach((anime) => {
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
              .setCustomId(`view_anistock_details:${anime.id}:${UserId}`)
              .setLabel("See More")
              .setStyle(ButtonStyle.Secondary),
          ),
      );
    animeResultsComponents.push(resultContainer);
  });

  return animeResultsComponents;
};
