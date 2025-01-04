import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("test")
  .setDescription("Testing new features")
  .addUserOption((opt) =>
    opt.setName("who").setDescription("Who to").setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  await interaction.deferReply();

  try {
    const targetUser = interaction.options.getUser("who");

    const otherButton = new ButtonBuilder()
      .setCustomId("other-button")
      .setLabel("Your Button")
      .setStyle(ButtonStyle.Secondary);
    const userButton = new ButtonBuilder()
      .setCustomId("user-button")
      .setLabel("My Button")
      .setStyle(ButtonStyle.Secondary);

    const userRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      userButton
    );
    const otherRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      otherButton
    );

    // Initial response
    const interactionResponse = await interaction.editReply({
      content: `Initial Text`,
      components: [userRow, otherRow],
    });

    // Filter ensures only the original user can interact with the buttons
    const collectorFilter = (i) => {
      return [
        targetUser?.id ?? "unknown user id",
        interaction.user.id,
      ].includes(i.user.id);
    };

    // Collector to listen for interactions
    const collector = interactionResponse.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: collectorFilter,
      time: 600_000, // 10 min
    });

    // Event that fires when the collector times out
    collector.on("end", async (i) => {
      await interaction.editReply({
        content: `interaction over`,
        components: [],
      });
    });

    // Event that fires when a user interacts with the buttons
    collector.on("collect", async (i) => {
      console.log("Test", { customID: i.customId });
      // Using the arrows
      if (
        i.customId === "other-button" &&
        (targetUser?.id ?? "Unknown user id") === i.user.id
      ) {
        await i.update({
          content: `${targetUser} pressed`,
          components: [userRow, otherRow],
        });
      } else if (
        i.customId === "user-button" &&
        interaction.user.id === i.user.id
      ) {
        await i.update({
          content: `${interaction.user} pressed`,
          components: [userRow, otherRow],
        });
      } else {
        await i.update({});
      }
    });
  } catch (err) {
    console.error("Error occurred during test", err);
    interaction.editReply("Something fucked up");
  }
};
