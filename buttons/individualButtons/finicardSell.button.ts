import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { getOwnedCard, toBattleCard } from "../../modules/finicards/cardStore";
import { buybackPrice, sellToFini } from "../../modules/finicards/market";
import { rarityLabel } from "../../modules/finicards/ui/theme";
import { addCoin } from "../../modules/finicoin";
import {
  getPaginationContext,
  renderPaginationPage,
} from "../../utilities/pagination/pagination";

export const namespace = "v2_card_sell";

/**
 * Sells the card being viewed back to Fini, from the collection.
 *
 * Two presses, because it cannot be undone: the first ("ask") swaps the card's
 * buttons for a confirmation, the second ("confirm") sells it and puts the
 * collection page back. Selling to another player is not offered here - that
 * needs a price and a buyer, and is `/finicard sell`.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [contextId, cardId, userId, step] = args;

    if (userId && userId !== interaction.user.id) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // Acknowledged before any work: a press has three seconds to be answered,
    // and a slow lookup or upload must not show as "interaction failed".
    await interaction.deferUpdate();

    const owned = await getOwnedCard(cardId);
    if (!owned || owned.user_id !== interaction.user.id) {
      await interaction.followUp({
        content: "❌ That card isn't yours to sell any more.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const card = toBattleCard(owned);
    const price = buybackPrice(card);

    if (step !== "confirm") {
      // Everything above the buttons - the card itself - is left as it is.
      const confirmRow = new ActionRowBuilder<ButtonBuilder>().setComponents([
        new ButtonBuilder()
          .setCustomId(`v2_card_view:${contextId}:${cardId}:${userId}`)
          .setLabel("Keep it")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`v2_card_sell:${contextId}:${cardId}:${userId}:confirm`)
          .setLabel(`Sell ${card.name} to Fini for ${price} fc - gone for good`.slice(0, 80))
          .setStyle(ButtonStyle.Danger),
      ]);
      const shown = interaction.message.components.slice(0, -1);
      await interaction.editReply({ components: [...shown, confirmRow] });
      return;
    }

    await sellToFini(owned);
    await addCoin(
      interaction.user.id,
      owned.server_id,
      price,
      interaction.user.username,
      interaction.guild?.name ?? "unknown guild name",
      "Reserve",
    );

    const sold = `Sold **${card.name}** (${rarityLabel(card)}) to Fini for ${price} fc.`;

    // Back to the page it was opened from, now without it.
    const context = await getPaginationContext(contextId);
    const page = context
      ? await renderPaginationPage({ contextId, page: context.current_page })
      : null;

    if (!page) {
      await interaction.editReply({ components: [], files: [], attachments: [] }).catch(() => undefined);
      await interaction.followUp({ content: `${sold} Run \`/finicard collection\` to see what's left.`, flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.editReply(page);
    await interaction.followUp({ content: sold, flags: [MessageFlags.Ephemeral] });
  } catch (error) {
    console.error("Error selling a v2 card to Fini:", error, { args });
    const failed = { content: "❌ Failed to sell that card", flags: [MessageFlags.Ephemeral] as [MessageFlags.Ephemeral] };
    if (interaction.replied || interaction.deferred) await interaction.followUp(failed).catch(() => undefined);
    else await interaction.reply(failed).catch(() => undefined);
  }
}
