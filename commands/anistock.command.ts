import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { buildAniStockQueryResultCards } from "../modules/finistocks/buildAniStockQueryResultCards";
import { buildSingleAniStockCard } from "../modules/finistocks/buildSingleAniStockCard";
import { queryAnime } from "../modules/finistocks/queryAnime";
import { createPaginationRow } from "../utilities/pagination/pagination";
import { AnimeSortOptions } from "../modules/finistocks/determineSort";

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
            ["title", "cheapest", "expensive", "hype", "latest", "oldest"].map(
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
      case "query": {
        const query = interaction.options.getString("query") || undefined;
        const sort = interaction.options.getString("sort") || undefined;

        const results = await queryAnime(
          query,
          undefined,
          sort as AnimeSortOptions,
        );

        if (results.items.length === 0) {
          /* There are no results to show */
          await interaction.reply({
            content: `No anime found for query: "${query || "all"}"`,
            flags: [MessageFlags.Ephemeral],
          });
        } else if (results.items.length === 1) {
          /* There is a single result to show */
          const anime = results.items[0];

          const cardDetail = buildSingleAniStockCard({ anime });

          await interaction.reply({
            components: [cardDetail],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
          });
        } else {
          /* There are multiple results to show */
          const animeResultsComponents = buildAniStockQueryResultCards({
            QueryResults: results.items,
            UserId: interaction.user.id,
          });

          const pageRow = createPaginationRow({
            currentPage: results.currentPage,
            totalPages: results.totalPages,
            userId: interaction.user.id,
            namespace: "anistock_query",
            query: query || "",
            sort: sort || "",
          });

          await interaction.reply({
            components: [...animeResultsComponents, pageRow],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
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
