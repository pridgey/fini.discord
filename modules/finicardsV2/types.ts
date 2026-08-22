import type {
  CardRarity,
  CardType,
  V2CardDefinitionRecord,
  V2UserCardRecord,
} from "../../types/PocketbaseTablesV2";
import type { BattleRules } from "./rules";

/** A card as the battle engine sees it. Flat, serialisable, no Pocketbase. */
export type BattleCard = {
  /** The `v2_user_card` id, or a synthetic id for simulations. */
  instanceId: string;
  definitionId: string;
  name: string;
  series: string;
  rarity: CardRarity;
  type: CardType;
  stats: Record<CardType, number>;
  keyword: string;
  foil: boolean;
  tags: string[];
  cost: number;
  /** Artwork URL, if the card has one. Optional so test fixtures stay terse. */
  artUrl?: string;
  /** id of the v1 row this was converted from - its image is the art fallback. */
  legacyCard?: string;
  /** Flavour text, shown on templates that have room for it. */
  flavour?: string;
  /** Artist credit for the footer. */
  artist?: string;
};

export type Side = "challenger" | "defender";

/** A full accounting of one card's attack in one round. Everything shown to the
 * player is read off this, so nothing needs recomputing at render time. */
export type SideCombat = {
  card: BattleCard;
  /** Printed type. */
  printedType: CardType;
  /** Type used for the matchup after keywords (`Adapt`). */
  attackType: CardType;
  /** The printed type stat before bonuses. */
  baseAttackStat: number;
  /** The type stat after keyword bonuses. */
  attackStat: number;
  multiplier: number;
  /** floor(attackStat * multiplier) - the doc floors the product. */
  attackValue: number;
  /** The opponent's stat matching this attack, after their defensive keywords. */
  defenseFaced: number;
  damage: number;
  /** Human-readable list of what modified this attack. */
  bonuses: string[];
};

export type RoundOutcome = Side | "draw";

export type RoundResult = {
  /** 1-based. */
  slot: number;
  challenger: SideCombat;
  defender: SideCombat;
  winner: RoundOutcome;
  /** Keyword triggers and outcome overrides worth surfacing. */
  notes: string[];
};

export type MatchResult = {
  rounds: RoundResult[];
  roundsWon: Record<Side, number>;
  /** Per-round damage floored at 0, plus any `Overwhelm` doubling. */
  tiebreakDamage: Record<Side, number>;
  winner: RoundOutcome;
  decidedBy: "rounds" | "damage" | "rule";
  rules: BattleRules;
};

/** A stat spread, before it is known to be legal. */
export type StatSpread = Record<CardType, number>;

/** Result of checking a spread against the rarity budget. */
export type SpreadValidation = {
  valid: boolean;
  issues: string[];
};

export type CardDefinitionWithCount = V2CardDefinitionRecord & {
  /** Copies of this definition already claimed on the server. */
  claimed: number;
};

export type OwnedCard = V2UserCardRecord & {
  definition: V2CardDefinitionRecord;
};
