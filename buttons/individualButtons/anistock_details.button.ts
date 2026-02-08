import { ButtonInteraction, MessageFlags } from "discord.js";
import { buildSingleAniStockCard } from "../../modules/finistocks/buildSingleAniStockCard";
import { queryAnime } from "../../modules/finistocks/utilities";

export const namespace = "view_anistock_details";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [animeId, userId] = args;

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const queryResult = await queryAnime(animeId);
    if (queryResult.length === 0) {
      await interaction.reply({
        content: "❌ Anime not found",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const anime = queryResult[0];

    const cardDetail = buildSingleAniStockCard({ anime });

    await interaction.update({
      components: [cardDetail],
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (error) {
    console.error("Error handling view anime details:", error);
    await interaction.reply({
      content: "❌ Failed to load anime details",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
