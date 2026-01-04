import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { queryAnime } from "../../modules/finistocks/utilities";

export const namespace = "view_anistock_details";

/**
 * Button handler to view detailed anime stock information
 * @param interaction
 * @param args
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [animeId, userId] = args;

    // Fetch full anime details
    const queryResult = await queryAnime(animeId);
    if (queryResult.length === 0) {
      await interaction.reply({
        content: "❌ Anime not found",
        ephemeral: true,
      });
      return;
    }

    const anime = queryResult[0];

    // Create detailed embed
    const embed = new EmbedBuilder()
      .setTitle(anime.title)
      .setDescription(
        `Season: ${anime.season} | Year: ${anime.year} | Status: ${anime.status}`
      )
      .setImage(anime.image_url)
      .setColor(0x0099ff)
      .addFields(
        { name: "MAL ID", value: anime.mal_id.toString(), inline: true },
        {
          name: "Rating",
          value: anime.initial_popularity.toString(),
          inline: true,
        },
        {
          name: "Volitility",
          value: anime.volatility_rating,
          inline: true,
        }
      )
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
    });
  } catch (error) {
    console.error("Error handling view anime details:", error);
    await interaction.reply({
      content: "❌ Failed to load anime details",
      ephemeral: true,
    });
  }
}
