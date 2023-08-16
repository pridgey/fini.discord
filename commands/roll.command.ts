import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import seedrandom from "seedrandom";

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

export const execute = async (interaction: CommandInteraction) => {
  const amountOfDice = Math.min(
    Math.max(interaction.options.getNumber("amount") ?? 1, 1),
    50
  );
  const numberOfSides = Math.max(
    interaction.options.getNumber("sides") ?? 20,
    2
  );

  const results: number[] = [];
  const rng = seedrandom(interaction.token);

  for (let i = 0; i < amountOfDice; i++) {
    // Randomly generate winning option
    results.push(Math.ceil(rng() * numberOfSides));
  }

  const formattedNumbers = results.map((n) => n.toLocaleString());
  const table = `\`\`\`${formatNums(results)}\`\`\``;

  let response = `Rolling ${amountOfDice}d${numberOfSides.toLocaleString()}: `;

  const total = results.reduce((n, sum) => sum + n);

  response += table;
  response += `Your rolls had a total of: ${total.toLocaleString()}`;

  interaction.reply(response);
};
