import { MessageFlags, ModalSubmitInteraction } from "discord.js";
import { buyStock } from "../../modules/finistocks/buyStock";
import { addCoin, getUserBalance } from "../../modules/finicoin";

export const namespace = "anistock_buy_modal";

export async function execute(
  interaction: ModalSubmitInteraction,
  args: string[],
) {
  try {
    const [animeId, price] = args;

    const qty = parseInt(interaction.fields.getTextInputValue("quantity"), 10);

    if (!Number.isInteger(qty) || qty <= 0) {
      await interaction.reply({
        content: "Please enter a positive whole number.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const userBalance = await getUserBalance(
      interaction.user.id,
      interaction.guildId ?? "Unknown Guild ID",
    );

    const totalCost = qty * parseFloat(price);

    if (totalCost > userBalance) {
      await interaction.reply({
        content: "You do not have enough balance to make this purchase.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // Give coin to Reserve
    await addCoin(
      "Reserve",
      interaction.guildId ?? "Unknown Guild ID",
      totalCost,
      interaction.user.username,
      interaction.guild?.name ?? "Unknown Guild Name",
      interaction.user.id,
    );

    // Just puts stock in user's account
    await buyStock({
      animeId,
      userId: interaction.user.id,
      userName: interaction.user.username,
      quantity: qty,
      serverId: interaction.guildId ?? "Unknown Guild ID",
      serverName: interaction.guild?.name ?? "Unknown Guild Name",
      price: parseFloat(price),
    });

    await interaction.reply({
      content: `Bought ${qty} shares!`,
      flags: [MessageFlags.Ephemeral],
    });
  } catch (error) {
    console.error("Error handling buy anime stock modal:", error);
    await interaction.reply({
      content: "❌ Failed to buy anime stock modal",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
