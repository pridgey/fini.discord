import { ButtonInteraction, MessageFlags } from "discord.js";
import { QueryHandler } from "../../queries/QueryHandler";

export const namespace = "view_userCard_detail";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [cardId, userId] = args;

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const cardDetailQuery = QueryHandler("card_collection");
    const queryResult = await cardDetailQuery.query({
      page: 1,
      perPage: 1,
      filterOption: `id = "${cardId}"`,
    });

    if (queryResult.items.length === 0) {
      await interaction.reply({
        content: "❌ Card not found",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const { files } = await cardDetailQuery.buildResults({
      items: queryResult.items,
      userId,
    });

    await interaction.reply({
      files,
    });
  } catch (error) {
    console.error("Error handling view card details:", error);
    await interaction.reply({
      content: "❌ Failed to load card details",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
