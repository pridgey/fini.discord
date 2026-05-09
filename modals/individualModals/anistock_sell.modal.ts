import { MessageFlags, ModalSubmitInteraction } from "discord.js";
import { buyStock, sellStock } from "../../modules/finistocks/actionStock";
import { addCoin, getUserBalance } from "../../modules/finicoin";
import { pb } from "../../utilities/pocketbase";
import { AniStock_Holdings } from "../../types/PocketbaseTables";

export const namespace = "anistock_sell_modal";

export async function execute(
  interaction: ModalSubmitInteraction,
  args: string[],
) {
  try {
    const [holdingId] = args;

    const qty = parseInt(interaction.fields.getTextInputValue("quantity"), 10);

    if (!Number.isInteger(qty) || qty <= 0) {
      await interaction.reply({
        content: "Please enter a positive whole number.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const holding = await pb
      .collection<AniStock_Holdings>("anistock_holdings")
      .getOne(holdingId);

    if (!holding) {
      await interaction.reply({
        content: "Holding not found.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (qty > holding.shares_owned) {
      await interaction.reply({
        content: "You do not have that many shares to sell.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const totalProceeds = qty * holding.current_price;

    // Sell stocks
    await sellStock({
      animeId: holding.anime,
      userId: interaction.user.id,
      userName: interaction.user.username,
      quantity: qty,
      serverId: interaction.guildId ?? "Unknown Guild ID",
      serverName: interaction.guild?.name ?? "Unknown Guild Name",
      price: holding.current_price,
    });

    // Take coin from Reserve
    await addCoin(
      interaction.user.id,
      interaction.guildId ?? "Unknown Guild ID",
      totalProceeds,
      interaction.user.username,
      interaction.guild?.name ?? "Unknown Guild Name",
      "Reserve",
    );

    await interaction.reply({
      content: `Sold ${qty} shares for ${totalProceeds} finicoin!`,
      flags: [MessageFlags.Ephemeral],
    });
  } catch (error) {
    console.error("Error handling sell anime stock modal:", error);
    await interaction.reply({
      content: "❌ Failed to sell anime stock modal",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
