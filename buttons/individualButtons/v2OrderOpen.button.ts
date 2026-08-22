import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import {
  getBattle,
  orderFor,
  selectionFor,
  sideForUser,
} from "../../modules/finicardsV2/battleStore";
import { loadLineupByIds } from "../../modules/finicardsV2/cardStore";
import {
  orderingsFitInButtons,
  permutationsOf,
  shortOrderingLabel,
} from "../../modules/finicardsV2/orderings";
import { RULES } from "../../modules/finicardsV2/rules";

export const namespace = "v2_order_open";

const BUTTONS_PER_ROW = 5;

/**
 * Hands a player their own private order picker.
 *
 * One public button serves both players: whoever clicks it gets an *ephemeral*
 * reply listing the orderings of their own three cards. That solves the problem
 * that both sides need to choose simultaneously and secretly from different
 * cards - a shared message could not show both, and an ephemeral can only be
 * sent in response to an interaction, so the click is what creates it.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [battleId] = args;

  const battle = await getBattle(battleId);

  if (!battle) {
    await interaction.reply({
      content: "❌ That battle no longer exists.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const side = sideForUser(battle, interaction.user.id);

  if (!side) {
    await interaction.reply({
      content: "❌ You're not in this battle.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (battle.state !== "awaiting_orders") {
    await interaction.reply({
      content:
        battle.state === "awaiting_defender_selection"
          ? `❌ ${battle.defender_name} hasn't brought their cards yet.`
          : `❌ That battle is already ${battle.state.replace(/_/g, " ")}.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (orderFor(battle, side).length === RULES.rounds) {
    await interaction.reply({
      content: "You've already locked in your order. Waiting on your opponent.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const selection = selectionFor(battle, side);
  const cards = await loadLineupByIds(selection);

  if (cards.length !== selection.length) {
    await interaction.reply({
      content:
        "❌ One of the cards you brought is no longer in your collection, so this battle can't be ordered.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (!orderingsFitInButtons(cards.length)) {
    await interaction.reply({
      content: `❌ ${cards.length} cards is too many to order by button. The order picker supports up to 4.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const orderings = permutationsOf(cards.length);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let index = 0; index < orderings.length; index += BUTTONS_PER_ROW) {
    const buttons = orderings
      .slice(index, index + BUTTONS_PER_ROW)
      .map((ordering, offset) =>
        new ButtonBuilder()
          .setCustomId(`v2_order_pick:${battleId}:${index + offset}`)
          .setLabel(shortOrderingLabel(cards, ordering))
          .setStyle(ButtonStyle.Secondary),
      );

    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  }

  await interaction.reply({
    content: [
      `**Pick your slot order.** Only you can see this, and your opponent never learns it until the match resolves.`,
      `Slot 1 fights their slot 1, and so on.`,
    ].join("\n"),
    components: rows,
    flags: [MessageFlags.Ephemeral],
  });
}
