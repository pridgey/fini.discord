import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { QueryHandler } from "../queries/QueryHandler";
import {
  createPaginationContext,
  createPaginationRow,
} from "../utilities/pagination/pagination";

export const data = new SlashCommandBuilder()
  .setName("card-collection")
  .setDescription("List my finicard collection.")
  .addBooleanOption((option) =>
    option
      .setName("list")
      .setDescription("List all cards by text")
      .setRequired(false),
  )
  .addUserOption((opt) =>
    opt
      .setName("who")
      .setDescription(
        "Who's collection are you viewing? (Leave blank for your own)",
      )
      .setRequired(false),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    const listCards: boolean = Boolean(
      interaction.options.get("list")?.value || false,
    );
    const userCollection = interaction.options.getUser("who");

    await interaction.deferReply();

    const queryFilter = `user_id = "${
      userCollection?.id || interaction.user.id
    }" && server_id = "${interaction.guildId}"`;

    if (listCards) {
      /* ========== List all cards by text ========== */
      const cardsPerPage = 10;

      const cardCollectionListQuery = QueryHandler("card_collection_list");
      const queryResults = await cardCollectionListQuery.query({
        page: 1,
        perPage: cardsPerPage,
        filterOption: queryFilter,
      });

      if (queryResults.items.length === 0) {
        /* There are no results to show */
        await interaction.editReply({
          content: `${
            userCollection?.displayName || "You"
          } have no cards in their collection yet.`,
        });

        return;
      }

      const { components } = await cardCollectionListQuery.buildResults({
        items: queryResults.items,
        userId: interaction.user.id,
      });

      if (!components || components.length === 0) {
        await interaction.editReply({
          content: "Error building card collection list components.",
        });
        return;
      }

      // Create pagination row
      const contextId = await createPaginationContext({
        userId: interaction.user.id,
        queryId: cardCollectionListQuery.id,
        filter: queryFilter,
        perPage: cardsPerPage,
      });

      const pageRow = createPaginationRow({
        userId: interaction.user.id,
        currentPage: queryResults.currentPage,
        totalPages: queryResults.totalPages,
        contextId,
      });

      await interaction.editReply({
        components: [...components, pageRow],
        flags: [MessageFlags.IsComponentsV2],
      });
    } else {
      /* ========== Card by Card Paginated ========== */
      const cardCollectionQuery = QueryHandler("card_collection");
      const queryResults = await cardCollectionQuery.query({
        page: 1,
        perPage: 1,
        filterOption: queryFilter,
      });

      if (queryResults.items.length === 0) {
        /* There are no results to show */
        await interaction.editReply({
          content: `${
            userCollection?.displayName || "You"
          } have no cards in their collection yet.`,
        });

        return;
      }

      /* Show the collection */
      const contextId = await createPaginationContext({
        userId: interaction.user.id,
        queryId: cardCollectionQuery.id,
        filter: queryFilter,
        perPage: 1,
      });

      const pageRow = createPaginationRow({
        userId: interaction.user.id,
        currentPage: queryResults.currentPage,
        totalPages: queryResults.totalPages,
        contextId,
      });

      const { files } = await cardCollectionQuery.buildResults({
        items: queryResults.items,
        userId: interaction.user.id,
      });

      await interaction.editReply({
        components: [pageRow],
        files,
      });
    }
  } catch (err) {
    console.error("Error during user collection", err);
    if (interaction.replied) {
      interaction.editReply("Error during card-collection");
    } else {
      interaction.reply("Error during card-collection");
    }
  } finally {
    logCommand();
  }
};
