import type { V2ItemRecord } from "../../types/PocketbaseTablesV2";
import {
  COLLECTIONS,
  ITEMS,
  itemByKey,
  piecesOf,
  setProgress,
  type CollectionKey,
} from "./items";

/**
 * `/finicard use`: what using an item means (issue #8). Pure - the command
 * does the writing, the summoning and the talking.
 *
 *   - a pack boon is switched on, and the player's next pack spends it
 *   - a dungeon boon is switched on, and their next run starts with it
 *   - a collection set, once complete, summons its card - one per server
 *
 * One boon of each kind can be on at a time, so a second waits its turn.
 */

const SUMMON = "summon:";

export type UseChoice = { name: string; value: string };

/**
 * The suggestions as a player types: a set they can summon first, then their
 * boons (with how many, and which is already on), then their sets in
 * progress. Discord takes at most 25.
 */
export const useChoices = (
  items: V2ItemRecord[],
  holders: Partial<Record<CollectionKey, string>>,
  typed: string,
): UseChoice[] => {
  const held = items.map((item) => item.item);
  const summonable: UseChoice[] = [];
  const inProgress: UseChoice[] = [];

  for (const set of Object.values(COLLECTIONS)) {
    const { have, complete } = setProgress(set.key, held);
    if (have.length === 0) continue;
    if (complete && !holders[set.key]) {
      summonable.push({
        name: `✨ Summon ${set.summons} - every one of the ${set.name}`,
        value: `${SUMMON}${set.key}`,
      });
    } else {
      inProgress.push({
        name: `${set.emoji} ${set.name}: ${have.length} of ${piecesOf(set.key).length}`,
        value: `${SUMMON}${set.key}`,
      });
    }
  }

  const boons = ITEMS.filter((item) => item.kind !== "piece").flatMap(
    (item) => {
      const rows = items.filter((row) => row.item === item.key);
      if (rows.length === 0) return [];
      const on = rows.some((row) => row.active);
      return [
        {
          name: `${item.emoji} ${item.name}${rows.length > 1 ? ` ×${rows.length}` : ""} · ${item.kind === "pack_boon" ? "pack boon" : "dungeon boon"}${on ? " (on)" : ""}`,
          value: item.key,
        },
      ];
    },
  );

  const needle = typed.trim().toLowerCase();
  return [...summonable, ...boons, ...inProgress]
    .filter((choice) => !needle || choice.name.toLowerCase().includes(needle))
    .slice(0, 25);
};

export type UseOutcome =
  /** Nothing to do but say why. */
  | { kind: "say"; text: string }
  /** Switch this boon on. */
  | { kind: "activate"; row: V2ItemRecord; text: string }
  /** Summon this set's card, spending one of each piece. */
  | { kind: "summon"; set: CollectionKey; rows: V2ItemRecord[] };

/** An item by its key, a set by `summon:<set>`, or either by what it's called. */
const resolve = (
  typed: string,
): { set: CollectionKey } | { key: string } | null => {
  const value = typed.trim().toLowerCase();
  if (value.startsWith(SUMMON) && value.slice(SUMMON.length) in COLLECTIONS)
    return { set: value.slice(SUMMON.length) as CollectionKey };
  const item =
    itemByKey(value) ??
    ITEMS.find((each) => each.name.toLowerCase() === value);
  if (item?.set) return { set: item.set };
  if (item) return { key: item.key };
  const set = Object.values(COLLECTIONS).find(
    (each) =>
      each.name.toLowerCase() === value ||
      each.summons.toLowerCase() === value,
  );
  return set ? { set: set.key } : null;
};

export const planUse = (
  typed: string,
  items: V2ItemRecord[],
  holders: Partial<Record<CollectionKey, string>>,
): UseOutcome => {
  const target = resolve(typed);
  if (!target) {
    return {
      kind: "say",
      text: `There's no item called **${typed.trim()}**. Pick one from the list as you type, or see \`/finicard items\`.`,
    };
  }

  if ("set" in target) {
    const set = COLLECTIONS[target.set];
    const holder = holders[target.set];
    if (holder) {
      return {
        kind: "say",
        text: `${set.emoji} **${set.summons}** has already been summoned on this server, by <@${holder}>. There's one per server, so these pieces are keepsakes now.`,
      };
    }
    const { have, missing, complete } = setProgress(
      target.set,
      items.map((item) => item.item),
    );
    if (!complete) {
      return {
        kind: "say",
        text: `${set.emoji} You hold ${have.length} of the ${piecesOf(target.set).length} ${set.name}. Still missing: ${missing.map((piece) => piece.short).join(", ")}.`,
      };
    }
    const rows = piecesOf(target.set).map(
      (piece) => items.find((row) => row.item === piece.key)!,
    );
    return { kind: "summon", set: target.set, rows };
  }

  const item = itemByKey(target.key)!;
  const rows = items.filter((row) => row.item === item.key);
  if (rows.length === 0) {
    return { kind: "say", text: `You don't have a **${item.name}**.` };
  }
  const kind = item.kind as "pack_boon" | "dungeon_boon";
  const next = kind === "pack_boon" ? "pack" : "dungeon run";
  const on = items.find((row) => row.active && row.kind === kind);
  if (on) {
    const onName = itemByKey(on.item)?.name ?? on.item;
    return {
      kind: "say",
      text:
        on.item === item.key
          ? `${item.emoji} **${item.name}** is already on: your next ${next} spends it.`
          : `**${onName}** is already waiting for your next ${next}. One boon at a time - spend it first.`,
    };
  }
  const row = rows.find((each) => !each.active)!;
  return {
    kind: "activate",
    row,
    text: `${item.emoji} **${item.name}** is on: ${
      kind === "pack_boon"
        ? "your next pack spends it."
        : "your next dungeon run starts with it."
    }\n-# ${item.blurb}`,
  };
};
