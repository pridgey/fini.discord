import { ButtonInteraction, MessageFlags, TextChannel } from "discord.js";
import {
  getBattle,
  handFor,
  sideForUser,
  submitLineup,
} from "../../modules/finicardsV2/battleStore";
import { loadLineupByIds } from "../../modules/finicardsV2/cardStore";
import {
  buildPickerView,
  decodePicks,
} from "../../modules/finicardsV2/lineupPicker";
import {
  buildLockedInMessage,
  buildResultMessage,
  notice,
} from "../../modules/finicardsV2/ui";
import { RULES } from "../../modules/finicardsV2/rules";
import {
  awardPot,
  settleDraw,
  type PotSplit,
} from "../../modules/finicardsV2/wagers";

export const namespace = "v2_lineup_pick";

/**
 * One click of the lineup picker.
 *
 * Each click either advances the pick or, on the last one, locks the lineup in.
 * Whichever player locks in second triggers resolution, so neither has to be
 * online at the same time as the other.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [battleId, encoded, candidate] = args;

  const battle = await getBattle(battleId);

  if (!battle) {
    await interaction.update(notice("❌ That battle no longer exists."));
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
    await interaction.update(
      notice(`❌ That battle is already ${battle.state.replace(/_/g, " ")}.`),
    );
    return;
  }

  const opposingSide = side === "challenger" ? "defender" : "challenger";
  const [hand, opposing] = await Promise.all([
    loadLineupByIds(handFor(battle, side)),
    loadLineupByIds(handFor(battle, opposingSide)),
  ]);
  const pickerContext = {
    opposing,
    opponentName:
      opposingSide === "challenger"
        ? battle.challenger_name
        : battle.defender_name,
  };
  const picked = decodePicks(encoded);

  /* "Start over" clears the picks rather than adding one. */
  if (candidate === "reset") {
    await interaction.update(buildPickerView(battleId, hand, [], pickerContext));
    return;
  }

  const index = Number.parseInt(candidate, 10);

  if (!Number.isInteger(index) || index < 0 || index >= hand.length) {
    await interaction.update(notice("❌ That card isn't in your hand."));
    return;
  }
  if (picked.includes(index)) {
    // Should be impossible - picked cards aren't offered - but a stale ephemeral
    // from an earlier click could still send one.
    await interaction.reply({
      content: "You've already placed that card. Use the newest picker message.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const next = [...picked, index];

  /* Still choosing: redraw the picker with one more slot filled. */
  if (next.length < RULES.rounds) {
    await interaction.update(
      buildPickerView(battleId, hand, next, pickerContext),
    );
    return;
  }

  /* Lineup complete. */
  const lineup = next.map((handIndex) => hand[handIndex].instanceId);
  const outcome = await submitLineup(battleId, side, lineup);

  if (!outcome.ok) {
    await interaction.update(notice(`❌ ${outcome.reason}`));
    return;
  }

  const chosen = next.map((handIndex) => hand[handIndex]);

  if (!outcome.resolved) {
    const opponentName =
      outcome.waitingOn === "challenger"
        ? battle.challenger_name
        : battle.defender_name;

    await interaction.update(buildLockedInMessage(chosen, opponentName));
    return;
  }

  /* Both lineups are in and the match resolved. */
  const { result } = outcome;
  const serverName = interaction.guild?.name ?? "unknown guild name";
  const names = {
    challenger: battle.challenger_name,
    defender: battle.defender_name,
  };

  await interaction.update(notice("✅ Lineup locked in. Resolving…"));

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

  try {
    const channel =
      ((await interaction.client.channels
        .fetch(battle.channel_id)
        .catch(() => null)) as TextChannel | null) ??
      (interaction.channel as TextChannel | null);

    if (channel && "send" in channel) {
      await channel.send(
        buildResultMessage({
          battleId,
          result,
          names,
          userIds: {
            challenger: battle.challenger_id,
            defender: battle.defender_id,
          },
          split,
        }),
      );
    }
  } catch (error) {
    console.error("Couldn't post v2 battle result to the channel:", error);
  }
}
