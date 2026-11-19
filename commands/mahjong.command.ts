import type { SlashCommand } from "../types/handlers";
import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { moveTable, openTable, showHand } from "../modules/games/mahjong/table";
import { guideView } from "../modules/games/mahjong/views";
import type { Rules } from "../modules/games/mahjong/game";

/**
 * Mahjong for up to four people, with Fini's bots in the empty seats.
 * `open` posts a table to join; `rules` explains how to play, privately.
 */
export const data = new SlashCommandBuilder()
  .setName("mahjong")
  .setDescription("Play mahjong with up to four people (bots fill empty seats)")
  .addSubcommand((sub) =>
    sub
      .setName("open")
      .setDescription("Open a mahjong table for others to join")
      .addStringOption((opt) =>
        opt
          .setName("rules")
          .setDescription("Which mahjong to play")
          .setRequired(true)
          .addChoices(
            { name: "Riichi (Japanese)", value: "riichi" },
            { name: "Hong Kong", value: "hongkong" },
          ),
      )
      .addNumberOption((opt) =>
        opt
          .setName("buyin")
          .setDescription(
            "Finicoin each player puts in; paid out by final place (default 0)",
          )
          .setMinValue(0),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("hand")
      .setDescription(
        "Show your mahjong hand again, at the bottom of the chat",
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("table")
      .setDescription("Move your mahjong table down to the bottom of the chat"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("rules")
      .setDescription("How to play, for beginners")
      .addStringOption((opt) =>
        opt
          .setName("rules")
          .setDescription("Which mahjong")
          .setRequired(true)
          .addChoices(
            { name: "Riichi (Japanese)", value: "riichi" },
            { name: "Hong Kong", value: "hongkong" },
          ),
      ),
  );

export const execute: SlashCommand["execute"] = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const sub = interaction.options.getSubcommand();
  if ((sub === "hand" || sub === "table") && !interaction.guildId) {
    await interaction.reply({
      content: "Mahjong is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  if (sub === "hand") {
    await showHand(interaction);
    logCommand();
    return;
  }
  if (sub === "table") {
    await moveTable(interaction);
    logCommand();
    return;
  }
  const rules = interaction.options.getString("rules", true) as Rules;
  if (sub === "rules") {
    await interaction.reply({
      ...(await guideView("-", rules, 0)),
      flags: [MessageFlags.Ephemeral],
    });
    logCommand();
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Mahjong is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  // Whole cents, as the bank keeps it.
  const buyIn =
    Math.floor(Math.abs(interaction.options.getNumber("buyin") ?? 0) * 100) /
    100;
  await openTable(interaction, rules, buyIn);
  logCommand();
};
