import { createHash } from "crypto";
import type {
  V2CardDefinitionRecord,
  V2DeckRecord,
  V2UserCardRecord,
} from "../../../types/PocketbaseTablesV2";

/**
 * What the web mailbox holds, worked out from what Fini holds.
 *
 * Pure: rows in, rows out. `sync.ts` does the reading and the sending. The
 * mailbox is a copy for the site to show - never read back as truth - so
 * every row here is rebuilt from Fini's own database each time.
 */

export type WebCollection =
  | "web_meta"
  | "web_definition"
  | "web_card"
  | "web_deck"
  | "web_player";

export type WebRow = { id: string } & Record<string, unknown>;

/** The fields Fini owns in each collection - what a row is compared on. */
export const WEB_FIELDS: Record<WebCollection, string[]> = {
  web_meta: ["data"],
  web_definition: [
    "card_name",
    "series",
    "rarity",
    "card_type",
    "power",
    "wit",
    "heart",
    "cost",
    "tags",
    "set",
    "number",
    "set_size",
    "population",
    "secret_art",
    "flavour",
    "artist",
    "focus_x",
    "focus_y",
  ],
  web_card: [
    "owner",
    "server_id",
    "definition",
    "foil",
    "keyword",
    "legendary",
    "serial",
    "acquired_from",
    "acquired",
  ],
  web_deck: ["owner", "server_id", "name", "cards"],
  web_player: ["owner", "server_id", "server_name", "identifier", "cards"],
};

/** JSON with object keys in a fixed order, so equal values read equal. */
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

/** A row boiled down to one string: two rows that match need no sending. */
export const fingerprint = (collection: WebCollection, row: Record<string, unknown>): string =>
  stable(WEB_FIELDS[collection].map((field) => row[field]));

/** Only the fields Fini owns, ready to send. */
export const payloadOf = (collection: WebCollection, row: WebRow): Record<string, unknown> =>
  Object.fromEntries(WEB_FIELDS[collection].map((field) => [field, row[field]]));

export const META_ID = "finicardsmeta00";

/** A Pocketbase id for a player's row on a server: the same every time. */
export const playerRowId = (owner: string, serverId: string): string =>
  createHash("sha1").update(`${owner}:${serverId}`).digest("hex").slice(0, 15);

/**
 * What a card's web artwork was made from. When it changes - new art, or a
 * new crop - the artwork is made and sent again.
 */
export const artKeyOf = (definition: V2CardDefinitionRecord): string => {
  const source =
    definition.art || definition.art_url || (definition.legacy_card ? `legacy:${definition.legacy_card}` : "");
  return source ? `v1|${source}|${stable(definition.art_adjust?.trim ?? null)}` : "";
};

/** Bump to have every card face made again, after the card design changes. */
export const FACE_VERSION = 1;

/**
 * What a copy's card face was rendered from: everything printed on it. When
 * any of it changes - a card renamed, its art replaced, a new set number -
 * the face is made and sent again.
 */
export const faceKeyOf = (card: V2UserCardRecord, definition: V2CardDefinitionRecord): string =>
  createHash("sha1")
    .update(
      stable([
        FACE_VERSION,
        card.id,
        !!card.foil,
        card.keyword ?? "",
        card.legendary ?? "",
        card.serial ?? 0,
        definition.card_name,
        definition.series ?? "",
        definition.rarity,
        definition.card_type,
        [definition.power, definition.wit, definition.heart],
        definition.tags ?? [],
        definition.flavour ?? "",
        definition.artist ?? "",
        [definition.set ?? 0, definition.number ?? 0, definition.set_size ?? 0],
        definition.population ?? 0,
        !!definition.secret_art,
        definition.art || definition.art_url || definition.legacy_card || "",
        definition.art_adjust ?? null,
        // A Legendary's animation is sent with its face.
        ...(card.legendary ? ["animated"] : []),
      ]),
    )
    .digest("hex")
    .slice(0, 20);

export const toWebDefinition = (definition: V2CardDefinitionRecord): WebRow => ({
  id: definition.id ?? "",
  card_name: definition.card_name,
  series: definition.series ?? "",
  rarity: definition.rarity,
  card_type: definition.card_type,
  power: definition.power,
  wit: definition.wit,
  heart: definition.heart,
  cost: definition.cost ?? 0,
  tags: definition.tags ?? [],
  set: definition.set ?? 0,
  number: definition.number ?? 0,
  set_size: definition.set_size ?? 0,
  population: definition.population ?? 0,
  secret_art: !!definition.secret_art,
  flavour: definition.flavour ?? "",
  artist: definition.artist ?? "",
  // No focus given: a little above centre, where a face usually is.
  focus_x: definition.art_adjust?.focus?.x ?? 0.5,
  focus_y: definition.art_adjust?.focus?.y ?? 0.3,
});

export const toWebCard = (card: V2UserCardRecord): WebRow => ({
  id: card.id ?? "",
  owner: card.user_id,
  server_id: card.server_id,
  definition: card.card,
  foil: !!card.foil,
  keyword: card.keyword ?? "",
  legendary: card.legendary ?? "",
  // A Legendary is the only one of its card with its animation on its server.
  serial: card.legendary ? 1 : (card.serial ?? 0),
  acquired_from: card.acquired_from ?? "",
  acquired: card.created ?? "",
});

export const toWebDeck = (deck: V2DeckRecord): WebRow => ({
  id: deck.id ?? "",
  owner: deck.user_id,
  server_id: deck.server_id,
  name: deck.name,
  cards: deck.cards ?? [],
});

export type LocalState = {
  definitions: V2CardDefinitionRecord[];
  cards: V2UserCardRecord[];
  decks: V2DeckRecord[];
  /** Server id to its name, for the site's server switcher. */
  serverNames: Record<string, string>;
  /** The game's own constants, as the site needs them. */
  meta: Record<string, unknown>;
};

export type Snapshot = Record<WebCollection, Map<string, WebRow>>;

const byId = (rows: WebRow[]): Map<string, WebRow> =>
  new Map(rows.filter((row) => row.id).map((row) => [row.id, row]));

/**
 * Everything the mailbox should hold. Only cards somebody owns are sent: a
 * card nobody has pulled - a Secret Art still waiting, one held back for a
 * later release - never leaves Fini.
 */
export const buildSnapshot = (local: LocalState): Snapshot => {
  const known = new Map(local.definitions.map((definition) => [definition.id ?? "", definition]));
  // A copy whose card is gone cannot be shown, and would not be accepted.
  const cards = local.cards.filter((card) => known.has(card.card));
  const owned = new Set(cards.map((card) => card.card));

  const players = new Map<string, WebRow>();
  for (const card of cards) {
    const id = playerRowId(card.user_id, card.server_id);
    const row = players.get(id);
    if (row) {
      row.cards = (row.cards as number) + 1;
      continue;
    }
    players.set(id, {
      id,
      owner: card.user_id,
      server_id: card.server_id,
      server_name: local.serverNames[card.server_id] ?? "",
      identifier: card.identifier ?? "",
      cards: 1,
    });
  }

  return {
    web_meta: byId([{ id: META_ID, data: local.meta }]),
    web_definition: byId(
      local.definitions.filter((definition) => owned.has(definition.id ?? "")).map(toWebDefinition),
    ),
    web_card: byId(cards.map(toWebCard)),
    web_deck: byId(local.decks.map(toWebDeck)),
    web_player: players,
  };
};

export type SyncPlan = { create: WebRow[]; update: WebRow[]; remove: string[] };

/** What to send so the mailbox - known by its fingerprints - matches `wanted`. */
export const planSync = (
  collection: WebCollection,
  wanted: Map<string, WebRow>,
  held: Map<string, string>,
): SyncPlan => {
  const plan: SyncPlan = { create: [], update: [], remove: [] };
  for (const [id, row] of wanted) {
    const current = held.get(id);
    if (current === undefined) plan.create.push(row);
    else if (current !== fingerprint(collection, row)) plan.update.push(row);
  }
  for (const id of held.keys()) if (!wanted.has(id)) plan.remove.push(id);
  return plan;
};
