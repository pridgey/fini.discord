import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { randomNumber } from "../utilities/randomNumber";

function formatNums(nums) {
  const itemsPerRow = 10;
  let formattedNums = nums.map((n) => n.toLocaleString());
  let maxLen = Math.max(...formattedNums.map((s) => s.length));
  let alignedNums = formattedNums.map((s) => " ".repeat(maxLen - s.length) + s);
  let rows: string[] = [];
  for (let i = 0; i < alignedNums.length; i += itemsPerRow) {
    rows.push("| " + alignedNums.slice(i, i + itemsPerRow).join(" | ") + " |");
  }
  return rows.join("\n");
}

export const data = new SlashCommandBuilder()
  .setName("roll")
  .setDescription("Rolls dice")
  .addNumberOption((option) =>
    option
      .setName("amount")
      .setDescription("the number of dice in total (default: 1)")
      .setRequired(false)
  )
  .addNumberOption((option) =>
    option
      .setName("sides")
      .setDescription("the number of sides on the dice (default 20)")
      .setRequired(false)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  // Amount of dice; At least 1
  const amountOption = Number(interaction.options.get("amount")?.value ?? 1);
  const amountOfDice = Math.min(Math.max(amountOption, 1), 50);

  // Number of sides per dice; At max 20 sides
  const sidesOption = Number(interaction.options.get("sides")?.value ?? 20);
  const numberOfSides = Math.max(sidesOption, 2);

  // Array of dice rolls
  const results: number[] = [];

  for (let i = 0; i < amountOfDice; i++) {
    // Randomly generate dice roll
    const randomRoll = randomNumber(
      Date.now() * Math.random(),
      1,
      numberOfSides,
      true
    );
    results.push(randomRoll);
  }

  const table = `\`\`\`${formatNums(results)}\`\`\``;

  let response = `Rolling ${amountOfDice}d${numberOfSides.toLocaleString()}: `;

  const total = results.reduce((n, sum) => sum + n, 0);

  response += table;
  response += `Your rolls had a total of: ${total.toLocaleString()}`;

  await interaction.reply(response);
  logCommand();
};
