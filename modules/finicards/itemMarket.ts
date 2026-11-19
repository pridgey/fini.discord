import type { V2ItemRecord } from "../../types/PocketbaseTablesV2";
import { ITEMS, itemByKey, type ItemDefinition, type ItemTier } from "./items";

/**
 * Dungeon items in `/finicard sell` and `/finicard trade` (issue #8). Pure:
 * finding an item by what a player typed, suggesting one as they type,
 * picking which of their copies goes, and what Fini pays.
 *
 * Items have ids like cards, but nobody knows them - so they're named, and
 * the commands suggest names from the right satchel as the player types.
 */

/** What Fini pays for an item, by kind and tier. A piece sold is free to drop again. */
export const ITEM_BUYBACK: Record<"piece" | "boon", Record<ItemTier, number>> = {
  piece: { 1: 10, 2: 20, 3: 40 },
  boon: { 1: 5, 2: 10, 3: 20 },
};

export const itemBuybackPrice = (item: ItemDefinition): number =>
  ITEM_BUYBACK[item.kind === "piece" ? "piece" : "boon"][item.tier];

/** "🟠 **4-Star Dragon Ball**" */
export const itemTitle = (item: ItemDefinition): string =>
  `${item.emoji} **${item.name}**`;

/**
 * An item by its key, its name, or - when only one item has it - its short
 * name ("4★" is a Dragon Ball; "Head" is Exodia's).
 */
export const findItem = (typed: string): ItemDefinition | undefined => {
  const value = typed.trim().toLowerCase();
  if (!value) return undefined;
  const byKey = itemByKey(value);
  if (byKey) return byKey;
  const byName = ITEMS.find((item) => item.name.toLowerCase() === value);
  if (byName) return byName;
  const byShort = ITEMS.filter((item) => item.short?.toLowerCase() === value);
  return byShort.length === 1 ? byShort[0] : undefined;
};

/** Item names as typed into a list: split on commas, blanks dropped. */
export const parseItemList = (typed: string | null | undefined): string[] =>
  (typed ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Which of a player's rows go for each named item: a boon that's switched on
 * goes last, and one row is never picked twice. The names it couldn't fill
 * come back too.
 */
export const pickRows = (
  rows: V2ItemRecord[],
  names: string[],
): { rows: V2ItemRecord[]; missing: string[] } => {
  const picked: V2ItemRecord[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const item = findItem(name);
    const row = item
      ? [...rows]
          .sort((a, b) => Number(!!a.active) - Number(!!b.active))
          .find((each) => each.item === item.key && !picked.includes(each))
      : undefined;
    if (row) picked.push(row);
    else missing.push(name);
  }
  return { rows: picked, missing };
};

/**
 * Suggestions for an item option, from `rows` - the player's own satchel, or
 * their trading partner's. In a list (`multi`), what's before the last comma
 * is kept and only the last name is completed, so several can be picked one
 * after another. Discord takes 25, each up to 100 characters.
 */
export const itemSuggestions = (
  rows: V2ItemRecord[],
  typed: string,
  multi = false,
): { name: string; value: string }[] => {
  const parts = multi ? typed.split(",") : [typed];
  const last = (parts.pop() ?? "").trim().toLowerCase();
  const before = parts.map((part) => part.trim()).filter(Boolean);
  const prefix = before.length ? `${before.join(", ")}, ` : "";

  return ITEMS.flatMap((item) => {
    const count = rows.filter((row) => row.item === item.key).length;
    // Already in the list, as many times as they're held.
    const listed = before.filter((name) => findItem(name)?.key === item.key)
      .length;
    if (count - listed <= 0) return [];
    if (last && !item.name.toLowerCase().includes(last)) return [];
    const value = `${prefix}${item.name}`;
    if (value.length > 100) return [];
    const label = `${item.emoji} ${item.name}${count > 1 ? ` ×${count}` : ""}`;
    return [
      {
        name: (multi && prefix ? `${prefix}${label}` : label).slice(0, 100),
        value,
      },
    ];
  }).slice(0, 25);
};
