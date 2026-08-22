import type { CardRarity } from "../../types/PocketbaseTablesV2";
import type { BattleRules } from "./rules";
import type { BattleCard, RoundOutcome, RoundResult, Side } from "./types";

/**
 * Keyword library.
 *
 * Every keyword is a data row plus one small hook - no card ever gets its own
 * code path. A card references a keyword by slug; if the slug is unknown the
 * card simply battles as pure stats, so a typo can never crash a match.
 *
 * The resolution order is locked here and nowhere else. The design doc is
 * explicit that ambiguity in this order is where balance bugs live:
 *
 *   1. placement   - Vanguard, Last Stand
 *   2. conditional - Momentum, Avenge, Underdog (and incoming Rally)
 *   3. matchup     - Adapt, then Guard
 *   4. defense     - Bulwark, then Pierce
 *   5. damage      - computed by the engine, no keywords
 *   6. outcome     - First Strike
 *   7. postRound   - Rally
 *   8. tiebreak    - Overwhelm
 */
export type KeywordStage =
  | "placement"
  | "conditional"
  | "matchup"
  | "defense"
  | "outcome"
  | "postRound"
  | "tiebreak";

/** Mutable per-round working state for one side's card. */
export type CombatWorkspace = {
  side: Side;
  /** The card itself - type, stats, tags, series, cost, foil are all readable. */
  card: BattleCard;
  /** The type stat, mutated by bonus keywords. */
  attackStat: number;
  /** Multiplier this card attacks with. */
  multiplier: number;
  /** Added to this card's defensive stats when it is attacked (`Bulwark`). */
  defenseBonus: number;
  /** Subtracted from the defender's stat when this card attacks (`Pierce`). */
  pierce: number;
  /** True once `Adapt` has forced the advantage. */
  adapted: boolean;
  bonuses: string[];
};

/** Running per-side state across the three rounds. */
export type SideState = {
  roundsWon: number;
  roundsLost: number;
  lastRoundWasLoss: boolean;
  /** Type-stat bonus handed to the next card in the lineup by `Rally`. */
  pendingRally: number;
};

export const createSideState = (): SideState => ({
  roundsWon: 0,
  roundsLost: 0,
  lastRoundWasLoss: false,
  pendingRally: 0,
});

export type KeywordContext = {
  self: CombatWorkspace;
  opponent: CombatWorkspace;
  /** 1-based slot. */
  slot: number;
  lineupLength: number;
  state: SideState;
  rules: BattleRules;
  notes: string[];
  /** This card's whole lineup, in slot order - for "my other cards" effects. */
  selfLineup: BattleCard[];
  /** The opposing lineup, in slot order. */
  opponentLineup: BattleCard[];
  /** Rounds already resolved this match, oldest first. Empty in slot 1. */
  history: RoundResult[];
};

export type OutcomeContext = {
  self: CombatWorkspace;
  selfDamage: number;
  opponentDamage: number;
  /** The outcome before any keyword override, from this card's point of view. */
  outcome: RoundOutcome;
  rules: BattleRules;
  notes: string[];
};

export type KeywordDefinition = {
  name: string;
  slug: string;
  tier: CardRarity;
  description: string;
  stage: KeywordStage;
  /** Lower runs first within a stage. */
  order: number;
  /** Mutation hook for the placement/conditional/matchup/defense/postRound stages. */
  apply?: (ctx: KeywordContext) => void;
  /** Outcome-stage hook. Return a new outcome, or null to leave it alone. */
  adjustOutcome?: (ctx: OutcomeContext) => RoundOutcome | null;
  /** Tiebreak-stage hook. Return the damage this round contributes. */
  adjustTiebreakDamage?: (damage: number, rules: BattleRules) => number;
};

/** The locked stage order, exported so tests can assert it hasn't drifted. */
export const KEYWORD_STAGE_ORDER: KeywordStage[] = [
  "placement",
  "conditional",
  "matchup",
  "defense",
  "outcome",
  "postRound",
  "tiebreak",
];

const RARITY_RANK: Record<CardRarity, number> = {
  common: 0,
  uncommon: 1,
  full_art: 2,
};

/** Bonus every "+3 to type stat" keyword uses. One dial, not eleven. */
const STANDARD_BONUS = 3;

/** `Rally`'s handoff bonus. */
export const RALLY_BONUS = 2;

export const KEYWORDS: KeywordDefinition[] = [
  {
    name: "Vanguard",
    slug: "vanguard",
    tier: "uncommon",
    description: `+${STANDARD_BONUS} to type stat while in slot 1`,
    stage: "placement",
    order: 1,
    apply: (ctx) => {
      if (ctx.slot !== 1) return;
      ctx.self.attackStat += STANDARD_BONUS;
      ctx.self.bonuses.push(`Vanguard +${STANDARD_BONUS}`);
    },
  },
  {
    name: "Last Stand",
    slug: "last_stand",
    tier: "uncommon",
    description: `+${STANDARD_BONUS} to type stat while in the final slot`,
    stage: "placement",
    order: 1,
    apply: (ctx) => {
      if (ctx.slot !== ctx.lineupLength) return;
      ctx.self.attackStat += STANDARD_BONUS;
      ctx.self.bonuses.push(`Last Stand +${STANDARD_BONUS}`);
    },
  },
  {
    name: "Momentum",
    slug: "momentum",
    tier: "uncommon",
    description: "+1 to type stat per round already won this match",
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      if (ctx.state.roundsWon <= 0) return;
      ctx.self.attackStat += ctx.state.roundsWon;
      ctx.self.bonuses.push(`Momentum +${ctx.state.roundsWon}`);
    },
  },
  {
    name: "Avenge",
    slug: "avenge",
    tier: "uncommon",
    description: `+${STANDARD_BONUS} to type stat if the previous round was a loss`,
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      if (!ctx.state.lastRoundWasLoss) return;
      ctx.self.attackStat += STANDARD_BONUS;
      ctx.self.bonuses.push(`Avenge +${STANDARD_BONUS}`);
    },
  },
  {
    name: "Underdog",
    slug: "underdog",
    tier: "uncommon",
    description: `+${STANDARD_BONUS} to type stat if the opposing card is a higher rarity`,
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      if (
        RARITY_RANK[ctx.opponent.card.rarity] <=
        RARITY_RANK[ctx.self.card.rarity]
      )
        return;
      ctx.self.attackStat += STANDARD_BONUS;
      ctx.self.bonuses.push(`Underdog +${STANDARD_BONUS}`);
    },
  },
  {
    name: "Adapt",
    slug: "adapt",
    tier: "full_art",
    description:
      "This card's type counts as whatever beats the opposing card's type",
    stage: "matchup",
    order: 1,
    apply: (ctx) => {
      if (ctx.self.multiplier >= ctx.rules.typeMultiplier) return;
      ctx.self.multiplier = ctx.rules.typeMultiplier;
      ctx.self.adapted = true;
      ctx.self.bonuses.push(`Adapt x${ctx.rules.typeMultiplier}`);
    },
  },
  {
    // Runs after Adapt, so Guard wins the interaction.
    name: "Guard",
    slug: "guard",
    tier: "uncommon",
    description: "Opponents get no type multiplier against this card",
    stage: "matchup",
    order: 2,
    apply: (ctx) => {
      if (ctx.opponent.multiplier <= ctx.rules.neutralMultiplier) return;
      ctx.opponent.multiplier = ctx.rules.neutralMultiplier;
      ctx.opponent.adapted = false;
      ctx.self.bonuses.push("Guard (no multiplier vs this card)");
    },
  },
  {
    name: "Bulwark",
    slug: "bulwark",
    tier: "uncommon",
    description: "+2 to all three defensive stats",
    stage: "defense",
    order: 1,
    apply: (ctx) => {
      ctx.self.defenseBonus += 2;
      ctx.self.bonuses.push("Bulwark +2 def");
    },
  },
  {
    name: "Pierce",
    slug: "pierce",
    tier: "uncommon",
    description: `Ignore ${STANDARD_BONUS} points of the defender's defensive stat`,
    stage: "defense",
    order: 2,
    apply: (ctx) => {
      ctx.self.pierce += STANDARD_BONUS;
      ctx.self.bonuses.push(`Pierce ${STANDARD_BONUS}`);
    },
  },
  {
    name: "First Strike",
    slug: "first_strike",
    tier: "uncommon",
    description:
      "If this card would lose its round by 2 or less, the round is a draw instead",
    stage: "outcome",
    order: 1,
    adjustOutcome: (ctx) => {
      const margin = ctx.opponentDamage - ctx.selfDamage;
      if (margin <= 0 || margin > 2) return null;
      ctx.notes.push(
        `First Strike: ${ctx.self.side} lost by ${margin}, round is a draw`,
      );
      return "draw";
    },
  },
  {
    // The one keyword whose effect lands on a *different* card, so its hook only
    // records intent - the engine spends `pendingRally` on the next card during
    // the conditional stage.
    name: "Rally",
    slug: "rally",
    tier: "uncommon",
    description: `If this card wins its round, the next card in the lineup gets +${RALLY_BONUS} to its type stat`,
    stage: "postRound",
    order: 1,
    apply: (ctx) => {
      ctx.state.pendingRally += RALLY_BONUS;
      ctx.notes.push(`Rally: next ${ctx.self.side} card gets +${RALLY_BONUS}`);
    },
  },
  {
    name: "Overwhelm",
    slug: "overwhelm",
    tier: "full_art",
    description: "Damage dealt above 10 counts double toward the match tiebreaker",
    stage: "tiebreak",
    order: 1,
    adjustTiebreakDamage: (damage, rules) =>
      damage + Math.max(0, damage - rules.overwhelmThreshold),
  },
];

const KEYWORD_BY_SLUG = new Map<string, KeywordDefinition>(
  KEYWORDS.map((keyword) => [keyword.slug, keyword]),
);

/**
 * Adds a keyword to the library.
 *
 * This is the whole extension point. A new keyword is a data row plus one hook -
 * the engine is never edited, no migration runs, and cards reference it by slug,
 * so a card that already carries the slug picks it up the moment it registers.
 *
 * Validation is deliberate: a duplicate slug or an unknown stage would fail
 * silently at resolution time (the keyword simply never firing), which is a
 * miserable thing to debug during a balance pass.
 */
export const registerKeyword = (keyword: KeywordDefinition): void => {
  const slug = normalizeKeywordSlug(keyword.slug);

  if (!slug) {
    throw new Error("A keyword needs a slug");
  }
  if (KEYWORD_BY_SLUG.has(slug)) {
    throw new Error(`Keyword slug "${slug}" is already registered`);
  }
  if (!KEYWORD_STAGE_ORDER.includes(keyword.stage)) {
    throw new Error(
      `Keyword "${slug}" declares unknown stage "${keyword.stage}". Valid stages: ${KEYWORD_STAGE_ORDER.join(", ")}`,
    );
  }
  if (
    !keyword.apply &&
    !keyword.adjustOutcome &&
    !keyword.adjustTiebreakDamage
  ) {
    throw new Error(`Keyword "${slug}" has no effect hook`);
  }

  const registered = { ...keyword, slug };
  KEYWORDS.push(registered);
  KEYWORD_BY_SLUG.set(slug, registered);
};

/** Removes a keyword. Mainly so tests can register one without leaking it. */
export const unregisterKeyword = (slug: string): void => {
  const normalized = normalizeKeywordSlug(slug);
  KEYWORD_BY_SLUG.delete(normalized);
  const index = KEYWORDS.findIndex((keyword) => keyword.slug === normalized);
  if (index >= 0) KEYWORDS.splice(index, 1);
};

/** Normalises "Last Stand", "last-stand", "LAST_STAND" to "last_stand". */
export const normalizeKeywordSlug = (raw: string): string =>
  (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Looks a keyword up by name or slug. Unknown keywords resolve to null. */
export const findKeyword = (raw: string): KeywordDefinition | null => {
  if (!raw) return null;
  return KEYWORD_BY_SLUG.get(normalizeKeywordSlug(raw)) ?? null;
};

/** Keywords available to a rarity - commons are pure stats. */
export const keywordsForRarity = (rarity: CardRarity): KeywordDefinition[] => {
  if (rarity === "common") return [];
  if (rarity === "uncommon")
    return KEYWORDS.filter((k) => k.tier === "uncommon");
  return KEYWORDS;
};

