import type { ButtonHandler } from "../../types/handlers";
import {
  ButtonInteraction,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { pb } from "../../utilities/pocketbase";
import { AniStock_Holdings } from "../../types/PocketbaseTables";

export const namespace = "anistock_sell";

export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  try {
    const [holdingId, userId] = args;

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const holdingResult = await pb
      .collection<AniStock_Holdings>("anistock_holdings")
      .getOne(holdingId);

    if (!holdingResult) {
      await interaction.reply({
        content: "❌ Anime not found",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`anistock_sell_modal:${holdingResult.id}`)
      .setTitle("Sell Anime Stock");

    const textComponent = new TextDisplayBuilder().setContent(
      `## ${holdingResult.title} (${
        holdingResult.season
      })\rCurrent stock price: ${holdingResult.current_value.toLocaleString()}\r\rYou currently hold ${
        holdingResult.shares_owned
      } shares.`,
    );

    const quantityInput = new TextInputBuilder()
      .setCustomId("quantity")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g. 10")
      .setRequired(true)
      .setMaxLength(6);

    const hobbiesLabel = new LabelBuilder()
      .setLabel(`Sell how many shares?`)
      .setTextInputComponent(quantityInput);

    // Each TextInput must be wrapped in its own ActionRow inside a modal
    modal.addTextDisplayComponents(textComponent);
    modal.addLabelComponents(hobbiesLabel);

    await interaction.showModal(modal);
  } catch (error) {
    console.error("Error handling sell anime stock:", error);
    await interaction.reply({
      content: "❌ Failed to sell anime stock",
      flags: [MessageFlags.Ephemeral],
    });
  }
};
