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

/**
 * Corrections to how a card's artwork is cropped. Fractions throughout, so
 * they hold whatever size the image is rendered at.
 */
export type ArtAdjust = {
  /** Share of the image to cut off each edge - bars baked into the picture. */
  trim?: { left: number; top: number; right: number; bottom: number };
  /** Where the subject is, in the image as it stands after `trim`. */
  focus?: { x: number; y: number };
};

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
  /**
   * Not read. A keyword belongs to a copy (`V2UserCardRecord.keyword`), rolled
   * when the copy is made; this column is what is left of the first design,
   * where it was fixed per card.
   */
  keyword: string;
  /** Deck-budget / dungeon-restriction cost. Populated now, unused in Phase 1. */
  cost: number;
  /** Collection set this card belongs to (e.g. "dragon_balls"), or "". */
  set_piece: string;
  /** Release set (1, 2, 3...), printed on the card as `S3`. 0 or absent = unset. */
  set?: number;
  /** Place in the release set, from 1. 0 or absent = not numbered. See `setNumbers.ts`. */
  number?: number;
  /** How many cards the release set counts, Secret Arts aside. */
  set_size?: number;
  /** Crop corrections for the artwork, or null/absent for none. */
  art_adjust?: ArtAdjust | null;
  art_url: string;
  /** The card's own artwork file, if it has one. Wins over everything else. */
  art?: string;
  /** Flavour text for the card face. Presentation only. */
  flavour?: string;
  /** Artist credit for the card footer. Presentation only. */
  artist?: string;
  /** id of the v1 `card_definition` row this was converted from, or "". */
  legacy_card: string;
  /** Max copies that may exist per server. 0 = unlimited. */
  population: number;
  /**
   * A Secret Art: a full-art by every rule (`rarity` is "full_art"), with its
   * own unique artwork. Pulled on its own chance per pack, never from the
   * full-art slot, and printed `SA`.
   */
  secret_art?: boolean;
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
  /**
   * This copy's keyword slug, or "" for none. Rolled at its rarity's odds when
   * the copy is made, so two copies of one card can differ.
   */
  keyword?: string;
  /**
   * The Legendary effect this copy carries (a slug from `LEGENDARY_EFFECTS`),
   * or "" for an ordinary copy. Rolled when the copy is made.
   */
  legendary?: string;
  /**
   * This copy's number among the copies of its card on its server, from 1,
   * given when the copy is made. Printed on cards limited to a few copies.
   */
  serial?: number;
  /** How it was obtained: "pack" | "grant" | "convert" | "trade" ... */
  acquired_from: string;
  created?: string;
  updated?: string;
  expand?: {
    card: V2CardDefinitionRecord;
  };
};

/**
 * A named deck. Decks are both what a battle draws from and a way of organising
 * a collection, so they may overlap freely - the same copy can sit in several.
 */
export type V2DeckRecord = {
  id?: string;
  user_id: string;
  server_id: string;
  identifier: string;
  name: string;
  /** Ordered list of v2_user_card ids. */
  cards: string[];
  /** Brought when no deck is named. At most one per player per server. */
  active?: boolean;
  created?: string;
  updated?: string;
};

export type V2BattleState =
  /** Waiting on the defender to accept and choose a deck. */
  | "awaiting_defender"
  /** Both hands are dealt and revealed; waiting on one or both lineups. */
  | "awaiting_lineups"
  | "resolved"
  | "declined"
  | "expired";

/**
 * A PvP match, run on the Stadium structure:
 *
 *   1. Challenger picks a deck. Five cards are dealt from it, face down.
 *   2. Defender accepts with a deck of their own and is dealt five.
 *   3. Both hands are revealed in full - stats, keywords, everything.
 *   4. Each player privately picks three of their five, in slot order.
 *   5. Resolve.
 *
 * Neither player sees their own hand until both are dealt, which is what stops
 * a challenger cancelling and re-issuing until they like their draw. From the
 * reveal on, the only hidden information is which three each side will play and
 * in what order.
 */
export type V2BattleRecord = {
  id?: string;
  server_id: string;
  channel_id: string;
  challenger_id: string;
  challenger_name: string;
  defender_id: string;
  defender_name: string;
  /** The five cards dealt to the challenger. */
  challenger_hand: string[];
  /** The five dealt to the defender, empty until they accept. */
  defender_hand: string[];
  /** v2_deck id each side brought. */
  challenger_deck: string;
  defender_deck: string;
  /**
   * How many cards this battle deals each side.
   *
   * Stored per battle rather than read from a constant: the two hands are dealt
   * at different times and validated later still, so they all have to agree on
   * the number the battle was created with.
   */
  hand_size: number;
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

export type V2DungeonRunState =
  /** The player is somewhere in the dungeon. */
  | "active"
  /** Stopped by a lost fight. Keeps a share of its geld. */
  | "failed"
  /** The player walked out with everything they had earned. */
  | "retreated"
  /** Legacy: a full clear of the fixed five-room dungeon. Never written now. */
  | "cleared";

/**
 * One player's run through a dungeon.
 *
 * Unlike a battle's lineup pick, progress lives in the row rather than in button
 * ids: a card on cooldown and a purse of geld are worth something, so the
 * server has to be the one keeping count.
 */
export type V2DungeonRunRecord = {
  id?: string;
  user_id: string;
  server_id: string;
  channel_id: string;
  player_name: string;
  /** v2_deck id the hand was dealt from. */
  deck: string;
  /** v2_user_card ids dealt for the run. */
  hand: string[];
  /**
   * Serialised `DungeonState`: the current room, the doors on offer, geld,
   * cooldowns, buffs and keyword state. Rooms are snapshotted here, so a pool
   * re-import mid-run cannot change a room the player has already read.
   */
  progress: unknown;
  state: V2DungeonRunState;
  /** Finicoin paid to enter. Stored so a fee change never rewrites history. */
  entry_fee: number;
  /** Serialised `DungeonReward`, or null until the run ends. */
  reward: unknown;
  /**
   * The run's numbers, written once when it is settled, for looking back on
   * (`dungeonStats.ts`). Absent on a run still in flight.
   */
  depth?: number;
  fights_won?: number;
  bosses_won?: number;
  geld_earned?: number;
  coin_paid?: number;
  cards_won?: number;
  /** When the run was settled. */
  ended?: string;
  created?: string;
  updated?: string;
};

/** What a free pack is certain to hold beyond its ordinary rolls. */
export type FreePackSpecial = "" | "secret_art" | "legendary";

/** A booster a player is owed without paying. See `modules/finicards/freePacks.ts`. */
export type V2FreePackRecord = {
  id?: string;
  user_id: string;
  server_id: string;
  identifier: string;
  special: FreePackSpecial;
  /** Why it was given: "items" for the launch compensation. */
  reason: string;
  opened: boolean;
  created?: string;
  updated?: string;
};
