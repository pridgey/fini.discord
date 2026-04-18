import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  createPaginationContext,
  createPaginationRow,
  PaginationState,
} from "../../utilities/pagination/pagination";
import { QueryHandler } from "../../queries/QueryHandler";

export const namespace = "booster_pack_open";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [userId] = args;

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const paginationState: PaginationState = {
      userId,
      currentPage: 1,
      totalPages: 5,
      namespace: "user_card",
    };

    const paginationContext = await createPaginationContext({
      userId,
      queryId: "user_card",
      perPage: 1,
    });

    const boosterPackQuery = QueryHandler("user_card");
    const queryResult = await boosterPackQuery.query({
      page: 1,
      perPage: 1,
      filterOption: `user_id = "${userId}" && server_id = "${interaction.guildId}"`,
      additionalData: { totalCards: 1 },
    });
    const boosterPackResults = await boosterPackQuery.buildResults({
      items: queryResult.items,
      userId,
    });

    console.log("debug - booster pack query result:", {
      queryResult,
      boosterPackResults,
      file: boosterPackResults.files?.[0],
    });

    const paginationRow = createPaginationRow({
      ...paginationState,
      contextId: paginationContext,
    });

    await interaction.update({
      components: [paginationRow],
      files: boosterPackResults.files,
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (error) {
    console.error("Error handling booster pack open button actions:", error);
    await interaction.reply({
      content: "❌ Failed to handle booster pack open action",
    });
  }
}
