import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getBattle } from "../../modules/finicardsV2/battleStore";
import { RULES } from "../../modules/finicardsV2/rules";

export const namespace = "v2_battle_select";

/**
 * Opens the card-selection modal for the defender.
 *
 * This is the *blind* phase - the challenger's cards are not shown, and are not
 * even loaded here, so there is nothing to leak. Card names only become visible
 * once both sides have committed.
 *
 * A modal rather than a select menu because the interaction router in `index.ts`
 * handles buttons and modals but not select menus, and a v2 test feature has no
 * business changing the shared router.
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

  if (!battle) {
    await interaction.reply({
      content: "❌ That battle no longer exists.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (battle.state !== "awaiting_defender_selection") {
    await interaction.reply({
      content: `❌ That battle is already ${battle.state.replace(/_/g, " ")}.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`v2_battle_selection:${battleId}`)
    .setTitle(`Bring ${RULES.rounds} cards`.slice(0, 45));

  for (let index = 1; index <= RULES.rounds; index++) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(`card${index}`)
          .setLabel(`Card ${index}`)
          .setPlaceholder("id from /finicard-v2 collection")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
  }

  await interaction.showModal(modal);
}
