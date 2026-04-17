import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { buildAniStockQueryResultCards } from "../modules/finistocks/buildAniStockQueryResultCards";
import { buildSingleAniStockCard } from "../modules/finistocks/buildSingleAniStockCard";
import { AnimeSortOptions } from "../modules/finistocks/determineSort";
import { QueryHandler } from "../queries/QueryHandler";
import {
  createPaginationContext,
  createPaginationRow,
} from "../utilities/pagination/pagination";

export const data = new SlashCommandBuilder()
  .setName("anistock")
  .setDescription(
    "Manage your Anime Stocks portfolio and view anime stock info",
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("query")
      .setDescription(
        "Query an anime stock by title, MAL ID, record ID, or leave blank to view all",
      )
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription(
            "The title, MAL ID, or record ID of the anime to search for",
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("sort")
          .setDescription("The field to sort results by")
          .setRequired(false)
          .addChoices(
            ["title", "cheapest", "expensive", "latest", "oldest"].map(
              (field) => ({
                name: field,
                value: field,
              }),
            ),
          ),
      ),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      /* Query Subcommand */
      case "query": {
        const query = interaction.options.getString("query") || undefined;
        const sort = interaction.options.getString("sort") || undefined;

        const animeDetailsQuery = QueryHandler("anistock_details");
        const results = await animeDetailsQuery.query({
          queryString: query,
          page: 1,
          perPage: 5,
          sortOption: sort as AnimeSortOptions,
        });

        if (results.items.length === 0) {
          /* There are no results to show */
          await interaction.reply({
            content: `No anime found for query: "${query || "all"}"`,
            flags: [MessageFlags.Ephemeral],
          });
        } else if (results.items.length === 1) {
          /* There is a single result to show */
          const anime = results.items[0];

          const cardDetail = await buildSingleAniStockCard({ anime });

          await interaction.reply({
            components: [cardDetail],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
          });
        } else {
          // Save pagination context to database
          console.log("Saving pagination context with data:", {
            userId: interaction.user.id,
            queryId: animeDetailsQuery.id,
            query,
            sort,
          });
          const contextId = await createPaginationContext({
            userId: interaction.user.id,
            queryId: animeDetailsQuery.id,
            query,
            sort, // sort
            filters: undefined, // filters
          });
          console.log("Saved pagination context with ID:", contextId);

          /* There are multiple results to show */
          const animeResultsComponents = buildAniStockQueryResultCards({
            queryResults: results.items,
            userId: interaction.user.id,
            query,
            sort,
          });

          const pageRow = createPaginationRow({
            userId: interaction.user.id,
            currentPage: results.currentPage,
            totalPages: results.totalPages,
            contextId,
          });

          await interaction.reply({
            components: [...animeResultsComponents, pageRow],
            flags: [MessageFlags.IsComponentsV2],
          });
        }

        break;
      }

      default:
        await interaction.reply({
          content: "Unknown subcommand",
          flags: [MessageFlags.Ephemeral],
        });
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /anistock command", { error });
  } finally {
    logCommand();
  }
};
