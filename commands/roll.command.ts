import type { SlashCommand } from "../types/handlers";
import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { randomNumber } from "../utilities/randomNumber";

/** Ten rolls to a row, right-aligned so the columns line up. */
const formatRolls = (rolls: number[]): string => {
  const ROLLS_PER_ROW = 10;
  const labels = rolls.map((roll) => roll.toLocaleString());
  const width = Math.max(...labels.map((label) => label.length));
  const aligned = labels.map((label) => label.padStart(width));
  const rows: string[] = [];
  for (let i = 0; i < aligned.length; i += ROLLS_PER_ROW) {
    rows.push(`| ${aligned.slice(i, i + ROLLS_PER_ROW).join(" | ")} |`);
  }
  return rows.join("\n");
};

export const data = new SlashCommandBuilder()
  .setName("roll")
  .setDescription("Rolls dice")
  .addNumberOption((option) =>
    option
      .setName("amount")
      .setDescription("the number of dice in total (default: 1)")
      .setRequired(false),
  )
  .addNumberOption((option) =>
    option
      .setName("sides")
      .setDescription("the number of sides on the dice (default 20)")
      .setRequired(false),
  );

export const execute: SlashCommand["execute"] = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  // 1 to 50 dice
  const amountOption = interaction.options.getNumber("amount") ?? 1;
  const amountOfDice = Math.min(Math.max(amountOption, 1), 50);

  // At least 2 sides; a d20 unless asked
  const sidesOption = interaction.options.getNumber("sides") ?? 20;
  const numberOfSides = Math.max(sidesOption, 2);

  // Array of dice rolls
  const results: number[] = [];

  for (let i = 0; i < amountOfDice; i++) {
    // Randomly generate dice roll
    const randomRoll = randomNumber(1, numberOfSides, true);
    results.push(randomRoll);
  }

  const table = `\`\`\`${formatRolls(results)}\`\`\``;

  let response = `Rolling ${amountOfDice}d${numberOfSides.toLocaleString()}: `;

  const total = results.reduce((n, sum) => sum + n, 0);

  response += table;
  response += `Your rolls had a total of: ${total.toLocaleString()}`;

  await interaction.reply(response);
  logCommand();
};
