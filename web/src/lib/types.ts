/** What the site reads from the mailbox. Mirrors `web/pocketbase/pb_migrations`. */

export type CardType = "power" | "wit" | "heart";
export type CardRarity = "common" | "uncommon" | "full_art";

export const TYPES: CardType[] = ["power", "wit", "heart"];

export type Definition = {
  id: string;
  collectionId: string;
  card_name: string;
  series: string;
  rarity: CardRarity;
  card_type: CardType;
  power: number;
  wit: number;
  heart: number;
  cost: number;
  tags: string[] | null;
  set: number;
  number: number;
  set_size: number;
  population: number;
  secret_art: boolean;
  flavour: string;
  artist: string;
  focus_x: number;
  focus_y: number;
  art: string;
};

export type CardRow = {
  id: string;
  collectionId: string;
  /** The card as Discord shows it, rendered by Fini. Empty until it arrives. */
  face: string;
  /** A Legendary's animation, as Discord plays it. Empty for any other copy. */
  animation: string;
  owner: string;
  server_id: string;
  definition: string;
  foil: boolean;
  keyword: string;
  legendary: string;
  serial: number;
  acquired_from: string;
  acquired: string;
};

/** An owned copy joined to the card it is a copy of. */
export type Card = CardRow & { def: Definition };

export type Deck = {
  id: string;
  owner: string;
  server_id: string;
  name: string;
  cards: string[] | null;
  updated: string;
};

export type Player = {
  id: string;
  owner: string;
  server_id: string;
  server_name: string;
  identifier: string;
  cards: number;
};

export type Meta = {
  limits: { deckSize: number; maxDecks: number; maxDeckName: number };
  rules: { statTotal: number; typeBeats: Record<CardType, CardType> };
  keywords: Record<string, { name: string; grade: string; description: string }>;
  legendary: Record<string, { tier: number; blurb: string }>;
};

/** Used until Fini's own copy arrives, and if it never does. */
export const DEFAULT_META: Meta = {
  limits: { deckSize: 20, maxDecks: 10, maxDeckName: 32 },
  rules: { statTotal: 15, typeBeats: { power: "wit", wit: "heart", heart: "power" } },
  keywords: {},
  legendary: {},
};

export type RequestRow = {
  id: string;
  status: "pending" | "applied" | "rejected";
  message: string;
  deck: string;
};
