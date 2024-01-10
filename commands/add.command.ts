import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import type { HammerspaceRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("add")
  .setDescription("Adds an item to the hammerspace")
  .addStringOption((option) =>
    option
      .setName("item")
      .setDescription("what is the item I'm adding?")
      .setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const itemToAdd = interaction.options.get("item")?.value?.toString() || "";

  if (itemToAdd?.length) {
    if (itemToAdd?.length < 100) {
      try {
        const newHammerspaceItem: HammerspaceRecord = {
          item: itemToAdd,
          times_used: 0,
          create_by_user_id: interaction.user.id,
          type: "item",
          server_id: interaction.guild?.id || "unknown",
        };
        await pb.collection("hammerspace").create(newHammerspaceItem);
        await interaction.reply(
          `**${itemToAdd}** has been added to the hammerspace`
        );

        logCommand();
      } catch (err) {
        const error: Error = err as Error;
        const errorMessage = `Error during /add command: ${error.message}`;
        console.error(errorMessage);
        await interaction.reply({
          content: errorMessage,
        });
        logCommand();
      }
    } else {
      await interaction.reply({
        content: "I'm way too lazy to add an item that long",
      });
      logCommand();
    }
  } else {
    await interaction.reply({
      content: "I can't add nothing, crazy pants.",
    });
    logCommand();
  }
};
