import type { V2ItemRecord } from "../../types/PocketbaseTablesV2";
import {
  COLLECTIONS,
  ITEMS,
  KIND_LABEL,
  itemByKey,
  piecesOf,
  setProgress,
  type CollectionKey,
  type ItemDefinition,
  type SwitchedKind,
} from "./items";

/**
 * Using an item from the satchel: what it means (issue #8). Pure - the command
 * does the writing, the summoning and the talking.
 *
 *   - a pack boon is switched on, and the player's next pack spends it
 *   - a dungeon boon is switched on, and their next run starts with it
 *   - a dungeon key is switched on beside it, and makes that run free
 *   - a card boon is used on one of their cards, named in a form
 *   - a mystery box opens into another item
 *   - a collection set, once complete, summons its card - one per server
 *
 * One of each switched-on kind at a time, so a second waits its turn.
 */

const SUMMON = "summon:";

export type UseOption = {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
};

/**
 * The satchel's dropdown: a set the player can summon first, then each item
 * they hold that can be used - not a boon whose every copy is already on, and
 * not a set still missing pieces. Discord takes at most 25.
 */
export const useOptions = (
  items: V2ItemRecord[],
  holders: Partial<Record<CollectionKey, string>>,
): UseOption[] => {
  const held = items.map((item) => item.item);
  const summonable: UseOption[] = Object.values(COLLECTIONS).flatMap((set) =>
    setProgress(set.key, held).complete && !holders[set.key]
      ? [
          {
            label: `Summon ${set.summons}`,
            value: `${SUMMON}${set.key}`,
            description: `Spends one of each of the ${set.name}`,
            emoji: "✨",
          },
        ]
      : [],
  );

  const usable = ITEMS.filter((item) => item.kind !== "piece").flatMap(
    (item) => {
      const rows = items.filter((row) => row.item === item.key);
      const spare = rows.filter((row) => !row.active).length;
      if (spare === 0) return [];
      return [
        {
          label: `${item.name}${spare > 1 ? ` ×${spare}` : ""}`,
          value: item.key,
          description: KIND_LABEL[item.kind].replace(/^./, (c) => c.toUpperCase()),
          emoji: item.emoji,
        },
      ];
    },
  );

  return [...summonable, ...usable].slice(0, 25);
};

export type UseOutcome =
  /** Nothing to do but say why. */
  | { kind: "say"; text: string }
  /** Switch this boon on. */
  | { kind: "activate"; row: V2ItemRecord; text: string }
  /** Summon this set's card, spending one of each piece. */
  | { kind: "summon"; set: CollectionKey; rows: V2ItemRecord[] }
  /** Use this card boon on the copy named in `card`. */
  | { kind: "card"; row: V2ItemRecord; item: ItemDefinition }
  /** Open this mystery box. */
  | { kind: "open"; row: V2ItemRecord; item: ItemDefinition };

/** What a switched-on kind waits for, and what it does when it gets there. */
const NEXT: Record<SwitchedKind, { waits: string; does: string }> = {
  pack_boon: { waits: "pack", does: "your next pack spends it." },
  dungeon_boon: {
    waits: "dungeon run",
    does: "your next dungeon run starts with it.",
  },
  dungeon_key: {
    waits: "dungeon run",
    does: "your next dungeon run is free to enter.",
  },
};

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
  if (item.kind === "card_boon") return { kind: "card", row: rows[0], item };
  if (item.kind === "box") return { kind: "open", row: rows[0], item };

  const kind = item.kind as SwitchedKind;
  const { waits, does } = NEXT[kind];
  const on = items.find((row) => row.active && row.kind === kind);
  if (on) {
    const onName = itemByKey(on.item)?.name ?? on.item;
    return {
      kind: "say",
      text:
        on.item === item.key
          ? `${item.emoji} **${item.name}** is already on: ${does}`
          : `**${onName}** is already waiting for your next ${waits}. One ${KIND_LABEL[kind]} at a time - spend it first.`,
    };
  }
  const row = rows.find((each) => !each.active)!;
  return {
    kind: "activate",
    row,
    text: `${item.emoji} **${item.name}** is on: ${does}\n-# ${item.blurb}`,
  };
};
