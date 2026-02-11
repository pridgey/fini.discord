import {
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { AnimeRecord } from "./stockData";
import { AniStock_Detail } from "../../types/PocketbaseTables";

type BuildAniStockQueryResultCardsParams = {
  queryResults: AniStock_Detail[];
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
                  **Current Price:** $${anime.latest_price.toFixed(
                    2,
                  )} • **MAL ID:** ${anime.mal_id} •  **Rank:** ${
              anime.latest_rank
            }\n${trimSynopsis(anime.synopsis)}`),
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

const trimSynopsis = (synopsis: string | null, maxLength: number = 200) => {
  if (!synopsis) return "No synopsis available.";
  return synopsis.length > maxLength
    ? synopsis.slice(0, maxLength) + "..."
    : synopsis;
};
