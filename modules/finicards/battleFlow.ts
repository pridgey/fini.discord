import type { ButtonInteraction, TextChannel } from "discord.js";
import type { V2BattleRecord, V2DeckRecord } from "../../types/PocketbaseTablesV2";
import { acceptChallenge, getBattle } from "./battleStore";
import { loadLineupByIds } from "./cardStore";
import { buildRevealMessage } from "./ui";
import { canAfford, stakeWager } from "./wagers";

/**
 * The reveal.
 *
 * Shared by both routes into it - a defender with one deck accepts in a single
 * click, a defender with several picks one first - so the wager escrow, the deal
 * and the announcement can't drift apart between them.
 */

export type AcceptAndRevealResult =
  | { ok: true; battle: V2BattleRecord }
  | { ok: false; reason: string };

export const acceptAndReveal = async (
  interaction: ButtonInteraction,
  battleId: string,
  deck: V2DeckRecord,
): Promise<AcceptAndRevealResult> => {
  const battle = await getBattle(battleId);

  if (!battle) return { ok: false, reason: "That battle no longer exists." };
  if (battle.defender_id !== interaction.user.id) {
    return { ok: false, reason: "This challenge isn't yours to answer." };
  }
  if (battle.state !== "awaiting_defender") {
    return {
      ok: false,
      reason: `That battle is already ${battle.state.replace(/_/g, " ")}.`,
    };
  }

  const serverName = interaction.guild?.name ?? "unknown guild name";
  const defenderParty = {
    userId: battle.defender_id,
    serverId: battle.server_id,
    username: battle.defender_name,
    servername: serverName,
  };

  /* The challenger staked when they issued the challenge; the defender stakes
     here, before any cards are dealt, so no match is decided on coin that turns
     out not to exist. */
  if (battle.wager > 0 && !(await canAfford(defenderParty, battle.wager))) {
    return {
      ok: false,
      reason: `You can't cover the ${battle.wager} fc stake, so the challenge is still open.`,
    };
  }

  const accepted = await acceptChallenge(battleId, deck);
  if (!accepted.ok) return accepted;

  if (battle.wager > 0) await stakeWager(defenderParty, battle.wager);

  const challengerHand = await loadLineupByIds(
    accepted.battle.challenger_hand ?? [],
  );
  const defenderHand = await loadLineupByIds(accepted.battle.defender_hand ?? []);

  const message = await buildRevealMessage({
    battleId,
    wager: battle.wager,
    challenger: {
      side: "challenger",
      name: battle.challenger_name,
      userId: battle.challenger_id,
      cards: challengerHand,
    },
    defender: {
      side: "defender",
      name: battle.defender_name,
      userId: battle.defender_id,
      cards: defenderHand,
    },
  });

  /* Posted to the channel the challenge was issued in rather than wherever this
     click happened, so the match always lands where the audience is. */
  const channel =
    ((await interaction.client.channels
      .fetch(battle.channel_id)
      .catch(() => null)) as TextChannel | null) ??
    (interaction.channel as TextChannel | null);

  if (channel && "send" in channel) {
    await channel.send(message);
  }

  return { ok: true, battle: accepted.battle };
};
