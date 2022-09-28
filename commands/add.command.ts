import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { db } from "./../utilities";
import { HammerspaceItem } from "./../types";

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
  const itemToAdd = interaction.options.getString("item");

  if (itemToAdd?.length) {
    if (itemToAdd?.length < 100) {
      return db()
        .insert<HammerspaceItem>("Hammerspace", {
          DateCreated: Date.now(),
          Item: itemToAdd,
          Server: interaction.guildId || "",
          TimesUsed: 0,
          User: interaction.user.id,
        })
        .then(() => {
          interaction.reply({
            content: `I've added _${itemToAdd}_ to the ${interaction?.guild?.name} Hammerspace`,
          });
        })
        .catch((err) => `I fucked up: ${err}`);
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
