import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
} from "discord.js";
import { AniStock_Detail } from "../../types/PocketbaseTables";

type BuildSingleAniStockCardParams = {
  anime: AniStock_Detail;
  userID: string;
};

/**
 * Utility function to build a detailed Discord message component for a single anime stock.
 */
export const buildSingleAniStockCard = async ({
  anime,
  userID,
}: BuildSingleAniStockCardParams) => {
  if (!anime.id) {
    throw new Error("Anime record must have an ID to fetch stock details.");
  }

  const buyButton = new ButtonBuilder()
    .setCustomId(`anistock_buy:${anime.id}:${userID}`)
    .setLabel("Buy")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>();
  row.setComponents([buyButton]);

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
        `**Price:** ${anime.latest_price.toFixed(2)} Finicoin • **Season:** ${
          anime.season || "N/A"
        } • **Year:** ${anime.year || "N/A"} • **Status:** ${
          anime.status
        } • **Rank:** ${anime.latest_rank}`,
      ),
    )
    .addSeparatorComponents((sep) => sep)
    .addTextDisplayComponents((text) =>
      text.setContent(`${anime.synopsis || "No synopsis available."}`),
    )
    .addActionRowComponents(() => row);

  return cardDetail;
};
