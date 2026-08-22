import { ButtonInteraction, MessageFlags, TextChannel } from "discord.js";
import {
  getBattle,
  selectionFor,
  sideForUser,
  submitOrder,
} from "../../modules/finicardsV2/battleStore";
import { loadLineupByIds } from "../../modules/finicardsV2/cardStore";
import { applyOrdering, permutationsOf } from "../../modules/finicardsV2/orderings";
import {
  renderLineupSummary,
  renderMatchResult,
} from "../../modules/finicardsV2/renderBattle";
import {
  awardPot,
  settleDraw,
  type PotSplit,
} from "../../modules/finicardsV2/wagers";
import { splitBigString } from "../../utilities/splitBigString";

export const namespace = "v2_order_pick";

/**
 * Locks in one player's secret order, and resolves the match once both are in.
 *
 * Whichever player clicks second triggers resolution, so neither has to be
 * online at the same time as the other. The public result is posted to the
 * channel the challenge was issued in rather than wherever this click happened,
 * so the match always lands where the audience is.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [battleId, orderingIndexRaw] = args;

  const battle = await getBattle(battleId);

  if (!battle) {
    await interaction.update({
      content: "❌ That battle no longer exists.",
      components: [],
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

  const selection = selectionFor(battle, side);
  const orderings = permutationsOf(selection.length);
  const ordering = orderings[Number(orderingIndexRaw)];

  if (!ordering) {
    await interaction.update({
      content: "❌ That ordering isn't valid for this battle.",
      components: [],
    });
    return;
  }

  const outcome = await submitOrder(
    battleId,
    side,
    applyOrdering(selection, ordering),
  );

  if (!outcome.ok) {
    await interaction.update({ content: `❌ ${outcome.reason}`, components: [] });
    return;
  }

  if (!outcome.resolved) {
    const opponentName =
      outcome.waitingOn === "challenger"
        ? battle.challenger_name
        : battle.defender_name;

    await interaction.update({
      content: `✅ Order locked in. Waiting on **${opponentName}**.`,
      components: [],
    });
    return;
  }

  /* Both orders are in and the match resolved. */
  const { result } = outcome;
  const serverName = interaction.guild?.name ?? "unknown guild name";
  const names = {
    challenger: battle.challenger_name,
    defender: battle.defender_name,
  };

  await interaction.update({
    content: "✅ Order locked in. Resolving…",
    components: [],
  });

  /* Settle. A decided pot is raked to the server Jackpot before payout; a draw
     returns both stakes. Either way the coin out equals the coin in. */
  let split: PotSplit | null = null;

  if (battle.wager > 0) {
    const parties = {
      challenger: {
        userId: battle.challenger_id,
        serverId: battle.server_id,
        username: battle.challenger_name,
        servername: serverName,
      },
      defender: {
        userId: battle.defender_id,
        serverId: battle.server_id,
        username: battle.defender_name,
        servername: serverName,
      },
    };

    split =
      result.winner === "draw"
        ? await settleDraw(parties.challenger, parties.defender, battle.wager)
        : await awardPot(parties[result.winner], battle.wager);
  }

  const challengerLineup = await loadLineupByIds(
    outcome.battle.challenger_lineup ?? [],
  );
  const defenderLineup = await loadLineupByIds(
    outcome.battle.defender_lineup ?? [],
  );

  const body = [
    renderMatchResult(result, names),
    "",
    renderLineupSummary(challengerLineup, names.challenger),
    "",
    renderLineupSummary(defenderLineup, names.defender),
    split
      ? `\n_Pot: ${split.pot} fc — ${
          result.winner === "draw"
            ? "returned to both sides"
            : `${split.payout} to ${names[result.winner]}`
        }${split.jackpotCut > 0 ? `, ${split.jackpotCut} raked to the jackpot 🎰` : ""}._`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  /* Post publicly. The ephemeral above is only visible to the clicker, so the
     result has to be sent to the channel separately. */
  try {
    const channel = (await interaction.client.channels.fetch(
      battle.channel_id,
    )) as TextChannel | null;

    const target =
      channel?.isTextBased() && "send" in channel
        ? channel
        : ((interaction.channel as TextChannel | null) ?? null);

    if (target) {
      const mentions = `<@${battle.challenger_id}> <@${battle.defender_id}>`;
      for (const [index, chunk] of splitBigString(body).entries()) {
        await target.send(index === 0 ? `${mentions}\n${chunk}` : chunk);
      }
    }
  } catch (error) {
    console.error("Couldn't post v2 battle result to the channel:", error);
  }
}
