import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { acceptAndReveal } from "../../modules/finicardsV2/battleFlow";
import { getBattle } from "../../modules/finicardsV2/battleStore";
import { getDecks } from "../../modules/finicardsV2/decks";
import { HAND_SIZE } from "../../modules/finicardsV2/draw";

export const namespace = "v2_battle_accept";

const BUTTONS_PER_ROW = 5;

/**
 * The defender accepts a challenge with one of their decks.
 *
 * One deck means one click. Several means a deck picker first - decks double as
 * a way of organising a collection, so most players will have more than one and
 * which one they bring is the first real decision of the battle.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [battleId, defenderId] = args;

  if (interaction.user.id !== defenderId) {
    await interaction.reply({
      content: "❌ This challenge isn't yours to answer.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const battle = await getBattle(battleId);

  if (!battle || battle.state !== "awaiting_defender") {
    await interaction.reply({
      content: battle
        ? `❌ That battle is already ${battle.state.replace(/_/g, " ")}.`
        : "❌ That battle no longer exists.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const decks = await getDecks(interaction.user.id, battle.server_id);

  if (decks.length === 0) {
    await interaction.reply({
      content: `❌ You have no decks. Build one with \`/finicard-v2 deck build name:Main\` - a battle deals ${HAND_SIZE} cards from it.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  /* One deck: no point asking. */
  if (decks.length === 1) {
    await interaction.deferUpdate();
    const result = await acceptAndReveal(interaction, battleId, decks[0]);

    if (!result.ok) {
      await interaction.followUp({
        content: `❌ ${result.reason}`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.editReply({
      content: `${interaction.user} accepted with **${decks[0].name}**.`,
      components: [],
    });
    return;
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let index = 0; index < decks.length; index += BUTTONS_PER_ROW) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        decks.slice(index, index + BUTTONS_PER_ROW).map((deck) =>
          new ButtonBuilder()
            .setCustomId(`v2_deck_pick:${battleId}:${deck.id}`)
            .setLabel(
              `${deck.name} (${(deck.cards ?? []).length})`.slice(0, 80),
            )
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
  }

  await interaction.reply({
    content: "**Which deck are you bringing?** Five cards are dealt from it.",
    components: rows,
    flags: [MessageFlags.Ephemeral],
  });
}
