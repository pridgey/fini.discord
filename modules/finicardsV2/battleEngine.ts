import type { CardType } from "../../types/PocketbaseTablesV2";
import type {
  CombatWorkspace,
  KeywordContext,
  KeywordDefinition,
  OutcomeContext,
  SideState,
} from "./keywords";
import { createSideState, findKeyword } from "./keywords";
import type { BattleRules } from "./rules";
import { RULES, TYPE_BEATEN_BY, typeMultiplierFor } from "./rules";
import type {
  BattleCard,
  MatchResult,
  RoundOutcome,
  RoundResult,
  Side,
  SideCombat,
} from "./types";

/**
 * The battle engine. Pure: no Pocketbase, no Discord, no clock, no randomness.
 * Given two lineups and a rules object it always produces the same match, which
 * is what makes both the unit tests and the tuning sweep possible.
 *
 * Clash resolution, straight from the design doc:
 *
 *   attackValue = floor(attacker's type stat * multiplier)
 *   damage      = attackValue - defender's value in that same stat
 *
 *   multiplier  = rules.typeMultiplier  when the attacker's type beats the defender's
 *                 rules.neutralMultiplier  otherwise
 *
 * Damage is not floored at zero - negative damage is legal and simply loses.
 * The product is floored, which is what reproduces the doc's worked examples
 * exactly (7 x 1.5 - 3 = 7, and 9 x 1.5 - 2 = 11).
 */

const otherSide = (side: Side): Side =>
  side === "challenger" ? "defender" : "challenger";

const createWorkspace = (
  side: Side,
  card: BattleCard,
  rules: BattleRules,
): CombatWorkspace => ({
  side,
  card,
  attackStat: card.stats[card.type],
  multiplier: rules.neutralMultiplier,
  defenseBonus: 0,
  pierce: 0,
  adapted: false,
  bonuses: [],
});

/** Keywords on a card, filtered to one stage and sorted by locked sub-order. */
const stageKeywords = (
  card: BattleCard,
  stage: KeywordDefinition["stage"],
  rules: BattleRules,
): KeywordDefinition[] => {
  if (!rules.keywordsEnabled) return [];
  const keyword = findKeyword(card.keyword);
  if (!keyword || keyword.stage !== stage) return [];
  return [keyword];
};

type RoundInput = {
  slot: number;
  lineupLength: number;
  challengerCard: BattleCard;
  defenderCard: BattleCard;
  challengerState: SideState;
  defenderState: SideState;
  rules: BattleRules;
  /** Full lineups and completed rounds, so keywords can read beyond this clash. */
  challengerLineup?: BattleCard[];
  defenderLineup?: BattleCard[];
  history?: RoundResult[];
};

/**
 * Resolves a single clash. Exported so a round can be reasoned about (and
 * tested) on its own, but `resolveMatch` is what callers normally want.
 */
export const resolveRound = ({
  slot,
  lineupLength,
  challengerCard,
  defenderCard,
  challengerState,
  defenderState,
  rules,
  challengerLineup,
  defenderLineup,
  history = [],
}: RoundInput): RoundResult => {
  const notes: string[] = [];

  // Printed types. `Adapt` never changes which stat a card attacks with - only
  // whether the matchup counts as advantaged. See README for that reading.
  const challengerType = challengerCard.type;
  const defenderType = defenderCard.type;

  const workspaces: Record<Side, CombatWorkspace> = {
    challenger: createWorkspace("challenger", challengerCard, rules),
    defender: createWorkspace("defender", defenderCard, rules),
  };
  const cards: Record<Side, BattleCard> = {
    challenger: challengerCard,
    defender: defenderCard,
  };
  const states: Record<Side, SideState> = {
    challenger: challengerState,
    defender: defenderState,
  };
  // A single-round call may omit the lineups; fall back to just this clash.
  const lineups: Record<Side, BattleCard[]> = {
    challenger: challengerLineup ?? [challengerCard],
    defender: defenderLineup ?? [defenderCard],
  };
  const sides: Side[] = ["challenger", "defender"];

  const contextFor = (side: Side): KeywordContext => ({
    self: workspaces[side],
    opponent: workspaces[otherSide(side)],
    slot,
    lineupLength,
    state: states[side],
    rules,
    notes,
    selfLineup: lineups[side],
    opponentLineup: lineups[otherSide(side)],
    history,
  });

  const runStage = (stage: KeywordDefinition["stage"]) => {
    const queued = sides
      .flatMap((side) =>
        stageKeywords(cards[side], stage, rules).map((keyword) => ({
          side,
          keyword,
        })),
      )
      .sort((a, b) => a.keyword.order - b.keyword.order);

    for (const { side, keyword } of queued) {
      keyword.apply?.(contextFor(side));
    }
  };

  /* 1. Placement bonuses (Vanguard, Last Stand) */
  runStage("placement");

  /* 2. Conditional bonuses (Momentum, Avenge, Underdog) + incoming Rally */
  for (const side of sides) {
    const state = states[side];
    if (state.pendingRally > 0) {
      workspaces[side].attackStat += state.pendingRally;
      workspaces[side].bonuses.push(`Rally +${state.pendingRally}`);
      state.pendingRally = 0;
    }
  }
  runStage("conditional");

  /* 3. Type / multiplier modifiers. Base multipliers first, then Adapt, then
        Guard - so a Guard card shuts an Adapt card back down to neutral. */
  workspaces.challenger.multiplier = typeMultiplierFor(
    challengerType,
    defenderType,
    rules,
  );
  workspaces.defender.multiplier = typeMultiplierFor(
    defenderType,
    challengerType,
    rules,
  );
  runStage("matchup");

  /* 4. Defensive modifiers, then damage. */
  runStage("defense");

  const buildCombat = (side: Side): SideCombat => {
    const self = workspaces[side];
    const opponent = workspaces[otherSide(side)];
    const attackType = cards[side].type;
    const defenderCardOfThis = cards[otherSide(side)];

    const attackValue = Math.floor(self.attackStat * self.multiplier);
    // The defender defends with the stat matching the incoming attack.
    const defenseFaced = Math.max(
      0,
      defenderCardOfThis.stats[attackType] + opponent.defenseBonus - self.pierce,
    );

    // `Adapt` does not change which stat the card swings with, only whether the
    // matchup counts as advantaged - so this is display-only.
    const effectiveType = self.adapted
      ? TYPE_BEATEN_BY[defenderCardOfThis.type]
      : attackType;

    return {
      card: cards[side],
      printedType: attackType,
      attackType: effectiveType,
      baseAttackStat: cards[side].stats[attackType],
      attackStat: self.attackStat,
      multiplier: self.multiplier,
      attackValue,
      defenseFaced,
      damage: attackValue - defenseFaced,
      bonuses: self.bonuses,
    };
  };

  const challenger = buildCombat("challenger");
  const defender = buildCombat("defender");

  /* 5. Outcome, then First Strike may soften a narrow loss into a draw. */
  let winner: RoundOutcome =
    challenger.damage === defender.damage
      ? "draw"
      : challenger.damage > defender.damage
        ? "challenger"
        : "defender";

  for (const side of sides) {
    if (winner === side || winner === "draw") continue;
    for (const keyword of stageKeywords(cards[side], "outcome", rules)) {
      const outcomeContext: OutcomeContext = {
        self: workspaces[side],
        selfDamage: side === "challenger" ? challenger.damage : defender.damage,
        opponentDamage:
          side === "challenger" ? defender.damage : challenger.damage,
        outcome: winner,
        rules,
        notes,
      };
      const override = keyword.adjustOutcome?.(outcomeContext);
      if (override) winner = override;
    }
  }

  /* 6. Post-round effects (Rally) - only for the side that won. */
  if (winner !== "draw") {
    for (const keyword of stageKeywords(cards[winner], "postRound", rules)) {
      keyword.apply?.(contextFor(winner));
    }
  }

  return { slot, challenger, defender, winner, notes };
};

/** Per-round tiebreaker contribution: floored at 0, doubled above 10 by Overwhelm. */
const tiebreakContribution = (
  combat: SideCombat,
  rules: BattleRules,
): number => {
  const floored = Math.max(0, combat.damage);
  if (!rules.keywordsEnabled) return floored;
  const keyword = findKeyword(combat.card.keyword);
  if (keyword?.stage !== "tiebreak") return floored;
  return keyword.adjustTiebreakDamage?.(floored, rules) ?? floored;
};

export type ResolveMatchInput = {
  challengerLineup: BattleCard[];
  defenderLineup: BattleCard[];
  /** Partial override of the tuning dials. */
  rules?: Partial<BattleRules>;
};

/**
 * Resolves a full match. Rounds are presented as simultaneous but evaluated in
 * slot order, because `Momentum`, `Avenge` and `Rally` all read match state
 * that only exists if there is an order.
 */
export const resolveMatch = ({
  challengerLineup,
  defenderLineup,
  rules: ruleOverrides,
}: ResolveMatchInput): MatchResult => {
  const rules: BattleRules = { ...RULES, ...ruleOverrides };

  if (challengerLineup.length !== defenderLineup.length) {
    throw new Error(
      `Lineups must be the same length (got ${challengerLineup.length} vs ${defenderLineup.length})`,
    );
  }
  if (challengerLineup.length === 0) {
    throw new Error("Cannot resolve a match with empty lineups");
  }

  const lineupLength = challengerLineup.length;
  const challengerState = createSideState();
  const defenderState = createSideState();
  const rounds: RoundResult[] = [];

  const tiebreakDamage: Record<Side, number> = { challenger: 0, defender: 0 };

  for (let index = 0; index < lineupLength; index++) {
    const round = resolveRound({
      slot: index + 1,
      lineupLength,
      challengerCard: challengerLineup[index],
      defenderCard: defenderLineup[index],
      challengerState,
      defenderState,
      rules,
      challengerLineup,
      defenderLineup,
      history: rounds,
    });

    rounds.push(round);

    tiebreakDamage.challenger += tiebreakContribution(round.challenger, rules);
    tiebreakDamage.defender += tiebreakContribution(round.defender, rules);

    if (round.winner === "challenger") {
      challengerState.roundsWon += 1;
      challengerState.lastRoundWasLoss = false;
      defenderState.roundsLost += 1;
      defenderState.lastRoundWasLoss = true;
    } else if (round.winner === "defender") {
      defenderState.roundsWon += 1;
      defenderState.lastRoundWasLoss = false;
      challengerState.roundsLost += 1;
      challengerState.lastRoundWasLoss = true;
    } else {
      // A draw counts for neither side, and breaks any Avenge chain.
      challengerState.lastRoundWasLoss = false;
      defenderState.lastRoundWasLoss = false;
    }
  }

  const roundsWon: Record<Side, number> = {
    challenger: challengerState.roundsWon,
    defender: defenderState.roundsWon,
  };

  /* Match tiebreaker: rounds won -> total damage -> the drawResolution dial. */
  let winner: RoundOutcome;
  let decidedBy: MatchResult["decidedBy"];

  if (roundsWon.challenger !== roundsWon.defender) {
    winner = roundsWon.challenger > roundsWon.defender ? "challenger" : "defender";
    decidedBy = "rounds";
  } else if (tiebreakDamage.challenger !== tiebreakDamage.defender) {
    winner =
      tiebreakDamage.challenger > tiebreakDamage.defender
        ? "challenger"
        : "defender";
    decidedBy = "damage";
  } else {
    winner = rules.drawResolution === "defender" ? "defender" : "draw";
    decidedBy = "rule";
  }

  return { rounds, roundsWon, tiebreakDamage, winner, decidedBy, rules };
};

/** The type composition of a lineup, order deliberately not implied. */
export const lineupComposition = (
  lineup: BattleCard[],
): Record<CardType, number> => {
  const composition: Record<CardType, number> = { power: 0, wit: 0, heart: 0 };
  for (const card of lineup) composition[card.type] += 1;
  return composition;
};
