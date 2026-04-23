import { ButtonInteraction, MessageFlags } from "discord.js";
import { QueryHandler } from "../../queries/QueryHandler";
import {
  createPaginationRow,
  getPaginationContext,
} from "../../utilities/pagination/pagination";

export const namespace = "booster_pack_open";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [userId, contextId] = args;

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const context = await getPaginationContext(contextId);

    if (!context) {
      await interaction.reply({
        content: "❌ This pagination session has expired.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const boosterPackQuery = QueryHandler("user_card");
    const queryResult = await boosterPackQuery.query({
      page: 1,
      perPage: 1,
      filterOption: context.filter,
    });
    const boosterPackResults = await boosterPackQuery.buildResults({
      items: queryResult.items,
      userId,
    });

    const paginationRow = createPaginationRow({
      userId,
      currentPage: context.current_page || 1,
      totalPages: queryResult.totalPages,
      contextId,
    });

    await interaction.update({
      components: [paginationRow],
      files: boosterPackResults.files,
      ...(boosterPackResults.useComponentsV2 && {
        flags: [MessageFlags.IsComponentsV2],
      }),
    });
  } catch (error) {
    console.error("Error handling booster pack open button actions:", error);
    await interaction.reply({
      content: "❌ Failed to handle booster pack open action",
    });
  }
}
