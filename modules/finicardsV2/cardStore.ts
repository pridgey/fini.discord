import type {
  CardRarity,
  CardType,
  V2CardDefinitionRecord,
  V2UserCardRecord,
} from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
import { rollKeyword } from "./keywords";
import { RULES } from "./rules";
import { numberSets } from "./setNumbers";
import type { BattleCard, OwnedCard } from "./types";

/**
 * All Pocketbase access for v2 cards. The v1 collections (`card_definition`,
 * `user_card`) are never touched from this module - v2 lives entirely in the
 * `v2_*` collections so both implementations can run at once.
 */

export const V2_CARD_DEFINITION = "v2_card_definition";
export const V2_USER_CARD = "v2_user_card";
export const V2_BATTLE = "v2_battle";

/** Escapes a value for a Pocketbase filter string. */
const filterSafe = (value: string): string =>
  (value ?? "").replace(/["\\]/g, "\\$&");

export const getCardDefinitions = async (options?: {
  includeInactive?: boolean;
}): Promise<V2CardDefinitionRecord[]> =>
  pb.collection<V2CardDefinitionRecord>(V2_CARD_DEFINITION).getFullList({
    filter: options?.includeInactive ? "" : "active = true",
    sort: "rarity,card_name",
  });

/**
 * Writes every card's place in its set (`setNumbers.ts`), touching only the
 * rows whose number or set size is out of date. Run after anything that moves
 * a card: one made, removed, renamed, or changed in rarity or set.
 *
 * `ready` is false when the columns are not there yet - the migration that
 * adds them has not been applied - and nothing is written.
 */
export const renumberSets = async (): Promise<{
  ready: boolean;
  changed: number;
  sets: Map<number, number>;
}> => {
  const definitions = await getCardDefinitions({ includeInactive: true });
  const sets = new Map<number, number>();
  if (definitions.length > 0 && !("number" in definitions[0])) {
    return { ready: false, changed: 0, sets };
  }

  const numbers = numberSets(definitions);
  let changed = 0;
  for (const definition of definitions) {
    const place = numbers.get(definition.id ?? "") ?? { number: 0, setSize: 0 };
    if (definition.set) sets.set(definition.set, place.setSize);
    if (
      (definition.number ?? 0) === place.number &&
      (definition.set_size ?? 0) === place.setSize
    ) {
      continue;
    }
    await pb
      .collection<V2CardDefinitionRecord>(V2_CARD_DEFINITION)
      .update(definition.id ?? "", { number: place.number, set_size: place.setSize });
    changed += 1;
  }

  return { ready: true, changed, sets };
};

export const getCardDefinition = async (
  id: string,
): Promise<V2CardDefinitionRecord | null> => {
  try {
    return await pb
      .collection<V2CardDefinitionRecord>(V2_CARD_DEFINITION)
      .getOne(id);
  } catch {
    return null;
  }
};

/** Copies of each definition already claimed on a server, keyed by definition id. */
export const getPopulationCounts = async (
  serverId: string,
): Promise<Map<string, number>> => {
  const owned = await pb
    .collection<V2UserCardRecord>(V2_USER_CARD)
    .getFullList({ filter: `server_id = "${filterSafe(serverId)}"` });

  const counts = new Map<string, number>();
  for (const card of owned) {
    // A Legendary has a population of its own, beside its card's.
    if (card.legendary) continue;
    counts.set(card.card, (counts.get(card.card) ?? 0) + 1);
  }
  return counts;
};

/** The cards a player holds at least one copy of on a server, by definition id. */
export const ownedDefinitionIds = async (userId: string, serverId: string): Promise<Set<string>> => {
  const owned = await pb.collection<V2UserCardRecord>(V2_USER_CARD).getFullList({
    filter: `user_id = "${filterSafe(userId)}" && server_id = "${filterSafe(serverId)}"`,
    fields: "card",
    requestKey: null,
  });
  return new Set(owned.map((copy) => copy.card));
};

/**
 * The Legendaries already pulled on a server, as "<definition id>:<effect>":
 * each card has one Legendary per animation there.
 */
export const getLegendaryHolders = async (serverId: string): Promise<Set<string>> => {
  const owned = await pb.collection<V2UserCardRecord>(V2_USER_CARD).getFullList({
    filter: `server_id = "${filterSafe(serverId)}" && legendary != ""`,
    fields: "card,legendary",
    requestKey: null,
  });
  return new Set(owned.map((card) => legendaryKey(card.card, card.legendary ?? "")));
};

export const legendaryKey = (definitionId: string, effect: string) => `${definitionId}:${effect}`;

/** A user's v2 cards, each already joined to its definition. */
export const getUserCollection = async (
  userId: string,
  serverId: string,
): Promise<OwnedCard[]> => {
  const owned = await pb
    .collection<V2UserCardRecord>(V2_USER_CARD)
    .getFullList({
      filter: `user_id = "${filterSafe(userId)}" && server_id = "${filterSafe(serverId)}"`,
      sort: "-created",
      expand: "card",
      // Practice loads two decks at once; the SDK would auto-cancel the first.
      requestKey: null,
    });

  return owned
    .filter((record) => !!record.expand?.card)
    .map((record) => ({ ...record, definition: record.expand!.card }));
};

/**
 * One owned card by its exact id, joined to its definition.
 *
 * Unlike {@link resolveLineup} this does no ownership check, because the caller
 * that needs it - the collection's View button - may be looking at someone
 * else's collection. Nothing here is secret; the whole page is already on
 * screen.
 * @param id A `v2_user_card` id
 * @returns The card, or null if it no longer exists or lost its definition
 */
export const getOwnedCard = async (
  id: string,
): Promise<OwnedCard | null> => {
  try {
    const record = await pb
      .collection<V2UserCardRecord>(V2_USER_CARD)
      .getOne(id, { expand: "card" });

    return record.expand?.card
      ? { ...record, definition: record.expand.card }
      : null;
  } catch {
    // Sold, traded away, or the id was never real.
    return null;
  }
};

/** Flattens an owned card into the shape the battle engine consumes. */
export const toBattleCard = (owned: OwnedCard): BattleCard => ({
  instanceId: owned.id ?? "",
  definitionId: owned.definition.id ?? "",
  name: owned.definition.card_name,
  series: owned.definition.series,
  rarity: owned.definition.rarity,
  type: owned.definition.card_type,
  stats: {
    power: owned.definition.power,
    wit: owned.definition.wit,
    heart: owned.definition.heart,
  },
  // The copy's, not the definition's: keywords are rolled per copy.
  keyword: owned.keyword ?? "",
  foil: !!owned.foil,
  tags: owned.definition.tags ?? [],
  cost: owned.definition.cost ?? 0,
  // A card's own artwork file wins over a linked image.
  artUrl: owned.definition.art
    ? pb.files.getURL(owned.definition, owned.definition.art)
    : (owned.definition.art_url ?? ""),
  legacyCard: owned.definition.legacy_card ?? "",
  flavour: owned.definition.flavour ?? "",
  artist: owned.definition.artist ?? "",
  legendary: owned.legendary ?? "",
  secretArt: !!owned.definition.secret_art,
  // A Legendary is the only one of its card with its animation on its server.
  population: owned.legendary ? 1 : (owned.definition.population ?? 0),
  serial: owned.legendary ? 1 : (owned.serial ?? 0),
  set: owned.definition.set ?? 0,
  number: owned.definition.number ?? 0,
  setSize: owned.definition.set_size ?? 0,
  artAdjust: owned.definition.art_adjust ?? null,
});

export type LineupResolution = {
  cards: BattleCard[];
  errors: string[];
};

/**
 * Turns three user-supplied card ids into a lineup, in the order given.
 *
 * Accepts a full `v2_user_card` id or any unambiguous prefix of one, which is
 * what makes typing a lineup into a Discord modal bearable. Rejects duplicates -
 * you may own two copies of a card and play both, but not the same copy twice.
 */
export const resolveLineup = async (
  userId: string,
  serverId: string,
  rawIds: string[],
  expectedLength: number,
): Promise<LineupResolution> => {
  const errors: string[] = [];
  const collection = await getUserCollection(userId, serverId);
  const wanted = rawIds.map((id) => (id ?? "").trim()).filter(Boolean);

  if (wanted.length !== expectedLength) {
    errors.push(
      `A lineup needs exactly ${expectedLength} cards (got ${wanted.length}).`,
    );
  }

  const cards: BattleCard[] = [];
  const used = new Set<string>();

  for (const [index, raw] of wanted.entries()) {
    const needle = raw.toLowerCase();
    const matches = collection.filter(
      (owned) =>
        (owned.id ?? "").toLowerCase() === needle ||
        (owned.id ?? "").toLowerCase().startsWith(needle),
    );

    if (matches.length === 0) {
      errors.push(`Slot ${index + 1}: no card of yours matches \`${raw}\`.`);
      continue;
    }
    if (matches.length > 1 && !matches.some((m) => m.id === raw)) {
      errors.push(
        `Slot ${index + 1}: \`${raw}\` matches ${matches.length} of your cards - use more characters.`,
      );
      continue;
    }

    const match = matches.find((m) => m.id === raw) ?? matches[0];
    if (used.has(match.id ?? "")) {
      errors.push(
        `Slot ${index + 1}: ${match.definition.card_name} is already in the lineup.`,
      );
      continue;
    }

    used.add(match.id ?? "");
    cards.push(toBattleCard(match));
  }

  return { cards, errors };
};

/** Re-hydrates a stored lineup (an array of user-card ids) for replay. */
export const loadLineupByIds = async (
  ids: string[],
): Promise<BattleCard[]> => {
  const cards: BattleCard[] = [];

  for (const id of ids) {
    try {
      const record = await pb
        .collection<V2UserCardRecord>(V2_USER_CARD)
        // Both hands load at once and, in practice, may share a copy.
        .getOne(id, { expand: "card", requestKey: null });
      if (!record.expand?.card) continue;
      cards.push(toBattleCard({ ...record, definition: record.expand.card }));
    } catch {
      // A card sold or deleted between submission and resolution just drops out;
      // the caller checks lineup length before resolving.
    }
  }

  return cards;
};

export type GrantCardInput = {
  userId: string;
  serverId: string;
  identifier: string;
  definitionId: string;
  foil?: boolean;
  /** The copy's keyword slug. Roll one with `rollCopyKeyword`. */
  keyword?: string;
  /** The Legendary effect the copy carries, for a Legendary. */
  legendary?: string;
  acquiredFrom?: string;
};

/**
 * Rolls the keyword for a new copy of a card of `rarity`, at that rarity's
 * odds. "" when the roll comes up empty, or while keywords are switched off.
 */
export const rollCopyKeyword = (
  rarity: CardRarity,
  random: () => number = Math.random,
): string => (RULES.keywordsEnabled ? rollKeyword(rarity, random(), random()) : "");

/**
 * The number a new copy of a card takes on a server: the lowest not in use.
 * Lowest rather than next, so a copy made after another was sold or deleted
 * fills the gap - a card limited to three never prints "4 OF 3".
 */
export const nextSerial = (taken: Iterable<number | undefined>): number => {
  const used = new Set([...taken].filter((serial) => !!serial && serial > 0));
  let serial = 1;
  while (used.has(serial)) serial += 1;
  return serial;
};

export const grantCard = async (
  input: GrantCardInput,
): Promise<V2UserCardRecord> => {
  const siblings = await pb.collection<V2UserCardRecord>(V2_USER_CARD).getFullList({
    filter: `server_id = "${filterSafe(input.serverId)}" && card = "${filterSafe(input.definitionId)}"`,
    fields: "serial,legendary",
    requestKey: null,
  });

  return pb.collection<V2UserCardRecord>(V2_USER_CARD).create({
    user_id: input.userId,
    server_id: input.serverId,
    identifier: input.identifier,
    card: input.definitionId,
    foil: input.foil ?? false,
    keyword: input.keyword ?? "",
    legendary: input.legendary ?? "",
    // Legendaries are numbered apart from their card's ordinary copies.
    serial: input.legendary
      ? 1
      : nextSerial(siblings.filter((copy) => !copy.legendary).map((copy) => copy.serial)),
    acquired_from: input.acquiredFrom ?? "grant",
  });
};

export const transferCard = async (
  userCardId: string,
  toUserId: string,
  identifier: string,
): Promise<void> => {
  await pb.collection<V2UserCardRecord>(V2_USER_CARD).update(userCardId, {
    user_id: toUserId,
    identifier,
  });
};

export type ImportSummary = {
  created: number;
  updated: number;
  unchanged: number;
  dryRun: boolean;
};

/**
 * Upserts converted rows, keyed on `legacy_card` so re-running after a mapping
 * change updates in place instead of duplicating the pool.
 */
export const importCardDefinitions = async (
  rows: V2CardDefinitionRecord[],
  options?: { dryRun?: boolean },
): Promise<ImportSummary> => {
  const dryRun = options?.dryRun ?? false;
  const existing = await getCardDefinitions({ includeInactive: true });
  const byLegacyId = new Map(
    existing.filter((row) => row.legacy_card).map((row) => [row.legacy_card, row]),
  );

  const summary: ImportSummary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    dryRun,
  };

  const comparable = (row: V2CardDefinitionRecord) =>
    JSON.stringify({
      card_name: row.card_name,
      series: row.series,
      rarity: row.rarity,
      power: row.power,
      wit: row.wit,
      heart: row.heart,
      card_type: row.card_type,
      tags: [...(row.tags ?? [])].sort(),
      keyword: row.keyword ?? "",
      cost: row.cost,
      population: row.population,
      set: row.set ?? 0,
    });

  for (const row of rows) {
    const match = row.legacy_card ? byLegacyId.get(row.legacy_card) : undefined;

    if (!match) {
      summary.created += 1;
      if (!dryRun) {
        await pb
          .collection<V2CardDefinitionRecord>(V2_CARD_DEFINITION)
          .create(row);
      }
      continue;
    }

    if (comparable(match) === comparable(row)) {
      summary.unchanged += 1;
      continue;
    }

    summary.updated += 1;
    if (!dryRun) {
      await pb
        .collection<V2CardDefinitionRecord>(V2_CARD_DEFINITION)
        .update(match.id!, row);
    }
  }

  return summary;
};

/**
 * The type breakdown of a whole collection. Shown to a challenger before they
 * commit a lineup - it tells them what the defender *could* field without
 * telling them what the defender *will* field.
 */
export const collectionComposition = (
  cards: OwnedCard[],
): Record<CardType, number> => {
  const composition: Record<CardType, number> = { power: 0, wit: 0, heart: 0 };
  for (const card of cards) composition[card.definition.card_type] += 1;
  return composition;
};
