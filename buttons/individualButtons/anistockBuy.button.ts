import {
  ButtonInteraction,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getUserBalance } from "../../modules/finicoin";
import { queryAnime } from "../../modules/finistocks/queryAnime";

export const namespace = "anistock_buy";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [animeId, userId] = args;

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const animeResults = await queryAnime(animeId);
    const anime = animeResults.items[0];

    if (!anime) {
      await interaction.reply({
        content: "❌ Anime not found",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const userBalance = await getUserBalance(
      interaction.user.id,
      interaction.guildId ?? "Unknown Guild ID",
    );

    const afforadableQuantity = Math.floor(userBalance / anime.latest_price);
    const afforadableText =
      afforadableQuantity > 0
        ? `You can afford to buy up to ${afforadableQuantity} shares.`
        : "You cannot afford to buy any shares.";

    const modal = new ModalBuilder()
      .setCustomId(`anistock_buy_modal:${animeId}:${anime.latest_price}`)
      .setTitle("Buy Anime Stock");

    const textComponent = new TextDisplayBuilder().setContent(
      `## ${anime.title} (${
        anime.season
      })\rYour current balance: ${userBalance.toLocaleString()}\rCurrent stock price: ${anime.latest_price.toLocaleString()}\r\r${afforadableText}`,
    );

    const quantityInput = new TextInputBuilder()
      .setCustomId("quantity")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g. 10")
      .setRequired(true)
      .setMaxLength(6);

    const hobbiesLabel = new LabelBuilder()
      .setLabel(`Buy how many shares?`)
      .setTextInputComponent(quantityInput);

    // Each TextInput must be wrapped in its own ActionRow inside a modal
    modal.addTextDisplayComponents(textComponent);
    modal.addLabelComponents(hobbiesLabel);

    await interaction.showModal(modal);
  } catch (error) {
    console.error("Error handling buy anime stock:", error);
    await interaction.reply({
      content: "❌ Failed to buy anime stock",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
