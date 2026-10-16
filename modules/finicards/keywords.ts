import type { CardRarity } from "../../types/PocketbaseTablesV2";
import type { BattleRules } from "./rules";
import type {
  BattleCard,
  RoundOutcome,
  RoundResult,
  Side,
  SideCombat,
} from "./types";

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
 *   0. copy        - Mimic takes the opposing card's keyword
 *      suppress    - Silence switches the opposing card's keyword off
 *   1. placement   - Vanguard, Anchor, Last Stand, Gambit
 *   2. conditional - incoming handoffs (Rally, Martyr, Parting Shot), then the
 *                    stat bonuses, then Intimidate, then Echo
 *   3. matchup     - Adapt, then Guard, then Fortress
 *   4. defense     - Bulwark, Feint, then Pierce, then Brace
 *   5. damage      - computed by the engine, no keywords
 *   6. outcome     - First Strike, Edge
 *   7. postRound   - Rally (the round's winner only)
 *      postLoss    - Martyr, Parting Shot, Spoiler (the round's loser only)
 *   8. tiebreak    - Overwhelm, Grit, Relentless, Mercy
 */
export type KeywordStage =
  | "copy"
  | "suppress"
  | "placement"
  | "conditional"
  | "matchup"
  | "defense"
  | "outcome"
  | "postRound"
  | "postLoss"
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
  /** Attack the defender's lowest stat rather than the matching one (`Feint`). */
  targetLowest: boolean;
  /**
   * The keyword this card is fighting with this round: its printed one unless
   * `Mimic` swapped it or `Silence` switched it off. Stages read this, not the
   * card, so a copied or silenced keyword behaves like any other.
   */
  keyword: KeywordDefinition | null;
  bonuses: string[];
};

/** A type-stat change waiting for a side's next card, from either side. */
export type IncomingModifier = { label: string; amount: number };

/** Running per-side state across the three rounds. */
export type SideState = {
  roundsWon: number;
  roundsLost: number;
  lastRoundWasLoss: boolean;
  /** Type-stat bonus handed to the next card in the lineup by `Rally`. */
  pendingRally: number;
  /** Other handoffs for the next card (`Martyr`, `Parting Shot`), by name. */
  incoming: IncomingModifier[];
  /** The next card's keyword is switched off (`Spoiler`). */
  silenceNext: boolean;
};

export const createSideState = (): SideState => ({
  roundsWon: 0,
  roundsLost: 0,
  lastRoundWasLoss: false,
  pendingRally: 0,
  incoming: [],
  silenceNext: false,
});

export type KeywordContext = {
  self: CombatWorkspace;
  opponent: CombatWorkspace;
  /** 1-based slot. */
  slot: number;
  lineupLength: number;
  state: SideState;
  /** The other side's running state - for effects that land on their next card. */
  opponentState: SideState;
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
  /** The outcome before any keyword override. Never this card's own win. */
  outcome: RoundOutcome;
  rules: BattleRules;
  notes: string[];
};

/** Both attacks of the round a tiebreak hook is adjusting. */
export type TiebreakContext = {
  /** The attack whose damage is being counted. */
  attack: SideCombat;
  /** The attack coming the other way. */
  reply: SideCombat;
};

/**
 * How much a keyword is worth, which is what decides how often each rarity
 * rolls it (`KEYWORD_ODDS`). Graded from measured mirror-match win rates, not
 * from how the effect reads:
 *
 *   minor    - situational, or close to a coin flip on its own
 *   standard - a real edge when the card is slotted to use it
 *   strong   - always on, whatever the slot or the opponent
 *   mythic   - `Adapt`. Wins nine mirrors in ten, so it is nearly never rolled
 */
export type KeywordGrade = "minor" | "standard" | "strong" | "mythic";

export const KEYWORD_GRADES: KeywordGrade[] = [
  "minor",
  "standard",
  "strong",
  "mythic",
];

export const GRADE_LABEL: Record<KeywordGrade, string> = {
  minor: "Minor",
  standard: "Standard",
  strong: "Strong",
  mythic: "Mythic",
};

export type KeywordDefinition = {
  name: string;
  slug: string;
  grade: KeywordGrade;
  description: string;
  stage: KeywordStage;
  /** Lower runs first within a stage. */
  order: number;
  /** Mutation hook for every stage except outcome and tiebreak. */
  apply?: (ctx: KeywordContext) => void;
  /**
   * Outcome-stage hook, run for a card that lost or drew its round. Return a new
   * outcome, or null to leave it alone. Two cards asking for different outcomes
   * cancel out and the round stands as it fell.
   */
  adjustOutcome?: (ctx: OutcomeContext) => RoundOutcome | null;
  /** Tiebreak-stage hook. Return the damage this card's attack contributes. */
  adjustTiebreakDamage?: (
    damage: number,
    rules: BattleRules,
    ctx?: TiebreakContext,
  ) => number;
  /** Tiebreak-stage hook on the *opposing* attack's contribution. */
  adjustOpposingTiebreakDamage?: (
    damage: number,
    rules: BattleRules,
    ctx: TiebreakContext,
  ) => number;
};

/** The locked stage order, exported so tests can assert it hasn't drifted. */
export const KEYWORD_STAGE_ORDER: KeywordStage[] = [
  "copy",
  "suppress",
  "placement",
  "conditional",
  "matchup",
  "defense",
  "outcome",
  "postRound",
  "postLoss",
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

/** `Thrifty` fires at or under this total lineup cost: two commons and an uncommon. */
export const THRIFTY_COST_CAP = 7;

/** Tags every converted card carries, which would make `Synergy` free. */
const UNIVERSAL_TAGS = new Set(["legacy"]);

/** A true minus sign, so "+3" and "−2" line up wherever a bonus is shown. */
const signedAmount = (amount: number): string =>
  amount < 0 ? `\u2212${-amount}` : `+${amount}`;

/** Adds to a card's type stat and records why. The one way a bonus is applied. */
const addToStat = (
  workspace: CombatWorkspace,
  label: string,
  amount: number,
): void => {
  if (amount === 0) return;
  workspace.attackStat += amount;
  workspace.bonuses.push(`${label} ${signedAmount(amount)}`);
};

/** The other cards in this card's lineup. */
const lineupMates = (ctx: KeywordContext): BattleCard[] =>
  ctx.selfLineup.filter((_, index) => index !== ctx.slot - 1);

export const KEYWORDS: KeywordDefinition[] = [
  {
    name: "Vanguard",
    slug: "vanguard",
    grade: "standard",
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
    grade: "standard",
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
    grade: "minor",
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
    grade: "standard",
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
    grade: "standard",
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
    grade: "mythic",
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
    grade: "strong",
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
    grade: "strong",
    description: "+2 to whatever defensive stat is used",
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
    grade: "strong",
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
    grade: "minor",
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
    grade: "minor",
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
    grade: "minor",
    description: "Damage dealt above 10 counts double toward the match tiebreaker",
    stage: "tiebreak",
    order: 1,
    adjustTiebreakDamage: (damage, rules) =>
      damage + Math.max(0, damage - rules.overwhelmThreshold),
  },

  /* ---------------------------------------------------- slot placement ---- */
  {
    name: "Anchor",
    slug: "anchor",
    grade: "standard",
    description: `+${STANDARD_BONUS} to type stat while in a middle slot`,
    stage: "placement",
    order: 1,
    apply: (ctx) => {
      if (ctx.slot === 1 || ctx.slot === ctx.lineupLength) return;
      addToStat(ctx.self, "Anchor", STANDARD_BONUS);
    },
  },
  {
    name: "Gambit",
    slug: "gambit",
    grade: "standard",
    description: "+5 to type stat in slot 1, but \u22122 in any other slot",
    stage: "placement",
    order: 1,
    apply: (ctx) => addToStat(ctx.self, "Gambit", ctx.slot === 1 ? 5 : -2),
  },
  {
    name: "Closer",
    slug: "closer",
    grade: "standard",
    description: `+${STANDARD_BONUS} to type stat if the match is level going into this round (not slot 1)`,
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      if (ctx.slot === 1) return;
      if (ctx.state.roundsWon !== ctx.opponentState.roundsWon) return;
      addToStat(ctx.self, "Closer", STANDARD_BONUS);
    },
  },

  /* ----------------------------------------------- reading the opponent ---- */
  {
    name: "Rival",
    slug: "rival",
    grade: "standard",
    description: `+${STANDARD_BONUS} to type stat against a card of the same type`,
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      if (ctx.opponent.card.type !== ctx.self.card.type) return;
      addToStat(ctx.self, "Rival", STANDARD_BONUS);
    },
  },
  {
    name: "Giant Slayer",
    slug: "giant_slayer",
    grade: "standard",
    description: `+${STANDARD_BONUS} to type stat if the opposing card's printed type stat is higher than this card's`,
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      const theirs = ctx.opponent.card.stats[ctx.opponent.card.type];
      const mine = ctx.self.card.stats[ctx.self.card.type];
      if (theirs <= mine) return;
      addToStat(ctx.self, "Giant Slayer", STANDARD_BONUS);
    },
  },
  {
    // Runs after the bonuses so the stat it trims is the one that would attack.
    name: "Intimidate",
    slug: "intimidate",
    grade: "strong",
    description: "The opposing card gets \u22122 to its type stat",
    stage: "conditional",
    order: 2,
    apply: (ctx) => {
      const taken = Math.min(2, ctx.opponent.attackStat);
      if (taken <= 0) return;
      ctx.opponent.attackStat -= taken;
      ctx.opponent.bonuses.push(`Intimidated ${signedAmount(-taken)}`);
      ctx.self.bonuses.push(`Intimidate (${ctx.opponent.card.name})`);
    },
  },
  {
    name: "Purist",
    slug: "purist",
    grade: "standard",
    description: `+${STANDARD_BONUS} to type stat if the opposing card has no ability in play`,
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      if (ctx.opponent.keyword) return;
      addToStat(ctx.self, "Purist", STANDARD_BONUS);
    },
  },
  {
    name: "Brace",
    slug: "brace",
    grade: "standard",
    description: `+${STANDARD_BONUS} to defence when the opposing card has the type multiplier`,
    stage: "defense",
    order: 3,
    apply: (ctx) => {
      if (ctx.opponent.multiplier <= ctx.rules.neutralMultiplier) return;
      ctx.self.defenseBonus += STANDARD_BONUS;
      ctx.self.bonuses.push(`Brace +${STANDARD_BONUS} def`);
    },
  },
  {
    name: "Mimic",
    slug: "mimic",
    grade: "minor",
    description: "Fights with the opposing card's ability instead of its own",
    stage: "copy",
    order: 1,
    apply: (ctx) => {
      const theirs = ctx.opponent.keyword;
      // Two Mimics have nothing to copy from each other.
      if (!theirs || theirs.stage === "copy") return;
      ctx.self.keyword = theirs;
      ctx.self.bonuses.push(`Mimic (${theirs.name})`);
    },
  },
  {
    name: "Silence",
    slug: "silence",
    grade: "standard",
    description: "The opposing card's ability does nothing this round",
    stage: "suppress",
    order: 1,
    apply: (ctx) => {
      const theirs = ctx.opponent.keyword;
      if (!theirs) return;
      ctx.opponent.keyword = null;
      ctx.self.bonuses.push(`Silence (no ${theirs.name})`);
    },
  },

  /* ---------------------------------------------- lineup and deck shape ---- */
  {
    name: "Kinship",
    slug: "kinship",
    grade: "standard",
    description: "+2 to type stat per other card in your lineup from the same series",
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      const series = ctx.self.card.series.trim().toLowerCase();
      if (!series) return;
      const kin = lineupMates(ctx).filter(
        (card) => card.series.trim().toLowerCase() === series,
      ).length;
      addToStat(ctx.self, "Kinship", kin * 2);
    },
  },
  {
    name: "Trinity",
    slug: "trinity",
    grade: "standard",
    description: `+${STANDARD_BONUS} to type stat if your lineup has all three types`,
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      if (new Set(ctx.selfLineup.map((card) => card.type)).size < 3) return;
      addToStat(ctx.self, "Trinity", STANDARD_BONUS);
    },
  },
  {
    name: "Chorus",
    slug: "chorus",
    grade: "standard",
    description: "+2 to type stat per other card of the same type in your lineup",
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      const same = lineupMates(ctx).filter(
        (card) => card.type === ctx.self.card.type,
      ).length;
      addToStat(ctx.self, "Chorus", same * 2);
    },
  },
  {
    name: "Lone Wolf",
    slug: "lone_wolf",
    grade: "standard",
    description: `+${STANDARD_BONUS} to type stat if no other card in your lineup shares its type`,
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      if (lineupMates(ctx).some((card) => card.type === ctx.self.card.type)) {
        return;
      }
      addToStat(ctx.self, "Lone Wolf", STANDARD_BONUS);
    },
  },
  {
    name: "Synergy",
    slug: "synergy",
    grade: "minor",
    description: "+1 to type stat per other card in your lineup sharing a tag",
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      const mine = ctx.self.card.tags.filter((tag) => !UNIVERSAL_TAGS.has(tag));
      const linked = lineupMates(ctx).filter((card) =>
        card.tags.some((tag) => mine.includes(tag)),
      ).length;
      addToStat(ctx.self, "Synergy", linked);
    },
  },
  {
    name: "Thrifty",
    slug: "thrifty",
    grade: "standard",
    description: `+${STANDARD_BONUS} to type stat if your lineup's total cost is ${THRIFTY_COST_CAP} or less`,
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      const total = ctx.selfLineup.reduce((sum, card) => sum + card.cost, 0);
      if (total > THRIFTY_COST_CAP) return;
      addToStat(ctx.self, "Thrifty", STANDARD_BONUS);
    },
  },

  /* ------------------------------------------------------ match history ---- */
  {
    name: "Grudge",
    slug: "grudge",
    grade: "standard",
    description: "+2 to type stat per round already lost this match",
    stage: "conditional",
    order: 1,
    apply: (ctx) => addToStat(ctx.self, "Grudge", ctx.state.roundsLost * 2),
  },
  {
    // Last of the conditionals, so it compares against this card's final stat.
    name: "Echo",
    slug: "echo",
    grade: "standard",
    description: "Attacks with your previous card's final type stat if that was higher",
    stage: "conditional",
    order: 9,
    apply: (ctx) => {
      const previous = ctx.history.at(-1)?.[ctx.self.side].attackStat ?? 0;
      addToStat(ctx.self, "Echo", Math.max(0, previous - ctx.self.attackStat));
    },
  },
  {
    name: "Second Wind",
    slug: "second_wind",
    grade: "minor",
    description: `+${STANDARD_BONUS} to type stat if the previous round was a draw`,
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      if (ctx.history.at(-1)?.winner !== "draw") return;
      addToStat(ctx.self, "Second Wind", STANDARD_BONUS);
    },
  },
  {
    name: "Martyr",
    slug: "martyr",
    grade: "standard",
    description: `If this card loses its round, your next card gets +${STANDARD_BONUS} to its type stat`,
    stage: "postLoss",
    order: 1,
    apply: (ctx) => {
      if (ctx.slot === ctx.lineupLength) return;
      ctx.state.incoming.push({ label: "Martyr", amount: STANDARD_BONUS });
      ctx.notes.push(
        `Martyr: next ${ctx.self.side} card gets +${STANDARD_BONUS}`,
      );
    },
  },
  {
    name: "Parting Shot",
    slug: "parting_shot",
    grade: "standard",
    description: "If this card loses its round, the opponent's next card gets \u22122 to its type stat",
    stage: "postLoss",
    order: 1,
    apply: (ctx) => {
      if (ctx.slot === ctx.lineupLength) return;
      ctx.opponentState.incoming.push({ label: "Parting Shot", amount: -2 });
      ctx.notes.push(
        `Parting Shot: ${ctx.self.side} weakens the next opposing card by 2`,
      );
    },
  },
  {
    name: "Spoiler",
    slug: "spoiler",
    grade: "minor",
    description: "If this card loses its round, the opponent's next card has its ability switched off",
    stage: "postLoss",
    order: 1,
    apply: (ctx) => {
      if (ctx.slot === ctx.lineupLength) return;
      ctx.opponentState.silenceNext = true;
      ctx.notes.push(
        `Spoiler: ${ctx.self.side} switches off the next opposing ability`,
      );
    },
  },

  /* ------------------------------------------------------- stat bending ---- */
  {
    /* A card's type is its highest stat, so "attack with your best stat" would
       never fire. This pays the opposite kind of card instead: the rounded one
       whose other two stats are worth something. */
    name: "Versatile",
    slug: "versatile",
    grade: "minor",
    description: "+1 to type stat for each of its other two stats that is 5 or higher",
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      const { stats, type } = ctx.self.card;
      const rounded = (Object.keys(stats) as BattleCard["type"][]).filter(
        (key) => key !== type && stats[key] >= 5,
      ).length;
      addToStat(ctx.self, "Versatile", rounded);
    },
  },
  {
    name: "Glass Cannon",
    slug: "glass_cannon",
    grade: "standard",
    description: "+4 to type stat, but \u22123 to whatever defensive stat is used",
    stage: "conditional",
    order: 1,
    apply: (ctx) => {
      ctx.self.defenseBonus -= 3;
      addToStat(ctx.self, "Glass Cannon", 4);
    },
  },
  {
    name: "Feint",
    slug: "feint",
    grade: "strong",
    description: "Attacks the opposing card's lowest stat instead of the matching one",
    stage: "defense",
    order: 1,
    apply: (ctx) => {
      const { stats } = ctx.opponent.card;
      if (Math.min(...Object.values(stats)) >= stats[ctx.self.card.type]) return;
      ctx.self.targetLowest = true;
      ctx.self.bonuses.push("Feint (lowest stat)");
    },
  },
  {
    // After Adapt and Guard: a Fortress never holds the multiplier, however it
    // came by it.
    name: "Fortress",
    slug: "fortress",
    grade: "strong",
    description: `+${STANDARD_BONUS} to whatever defensive stat is used, but never gets the type multiplier`,
    stage: "matchup",
    order: 3,
    apply: (ctx) => {
      ctx.self.multiplier = ctx.rules.neutralMultiplier;
      ctx.self.adapted = false;
      ctx.self.defenseBonus += STANDARD_BONUS;
      ctx.self.bonuses.push(`Fortress +${STANDARD_BONUS} def`);
    },
  },

  /* ----------------------------------------------- outcome and tiebreak ---- */
  {
    name: "Edge",
    slug: "edge",
    grade: "minor",
    description: "Wins its round if the round would be a draw",
    stage: "outcome",
    order: 1,
    adjustOutcome: (ctx) => {
      if (ctx.outcome !== "draw") return null;
      ctx.notes.push(`Edge: ${ctx.self.side} takes the drawn round`);
      return ctx.self.side;
    },
  },
  {
    name: "Grit",
    slug: "grit",
    grade: "minor",
    description: "This card's damage counts double toward the match tiebreaker",
    stage: "tiebreak",
    order: 1,
    adjustTiebreakDamage: (damage) => damage * 2,
  },
  {
    name: "Relentless",
    slug: "relentless",
    grade: "minor",
    description: "Always counts at least 4 damage toward the match tiebreaker",
    stage: "tiebreak",
    order: 1,
    adjustTiebreakDamage: (damage) => Math.max(4, damage),
  },
  {
    name: "Mercy",
    slug: "mercy",
    grade: "minor",
    description: "If this card wins its round by 5 or more, the opposing card's damage counts for nothing toward the tiebreaker",
    stage: "tiebreak",
    order: 1,
    adjustOpposingTiebreakDamage: (damage, _rules, ctx) =>
      ctx.reply.damage - ctx.attack.damage >= 5 ? 0 : damage,
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
  if (!KEYWORD_GRADES.includes(keyword.grade)) {
    throw new Error(
      `Keyword "${slug}" declares unknown grade "${keyword.grade}". Valid grades: ${KEYWORD_GRADES.join(", ")}`,
    );
  }
  if (!KEYWORD_STAGE_ORDER.includes(keyword.stage)) {
    throw new Error(
      `Keyword "${slug}" declares unknown stage "${keyword.stage}". Valid stages: ${KEYWORD_STAGE_ORDER.join(", ")}`,
    );
  }
  if (
    !keyword.apply &&
    !keyword.adjustOutcome &&
    !keyword.adjustTiebreakDamage &&
    !keyword.adjustOpposingTiebreakDamage
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

/**
 * The keyword a card actually fought a round with.
 *
 * Read off the combat record rather than the card, because `Mimic` and
 * `Silence` change it. Records stored before that was tracked have no
 * `activeKeyword` and fall back to the printed one.
 */
export const combatKeyword = (combat: SideCombat): KeywordDefinition | null =>
  findKeyword(combat.activeKeyword ?? combat.card.keyword);

/** Every keyword of one grade, in library order. */
export const keywordsOfGrade = (grade: KeywordGrade): KeywordDefinition[] =>
  KEYWORDS.filter((keyword) => keyword.grade === grade);

/**
 * The chance a card of each rarity carries a keyword of each grade. Whatever is
 * left over is the chance of no keyword at all.
 *
 * Rarity already buys a bigger spike, so it is not also allowed to buy the best
 * keywords: the odds run the other way. A common has little to swing with and
 * usually gets something good to swing it; a full-art is devastating on stats
 * alone and usually gets nothing, or something small. That is what keeps every
 * rarity worth pulling, and it is tuned against
 * `scripts/finicards_v2_simulate.ts --keywords`.
 */
export const KEYWORD_ODDS: Record<CardRarity, Record<KeywordGrade, number>> = {
  common: { minor: 0.1, standard: 0.5, strong: 0.35, mythic: 0.005 },
  uncommon: { minor: 0.3, standard: 0.3, strong: 0.1, mythic: 0.005 },
  full_art: { minor: 0.25, standard: 0.1, strong: 0.02, mythic: 0.005 },
};

/**
 * Rolls a keyword slug for a card of `rarity`, or "" for none.
 *
 * Takes its two rolls (each in [0, 1)) rather than a random source, so the
 * caller decides whether that is a seeded hash or real randomness.
 */
export const rollKeyword = (
  rarity: CardRarity,
  gradeRoll: number,
  pickRoll: number,
): string => {
  let threshold = 0;
  for (const grade of KEYWORD_GRADES) {
    threshold += KEYWORD_ODDS[rarity][grade];
    if (gradeRoll >= threshold) continue;
    const pool = keywordsOfGrade(grade);
    if (pool.length === 0) return "";
    return pool[Math.min(pool.length - 1, Math.floor(pickRoll * pool.length))]
      .slug;
  }
  return "";
};
