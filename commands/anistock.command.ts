import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
} from "discord.js";
import { queryAnime } from "../modules/finistocks/utilities";

export const data = new SlashCommandBuilder()
  .setName("anistock")
  .setDescription(
    "Manage your Anime Stocks portfolio and view anime stock info"
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("query")
      .setDescription(
        "Query an anime stock by title, MAL ID, record ID, or leave blank to view all"
      )
      .addStringOption((option) =>
        option
          .setName("query")
          .setDescription(
            "The title, MAL ID, or record ID of the anime to search for"
          )
          .setRequired(false)
      )
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void
) => {
  try {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "query": {
        const query = interaction.options.getString("query") || undefined;

        const results = await queryAnime(query);

        if (results.length === 0) {
          await interaction.reply({
            content: `No anime found for query: "${query || "all"}"`,
            ephemeral: true,
          });
        } else if (results.length === 1) {
          const anime = results[0];
          await interaction.reply({
            content: `Found anime: **${anime.title}** (MAL ID: ${anime.mal_id}, Record ID: ${anime.id})`,
            ephemeral: true,
          });
        } else {
          const animeResultsComponents: SectionBuilder[] = [];

          results.slice(0, 10).forEach((anime) => {
            const animeResultsSection = new SectionBuilder();

            animeResultsSection
              .addTextDisplayComponents((textDisplay) =>
                textDisplay.setContent(
                  `## **${anime.title}**\nMAL ID: ${anime.mal_id}\nRecord ID: ${anime.id}\nCurrent Price: $0}\nHype Score: ${anime.initial_hype_score}\nVolatility Rating: ${anime.volatility_rating}`
                )
              )
              .setButtonAccessory((button) =>
                button
                  .setCustomId(
                    `view_anistock_details:${anime.id}:${interaction.user.id}`
                  )
                  .setLabel("See More")
                  .setStyle(ButtonStyle.Secondary)
              );
            animeResultsComponents.push(animeResultsSection);
          });

          console.log("Anime results components:", {
            lenth: animeResultsComponents.length,
          });

          await interaction.reply({
            components: animeResultsComponents,
            flags: MessageFlags.IsComponentsV2,
          });
        }

        break;
      }

      default:
        await interaction.reply({
          content: "Unknown subcommand",
          ephemeral: true,
        });
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /anistock command", { error });
  } finally {
    logCommand();
  }
};
