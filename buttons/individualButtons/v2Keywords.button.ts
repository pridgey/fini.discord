import { ButtonInteraction, MessageFlags } from "discord.js";
import { getBattle } from "../../modules/finicardsV2/battleStore";
import { loadLineupByIds } from "../../modules/finicardsV2/cardStore";
import { keywordSheet, notice } from "../../modules/finicardsV2/ui";

export const namespace = "v2_keywords";

/**
 * Every keyword in a battle and what it does, on request.
 *
 * The lineup picker explains keywords inline, but two hands can carry more than
 * fit there. This is the full list, grouped by hand and naming the cards that
 * carry each one - ephemeral, so looking something up costs nobody else any
 * screen space. Both hands are already public by the time a picker exists, so
 * there is nothing here to hide from either player.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [battleId] = args;

  const battle = await getBattle(battleId);

  if (!battle) {
    await interaction.reply({
      ...notice("❌ That battle no longer exists."),
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    });
    return;
  }

  const [challenger, defender] = await Promise.all([
    loadLineupByIds(battle.challenger_hand ?? []),
    loadLineupByIds(battle.defender_hand ?? []),
  ]);

  await interaction.reply({
    ...notice(
      keywordSheet([
        { name: battle.challenger_name, cards: challenger },
        { name: battle.defender_name, cards: defender },
      ]),
    ),
    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
  });
}
