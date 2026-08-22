import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  getBattle,
  handFor,
  lineupFor,
  sideForUser,
} from "../../modules/finicardsV2/battleStore";
import { loadLineupByIds } from "../../modules/finicardsV2/cardStore";
import { buildPickerView } from "../../modules/finicardsV2/lineupPicker";
import { RULES } from "../../modules/finicardsV2/rules";

export const namespace = "v2_lineup_open";

/**
 * Hands a player their own private lineup picker.
 *
 * One public button serves both players: whoever clicks gets an ephemeral picker
 * showing their own hand. A shared message could not show both hands, and an
 * ephemeral can only be created in response to an interaction - so the click is
 * what creates it.
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

  if (battle.state !== "awaiting_lineups") {
    await interaction.reply({
      content:
        battle.state === "awaiting_defender"
          ? `❌ ${battle.defender_name} hasn't accepted yet.`
          : `❌ That battle is already ${battle.state.replace(/_/g, " ")}.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (lineupFor(battle, side).length === RULES.rounds) {
    await interaction.reply({
      content: "You've already locked in your lineup. Waiting on your opponent.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const opposingSide = side === "challenger" ? "defender" : "challenger";
  const [hand, opposing] = await Promise.all([
    loadLineupByIds(handFor(battle, side)),
    loadLineupByIds(handFor(battle, opposingSide)),
  ]);

  if (hand.length === 0) {
    await interaction.reply({
      content: "❌ Your hand couldn't be loaded - none of those cards are yours any more.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const view = buildPickerView(battleId, hand, [], {
    opposing,
    opponentName:
      opposingSide === "challenger"
        ? battle.challenger_name
        : battle.defender_name,
  });

  /* Components V2 plus Ephemeral. The picker must be V2 from this first reply,
     because a V2 message can never be edited back to a plain-content one and
     every later click edits this message. */
  await interaction.reply({
    components: view.components,
    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
  });
}
