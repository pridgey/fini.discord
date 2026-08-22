/**
 * Pocketbase record types for Finicards **v2**.
 *
 * These live in their own file (and their own `v2_*` collections) so the v1
 * implementation in `types/PocketbaseTables.ts` / `modules/finicards` keeps
 * working untouched while v2 is tested side by side.
 */

/** The three battle types. Power > Wit > Heart > Power. */
export type CardType = "power" | "wit" | "heart";

/** v2 rarities. Note these are words, not the v1 single-letter codes. */
export type CardRarity = "common" | "uncommon" | "full_art";

/** A card definition - the "data row" a card is. */
export type V2CardDefinitionRecord = {
  id?: string;
  card_name: string;
  series: string;
  rarity: CardRarity;
  /** Stat spread. Always totals RULES.statTotal (15). */
  power: number;
  wit: number;
  heart: number;
  /** Stored explicitly rather than derived, so stat ties are never ambiguous. */
  card_type: CardType;
  /** Free-form tags driving event/dungeon restrictions and future synergies. */
  tags: string[];
  /** Single keyword, or "" for none. Populated from day one, read from Phase 2. */
  keyword: string;
  /** Deck-budget / dungeon-restriction cost. Populated now, unused in Phase 1. */
  cost: number;
  /** Collection set this card belongs to (e.g. "dragon_balls"), or "". */
  set_piece: string;
  art_url: string;
  /** Flavour text for the card face. Presentation only. */
  flavour?: string;
  /** Artist credit for the card footer. Presentation only. */
  artist?: string;
  /** id of the v1 `card_definition` row this was converted from, or "". */
  legacy_card: string;
  /** Max copies that may exist per server. 0 = unlimited. */
  population: number;
  /** Pulled from packs only while true. Lets you park cards without deleting. */
  active: boolean;
  created?: string;
  updated?: string;
};

/** A copy of a card owned by a user. */
export type V2UserCardRecord = {
  id?: string;
  user_id: string;
  server_id: string;
  identifier: string;
  /** Relation to v2_card_definition. */
  card: string;
  /** Cosmetic axis - can roll on any card at any rarity. Never affects stats. */
  foil: boolean;
  /** How it was obtained: "pack" | "grant" | "convert" | "trade" ... */
  acquired_from: string;
  created?: string;
  updated?: string;
  expand?: {
    card: V2CardDefinitionRecord;
  };
};

export type V2BattleState =
  /** Challenger has picked three cards; waiting on the defender to pick theirs. */
  | "awaiting_defender_selection"
  /** Both sets are revealed; waiting on one or both secret orders. */
  | "awaiting_orders"
  | "resolved"
  | "declined"
  | "expired";

/**
 * A PvP match, run on the Stadium structure:
 *
 *   1. Both players commit an unordered *set* of three cards, blind.
 *   2. Both sets are revealed in full - stats, keywords, everything.
 *   3. Both players secretly commit an *order* for their own three.
 *   4. Resolve.
 *
 * The only hidden information at the point of decision is the ordering, and
 * neither player has an information edge over the other at any stage.
 */
export type V2BattleRecord = {
  id?: string;
  server_id: string;
  channel_id: string;
  challenger_id: string;
  challenger_name: string;
  defender_id: string;
  defender_name: string;
  /** The unordered three cards the challenger brought. */
  challenger_selection: string[];
  /** The unordered three cards the defender brought, empty until they pick. */
  defender_selection: string[];
  /** The challenger's committed order, empty until they submit it. */
  challenger_lineup: string[];
  /** The defender's committed order, empty until they submit it. */
  defender_lineup: string[];
  state: V2BattleState;
  /** Serialised MatchResult, or null while unresolved. */
  result: unknown;
  /** Finicoin staked by each side. 0 for a friendly. */
  wager: number;
  created?: string;
  updated?: string;
};
