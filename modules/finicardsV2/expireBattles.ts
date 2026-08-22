import type { Client, TextChannel } from "discord.js";
import { findStaleBattles, markBattleExpired } from "./battleStore";
import { refundWager } from "./wagers";

/**
 * The defender-timeout sweep, run from the bot's minute poll.
 *
 * How long a challenge stays open is a design decision the doc leaves open, so
 * it is one constant here rather than being buried in the sweep.
 */
export const V2_BATTLE_TIMEOUT_HOURS = 24;

export type ExpirySweepResult = {
  expired: number;
  refunded: number;
  announced: number;
};

/**
 * Expires unanswered challenges, returns the challenger's stake, and says so in
 * the channel the challenge was issued in.
 *
 * Ordering matters: each battle is marked expired *first*, then refunded. If the
 * process dies between the two, the battle is already out of the pending pool,
 * so the next sweep will not refund it a second time. A dropped refund is
 * recoverable by hand; minted Finicoin is not.
 *
 * Every step is individually guarded - one unreachable channel or one deleted
 * bank record must not stop the rest of the sweep.
 */
export const expireStaleV2Battles = async (
  client: Client,
  hours: number = V2_BATTLE_TIMEOUT_HOURS,
): Promise<ExpirySweepResult> => {
  const result: ExpirySweepResult = { expired: 0, refunded: 0, announced: 0 };

  let stale: Awaited<ReturnType<typeof findStaleBattles>>;
  try {
    stale = await findStaleBattles(hours);
  } catch (error) {
    console.error("Error finding stale v2 battles:", error);
    return result;
  }

  for (const battle of stale) {
    // Captured before the state is overwritten - the refund depends on it.
    const stateAtExpiry = battle.state;

    try {
      await markBattleExpired(battle.id!);
      result.expired += 1;
    } catch (error) {
      console.error(`Error expiring v2 battle ${battle.id}:`, error);
      continue;
    }

    /* Who has money in escrow depends on how far the battle got. The challenger
       stakes when they issue the challenge; the defender stakes when they commit
       their cards, which is exactly the transition into `awaiting_orders`. */
    if (battle.wager > 0) {
      const owed = [
        {
          userId: battle.challenger_id,
          serverId: battle.server_id,
          username: battle.challenger_name,
          servername: "unknown guild name",
        },
      ];

      if (stateAtExpiry === "awaiting_orders") {
        owed.push({
          userId: battle.defender_id,
          serverId: battle.server_id,
          username: battle.defender_name,
          servername: "unknown guild name",
        });
      }

      for (const party of owed) {
        try {
          await refundWager(party, battle.wager);
          result.refunded += 1;
        } catch (error) {
          console.error(
            `Failed to refund ${battle.wager} fc to ${party.userId} for expired v2 battle ${battle.id}:`,
            error,
          );
        }
      }
    }

    try {
      const channel = (await client.channels.fetch(
        battle.channel_id,
      )) as TextChannel | null;

      if (channel?.isTextBased()) {
        const stalledAt =
          stateAtExpiry === "awaiting_orders"
            ? "nobody locked in a slot order"
            : "no answer";

        await channel.send(
          `<@${battle.challenger_id}>'s v2 challenge to ${battle.defender_name} expired after ${hours}h — ${stalledAt}.${
            battle.wager > 0 ? ` Stakes returned.` : ""
          }`,
        );
        result.announced += 1;
      }
    } catch (error) {
      console.error(
        `Couldn't announce expiry of v2 battle ${battle.id} in channel ${battle.channel_id}:`,
        error,
      );
    }
  }

  if (result.expired > 0) {
    console.log("Expired stale v2 battles:", result);
  }

  return result;
};
