import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import type { PotSplit } from "../wagers";
import type {
  MatchResult,
  RoundResult,
  Side,
  SideCombat,
} from "../types";
import { TYPE_EMOJI } from "../rules";
import {
  DRAW_ACCENT,
  SIDE_ACCENT,
  TYPE_NAME,
  compositionOf,
  explainMultiplier,
  statLine,
} from "./theme";

/**
 * The match result.
 *
 * Two lines per round, and the second one is small.
 *
 * This has been through both failure modes. The first version showed only the
 * arithmetic, so a player could see that a card hit for 7 but not why. The fix
 * for that spelled out the matchup, both damage calculations and the outcome on
 * five separate lines - correct, complete, and far too much to read three times
 * over. So the layout now splits by *need*: the headline of each round carries
 * who fought and who won, and the derivation sits underneath in small text for
 * anyone who wants it. Full working is still available behind a button.
 */

export type ResultMessageInput = {
  result: MatchResult;
  names: Record<Side, string>;
  userIds: Record<Side, string>;
  split?: PotSplit | null;
  /** Battle id, for the full-breakdown button. Omitted, no button is shown. */
  battleId?: string;
};

/** The full working for every round, for the detail view behind the button. */
export const buildBreakdown = (
  result: MatchResult,
  names: Record<Side, string>,
): string =>
  result.rounds.map((round) => verboseRound(round, names)).join("\n\n");

/** `7×1.5=10 − 3 Heart` - the working, compressed to fit a small-text line. */
const workingOf = (combat: SideCombat): string => {
  const attack =
    combat.multiplier === 1
      ? `${combat.attackStat}`
      : `${combat.attackStat}×${combat.multiplier}=${combat.attackValue}`;
  const bonuses =
    combat.bonuses.length > 0 ? ` +${combat.bonuses.join(" +")}` : "";

  return `${attack} − ${combat.defenseFaced} ${TYPE_NAME[combat.printedType]}${bonuses}`;
};

/** The same round written out in full, for the detail view. */
const verboseRound = (
  round: RoundResult,
  names: Record<Side, string>,
): string => {
  const line = (label: string, combat: SideCombat, opposing: SideCombat) => {
    const attack =
      combat.multiplier === 1
        ? `\`${combat.attackStat}\` ${TYPE_NAME[combat.printedType]}`
        : `\`${combat.attackStat} × ${combat.multiplier} = ${combat.attackValue}\``;
    const bonuses =
      combat.bonuses.length > 0 ? ` _(${combat.bonuses.join(", ")})_` : "";
    return `${label} attacks with ${attack}, minus ${opposing.card.name}'s \`${combat.defenseFaced}\` ${TYPE_NAME[combat.printedType]} → **${combat.damage}**${bonuses}`;
  };

  return [
    `**Round ${round.slot}** · ${round.challenger.card.name} vs ${round.defender.card.name}`,
    `-# ${multiplierNote(round, names)}`,
    line(names.challenger, round.challenger, round.defender),
    line(names.defender, round.defender, round.challenger),
    round.winner === "draw"
      ? "Equal damage — the round counts for neither side."
      : `**${names[round.winner]}** wins the round by ${Math.abs(round.challenger.damage - round.defender.damage)}.`,
    ...round.notes.map((note) => `-# ↳ ${note}`),
  ].join("\n");
};

/** Which side got the multiplier, and why. Only one side ever can. */
const multiplierNote = (
  round: RoundResult,
  names: Record<Side, string>,
): string => {
  const { challenger, defender } = round;

  if (challenger.multiplier > 1) {
    return explainMultiplier(
      challenger.printedType,
      defender.printedType,
      challenger.multiplier,
      names.challenger,
    );
  }
  if (defender.multiplier > 1) {
    return explainMultiplier(
      defender.printedType,
      challenger.printedType,
      defender.multiplier,
      names.defender,
    );
  }
  return explainMultiplier(
    challenger.printedType,
    defender.printedType,
    1,
    names.challenger,
  );
};

/**
 * One round in two lines: who won it, then the working in small text.
 *
 * The winner leads the line. An earlier version marked every round with a ✅,
 * which read as "you won this one" regardless of who actually did.
 */
const roundBlock = (
  round: RoundResult,
  names: Record<Side, string>,
): string => {
  const { challenger, defender } = round;

  const verdict =
    round.winner === "draw"
      ? "**Draw**"
      : `**${names[round.winner]} +${Math.abs(challenger.damage - defender.damage)}**`;

  // Negative damage is legal and worth seeing, but "4 – -4" is hard to parse.
  const score = (combat: SideCombat, side: Side) => {
    const value = combat.damage < 0 ? `(${combat.damage})` : `${combat.damage}`;
    return round.winner === side ? `**${value}**` : value;
  };

  return [
    `\`R${round.slot}\` ${verdict} · ${TYPE_EMOJI[challenger.printedType]} ${challenger.card.name} ${score(challenger, "challenger")} – ${score(defender, "defender")} ${defender.card.name} ${TYPE_EMOJI[defender.printedType]}`,
    `-# ${multiplierNote(round, names)} · ${workingOf(challenger)} vs ${workingOf(defender)}`,
    ...round.notes.map((note) => `-# ↳ ${note}`),
  ].join("\n");
};

export const buildResultMessage = (
  input: ResultMessageInput,
): {
  components: ContainerBuilder[];
  flags: [MessageFlags.IsComponentsV2];
} => {
  const { result, names, userIds, split } = input;

  const accent =
    result.winner === "draw" ? DRAW_ACCENT : SIDE_ACCENT[result.winner];

  const headline =
    result.winner === "draw"
      ? `## 🤝 Draw — ${result.roundsWon.challenger} – ${result.roundsWon.defender}`
      : `## 🏆 ${names[result.winner]} wins ${result.roundsWon.challenger} – ${result.roundsWon.defender}`;

  const challengerCards = result.rounds.map((round) => round.challenger.card);
  const defenderCards = result.rounds.map((round) => round.defender.card);

  const container = new ContainerBuilder()
    .setAccentColor(accent)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          headline,
          `<@${userIds.challenger}> ${compositionOf(challengerCards)} vs ${compositionOf(defenderCards)} <@${userIds.defender}>`,
        ].join("\n"),
      ),
    );

  /* All rounds in one block with one separator, rather than a separator each -
     three bordered sections for three rounds reads as three times the content. */
  container
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) =>
      text.setContent(
        result.rounds.map((round) => roundBlock(round, names)).join("\n"),
      ),
    );

  /* How it was decided, and the money. Total damage is only interesting when it
     actually settled the match, so it is stated plainly in that case and kept as
     a footnote otherwise. */
  const decided =
    result.decidedBy === "damage"
      ? `**Decided on total damage** — ${names.challenger} ${result.tiebreakDamage.challenger}, ${names.defender} ${result.tiebreakDamage.defender}`
      : result.decidedBy === "rule"
        ? "Rounds *and* total damage both level."
        : `-# Total damage ${result.tiebreakDamage.challenger} – ${result.tiebreakDamage.defender}`;

  const pot = split
    ? `\n**Pot ${split.pot} fc** — ${
        result.winner === "draw"
          ? "returned to both sides"
          : `${split.payout} to ${names[result.winner]}`
      }${split.jackpotCut > 0 ? `, ${split.jackpotCut} raked to the jackpot 🎰` : ""}`
    : "";

  container
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) => text.setContent(`${decided}${pot}`));

  /* Detail on demand: the compact view is what everyone reads, and anyone
     learning the maths can ask for the long form without it cluttering the
     channel for everybody else. */
  if (input.battleId) {
    container.addActionRowComponents(() =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`v2_breakdown:${input.battleId}`)
          .setLabel("Full breakdown")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
};
