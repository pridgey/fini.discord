import { ButtonInteraction, MessageFlags } from "discord.js";
import { getBattle } from "../../modules/finicardsV2/battleStore";
import { buildBreakdown, notice } from "../../modules/finicardsV2/ui";
import type { MatchResult } from "../../modules/finicardsV2/types";
import { splitBigString } from "../../utilities/splitBigString";

export const namespace = "v2_breakdown";

/**
 * The full round-by-round working, on request.
 *
 * The public result is deliberately compact - two lines a round - so anyone
 * scrolling the channel can read it at a glance. This is the long form for
 * whoever wants to understand exactly how a number was arrived at, kept
 * ephemeral so asking for it costs nobody else any screen space.
 *
 * The result is read back off the stored battle rather than recomputed, so the
 * breakdown always describes the match that actually happened.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [battleId] = args;

  const battle = await getBattle(battleId);
  const result = battle?.result as MatchResult | null;

  if (!battle || !result?.rounds?.length) {
    await interaction.reply({
      ...notice("❌ That battle's breakdown is no longer available."),
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    });
    return;
  }

  const breakdown = buildBreakdown(result, {
    challenger: battle.challenger_name,
    defender: battle.defender_name,
  });

  const chunks = splitBigString(
    `### How ${battle.challenger_name} vs ${battle.defender_name} resolved\n${breakdown}`,
  );

  await interaction.reply({
    ...notice(chunks[0]),
    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
  });

  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({
      ...notice(chunk),
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    });
  }
}
