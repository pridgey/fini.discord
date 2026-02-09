import { ContainerBuilder } from "discord.js";
import { AnimeRecord } from "./stockData";

type BuildSingleAniStockCardParams = {
  anime: AnimeRecord;
};

/**
 * Utility function to build a detailed Discord message component for a single anime stock.
 */
export const buildSingleAniStockCard = ({
  anime,
}: BuildSingleAniStockCardParams) => {
  const cardDetail = new ContainerBuilder()
    .setAccentColor(0x0099ff)
    .addTextDisplayComponents((text) => text.setContent(`## ${anime.title}`))
    .addMediaGalleryComponents((media) =>
      media.addItems((item) =>
        item.setURL(anime.image_url).setDescription(`${anime.title} Image`),
      ),
    )
    .addTextDisplayComponents((text) =>
      text.setContent(
        `**Season:** ${anime.season || "N/A"} • **Year:** ${
          anime.year || "N/A"
        } • **Status:** ${
          anime.status
        } • **Price:** $${anime.initial_stock_price.toFixed(2)}`,
      ),
    )
    .addSeparatorComponents((sep) => sep)
    .addTextDisplayComponents((text) =>
      text.setContent(`${anime.synopsis || "No synopsis available."}`),
    );

  return cardDetail;
};
