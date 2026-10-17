import type { CardType } from "../../types/PocketbaseTablesV2";
import { RARITY_LABEL } from "./rules";

/**
 * Filtering and sorting for `/finicard collection`.
 *
 * Pure: the choices a player made in, a Pocketbase filter and sort out. The
 * pages are fetched by the shared pagination system a page at a time, so the
 * narrowing has to be something the database can do - which is why there is
 * no "strongest" order (a card's type stat is a different column on each
 * card) and why rarity is ordered by deck cost, the one number that rises
 * with it.
 */

export type CollectionSort =
  "newest" | "set" | "name" | "rarest" | "power" | "wit" | "heart";

export type CollectionTier =
  "common" | "uncommon" | "full_art" | "secret_art" | "legendary";

export type CollectionOptions = {
  sort?: CollectionSort | null;
  type?: CardType | null;
  tier?: CollectionTier | null;
  set?: number | null;
  foil?: boolean | null;
  keyword?: boolean | null;
  /** Part of a card's name or series. */
  search?: string | null;
};

export const SORT_LABEL: Record<CollectionSort, string> = {
  newest: "Newest first",
  set: "Set number",
  name: "Name",
  rarest: "Rarest first",
  power: "Highest Power",
  wit: "Highest Wit",
  heart: "Highest Heart",
};

/** Each ends on the copy's id, so pages never shuffle between turns. */
const SORTS: Record<CollectionSort, string> = {
  newest: "-created,id",
  set: "card.set,card.number,-foil,id",
  name: "card.card_name,-card.cost,id",
  rarest: "-legendary,-card.secret_art,-card.cost,-foil,card.card_name,id",
  power: "-card.power,card.card_name,id",
  wit: "-card.wit,card.card_name,id",
  heart: "-card.heart,card.card_name,id",
};

export const TIER_LABEL: Record<CollectionTier, string> = {
  ...RARITY_LABEL,
  secret_art: "Secret Art",
  legendary: "Legendary",
};

/** A Legendary and a Secret Art are full-arts underneath; "Full Art" means the plain ones. */
const TIERS: Record<CollectionTier, string> = {
  common: 'card.rarity = "common"',
  uncommon: 'card.rarity = "uncommon"',
  full_art:
    'card.rarity = "full_art" && card.secret_art != true && legendary = ""',
  secret_art: 'card.secret_art = true && legendary = ""',
  legendary: 'legendary != ""',
};

const TYPE_LABEL: Record<CardType, string> = {
  power: "Power",
  wit: "Wit",
  heart: "Heart",
};

const quoted = (value: string): string =>
  `"${value.replace(/["\\]/g, "\\$&")}"`;

export type CollectionQuery = {
  /** Added to the owner's filter with `&&`; "" when nothing narrows it. */
  filter: string;
  sort: string;
  /** What was asked for, for the heading: "Wit · Set 3 · foil". "" for none. */
  summary: string;
  /** The order, for the heading; "" for the default. */
  order: string;
};

export const buildCollectionQuery = (
  options: CollectionOptions = {},
): CollectionQuery => {
  const parts: string[] = [];
  const said: string[] = [];

  if (options.type) {
    parts.push(`card.card_type = ${quoted(options.type)}`);
    said.push(TYPE_LABEL[options.type]);
  }
  if (options.tier) {
    parts.push(`(${TIERS[options.tier]})`);
    said.push(TIER_LABEL[options.tier]);
  }
  if (options.set) {
    parts.push(`card.set = ${Math.trunc(options.set)}`);
    said.push(`Set ${Math.trunc(options.set)}`);
  }
  if (options.foil) {
    parts.push("foil = true");
    said.push("foil");
  }
  if (options.keyword) {
    parts.push('keyword != ""');
    said.push("with an ability");
  }
  const search = (options.search ?? "").trim().slice(0, 60);
  if (search) {
    parts.push(
      `(card.card_name ~ ${quoted(search)} || card.series ~ ${quoted(search)})`,
    );
    said.push(`matching "${search}"`);
  }

  const sort = options.sort ?? "newest";
  return {
    filter: parts.join(" && "),
    sort: SORTS[sort],
    summary: said.join(" · "),
    order: sort === "newest" ? "" : SORT_LABEL[sort].toLowerCase(),
  };
};
