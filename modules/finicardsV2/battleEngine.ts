import type { CardType } from "../../types/PocketbaseTablesV2";
import type {
  CombatWorkspace,
  KeywordContext,
  KeywordDefinition,
  OutcomeContext,
  SideState,
} from "./keywords";
import { combatKeyword, createSideState, findKeyword } from "./keywords";
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
  targetLowest: false,
  keyword: rules.keywordsEnabled ? findKeyword(card.keyword) : null,
  side,
  card,
  attackStat: card.stats[card.type],
  multiplier: rules.neutralMultiplier,
  defenseBonus: 0,
  pierce: 0,
  adapted: false,
  bonuses: [],
});

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
    opponentState: states[otherSide(side)],
    rules,
    notes,
    selfLineup: lineups[side],
    opponentLineup: lineups[otherSide(side)],
    history,
  });

  /* The keyword each card is fighting with *now*. Read at the moment a stage
     runs rather than up front, so a keyword `Mimic` copied takes its turn in the
     later stages and one `Silence` switched off never does. */
  const keywordAt = (
    side: Side,
    stage: KeywordDefinition["stage"],
  ): KeywordDefinition | null => {
    const keyword = workspaces[side].keyword;
    return keyword?.stage === stage ? keyword : null;
  };

  const runStage = (stage: KeywordDefinition["stage"]) => {
    const queued = sides
      .flatMap((side) => {
        const keyword = keywordAt(side, stage);
        return keyword ? [{ side, keyword }] : [];
      })
      .sort((a, b) => a.keyword.order - b.keyword.order);

    for (const { side, keyword } of queued) {
      keyword.apply?.(contextFor(side));
    }
  };

  /* 0. Which keywords are in play at all. A `Spoiler` from the last round lands
        first, then `Mimic` copies, then `Silence` switches off - so a Mimic can
        copy a Silence, and two Silences cancel each other. */
  for (const side of sides) {
    const state = states[side];
    if (!state.silenceNext) continue;
    state.silenceNext = false;
    const lost = workspaces[side].keyword;
    if (!lost) continue;
    workspaces[side].keyword = null;
    notes.push(`Spoiler: ${cards[side].name}'s ${lost.name} is switched off`);
  }
  runStage("copy");
  runStage("suppress");

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
    for (const { label, amount } of state.incoming) {
      workspaces[side].attackStat += amount;
      workspaces[side].bonuses.push(
        `${label} ${amount < 0 ? `\u2212${-amount}` : `+${amount}`}`,
      );
    }
    state.incoming = [];
  }
  runStage("conditional");

  // Penalties stack, but a stat never goes below nothing.
  for (const side of sides) {
    workspaces[side].attackStat = Math.max(0, workspaces[side].attackStat);
  }

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
    // The defender defends with the stat matching the incoming attack, unless
    // a `Feint` goes for whichever of the three is weakest.
    const defendingStat = self.targetLowest
      ? Math.min(...Object.values(defenderCardOfThis.stats))
      : defenderCardOfThis.stats[attackType];
    const defenseFaced = Math.max(
      0,
      defendingStat + opponent.defenseBonus - self.pierce,
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
      activeKeyword: self.keyword?.slug ?? "",
    };
  };

  const challenger = buildCombat("challenger");
  const defender = buildCombat("defender");

  /* 5. Outcome. A card that did not win may ask for a different one: First
        Strike softens a narrow loss into a draw, Edge takes a drawn round. Every
        hook sees the outcome as it fell, and two cards asking for different
        things cancel out - so two Edges facing each other still draw. */
  const fallen: RoundOutcome =
    challenger.damage === defender.damage
      ? "draw"
      : challenger.damage > defender.damage
        ? "challenger"
        : "defender";

  const requests = sides.flatMap((side) => {
    const keyword = fallen === side ? null : keywordAt(side, "outcome");
    if (!keyword) return [];
    const requestNotes: string[] = [];
    const outcomeContext: OutcomeContext = {
      self: workspaces[side],
      selfDamage: side === "challenger" ? challenger.damage : defender.damage,
      opponentDamage:
        side === "challenger" ? defender.damage : challenger.damage,
      outcome: fallen,
      rules,
      notes: requestNotes,
    };
    const outcome = keyword.adjustOutcome?.(outcomeContext);
    return outcome ? [{ outcome, notes: requestNotes }] : [];
  });

  let winner = fallen;
  if (new Set(requests.map((request) => request.outcome)).size === 1) {
    winner = requests[0].outcome;
    notes.push(...requests.flatMap((request) => request.notes));
  }

  /* 6. Post-round effects: Rally for the side that won, and the on-loss
        handoffs (Martyr, Parting Shot, Spoiler) for the side that lost. */
  if (winner !== "draw") {
    const loser = otherSide(winner);
    const won = keywordAt(winner, "postRound");
    const lost = keywordAt(loser, "postLoss");
    won?.apply?.(contextFor(winner));
    lost?.apply?.(contextFor(loser));
  }

  return { slot, challenger, defender, winner, notes };
};

/**
 * What each side's attack in a round counts toward the tiebreaker, and how it
 * got there: `dealt` is the damage floored at 0, `own` is after the attacking
 * card's keyword (`Overwhelm`, `Grit`, `Relentless`), `counted` after the
 * opposing card's (`Mercy`). Exported so the result can explain the difference.
 */
export const tiebreakDamageOf = (
  round: RoundResult,
  side: Side,
  rules: BattleRules,
): { dealt: number; own: number; counted: number } => {
  const attack = round[side];
  const reply = round[otherSide(side)];
  const dealt = Math.max(0, attack.damage);
  if (!rules.keywordsEnabled) return { dealt, own: dealt, counted: dealt };

  const context = { attack, reply };
  const own =
    combatKeyword(attack)?.adjustTiebreakDamage?.(dealt, rules, context) ??
    dealt;
  const counted =
    combatKeyword(reply)?.adjustOpposingTiebreakDamage?.(own, rules, context) ??
    own;
  return { dealt, own, counted };
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

    tiebreakDamage.challenger += tiebreakDamageOf(round, "challenger", rules).counted;
    tiebreakDamage.defender += tiebreakDamageOf(round, "defender", rules).counted;

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
