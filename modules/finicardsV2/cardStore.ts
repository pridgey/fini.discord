import type {
  CardType,
  V2CardDefinitionRecord,
  V2UserCardRecord,
} from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
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
    counts.set(card.card, (counts.get(card.card) ?? 0) + 1);
  }
  return counts;
};

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
    });

  return owned
    .filter((record) => !!record.expand?.card)
    .map((record) => ({ ...record, definition: record.expand!.card }));
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
  keyword: owned.definition.keyword ?? "",
  foil: !!owned.foil,
  tags: owned.definition.tags ?? [],
  cost: owned.definition.cost ?? 0,
  artUrl: owned.definition.art_url ?? "",
  legacyCard: owned.definition.legacy_card ?? "",
  flavour: owned.definition.flavour ?? "",
  artist: owned.definition.artist ?? "",
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
        .getOne(id, { expand: "card" });
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
  acquiredFrom?: string;
};

export const grantCard = async (
  input: GrantCardInput,
): Promise<V2UserCardRecord> =>
  pb.collection<V2UserCardRecord>(V2_USER_CARD).create({
    user_id: input.userId,
    server_id: input.serverId,
    identifier: input.identifier,
    card: input.definitionId,
    foil: input.foil ?? false,
    acquired_from: input.acquiredFrom ?? "grant",
  });

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
