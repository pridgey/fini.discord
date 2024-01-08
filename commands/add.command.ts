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

export const execute = async (interaction: CommandInteraction) => {
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
        interaction.reply(`**${itemToAdd}** has been added to the hammerspace`);
      } catch (err) {
        const error: Error = err as Error;
        const errorMessage = `Error during /add command: ${error.message}`;
        console.error(errorMessage);
        interaction.reply({
          content: errorMessage,
        });
      }
    } else {
      interaction.reply({
        content: "I'm way too lazy to add an item that long",
      });
    }
  } else {
    interaction.reply({
      content: "I can't add nothing, crazy pants.",
    });
  }
};
