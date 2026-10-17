import type { ButtonHandler } from "../../types/handlers";
import { ButtonInteraction, MessageFlags } from "discord.js";
import { declineBattle, getBattle } from "../../modules/finicards/battleStore";
import { refundWager } from "../../modules/finicards/wagers";

export const namespace = "v2_battle_decline";

/** Declines a v2 challenge and returns the challenger's staked Finicoin. */
export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [battleId, defenderId] = args;

  if (interaction.user.id !== defenderId) {
    await interaction.reply({
      content: "❌ This challenge isn't yours to decline.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const battle = await getBattle(battleId);

  // Only an unanswered challenge can be declined - once the hands are dealt the
  // battle belongs to the expiry sweep, not to a decline button.
  if (!battle || battle.state !== "awaiting_defender") {
    await interaction.reply({
      content: "❌ That battle is no longer open.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await declineBattle(battleId);

  if (battle.wager > 0) {
    await refundWager(
      {
        userId: battle.challenger_id,
        serverId: battle.server_id,
        username: battle.challenger_name,
        servername: interaction.guild?.name ?? "unknown guild name",
      },
      battle.wager,
    );
  }

  await interaction.update({
    content: `${interaction.user} declined ${battle.challenger_name}'s challenge.${
      battle.wager > 0 ? ` ${battle.wager} fc returned.` : ""
    }`,
    components: [],
  });
};
