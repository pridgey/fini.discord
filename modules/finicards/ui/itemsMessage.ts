import { ContainerBuilder, MessageFlags } from "discord.js";
import {
  COLLECTIONS,
  ITEMS,
  itemByKey,
  setProgress,
  type CollectionKey,
  type ItemKind,
} from "../items";

/**
 * `/finicard items`: a player's satchel. Each collection set with how far
 * they've got - pieces held, duplicates, what's missing - then their boons,
 * counted. Every set shows, even with nothing toward it, so there's something
 * to hunt for.
 */

const ACCENT = 0xb18cff;

export type ItemsMessageInput = {
  playerName: string;
  /** Catalogue keys of everything held, one per item. */
  held: string[];
  /** Who holds each set's Summoned card on the server, by user id. */
  holders: Partial<Record<CollectionKey, string>>;
  /** Who on the server holds each piece, by piece key: there's one of each. */
  pieceHolders: Map<string, string>;
  /** The player looking, so their own pieces aren't listed as someone else's. */
  userId: string;
};

const setBlock = (
  key: CollectionKey,
  held: string[],
  holder: string | undefined,
  elsewhere: (piece: string) => string | undefined,
): string => {
  const set = COLLECTIONS[key];
  const { have, missing, complete } = setProgress(key, held);
  const total = have.length + missing.length;
  const lines = [
    `${set.emoji} **${set.name}** · ${have.length} of ${total} · summons **${set.summons}**`,
  ];
  if (have.length > 0) {
    lines.push(
      have
        .map(({ item, count }) =>
          count > 1 ? `${item.short} ×${count}` : `${item.short}`,
        )
        .join(" · "),
    );
  }
  if (holder) {
    lines.push(
      `-# ${set.summons} has been summoned on this server by <@${holder}>. These pieces are keepsakes now.`,
    );
  } else if (complete) {
    lines.push(`-# ✅ The set is complete.`);
  } else if (have.length > 0) {
    // One of each piece per server: a missing piece is either still out in
    // the dungeon or in someone's satchel, ready to trade for.
    lines.push(
      `-# Missing: ${missing
        .map((item) => {
          const who = elsewhere(item.key);
          return who ? `${item.short} (<@${who}> has it)` : item.short;
        })
        .join(", ")}`,
    );
  }
  return lines.join("\n");
};

const boonLines = (kind: ItemKind, held: string[]): string[] => {
  const lines = ITEMS.filter((item) => item.kind === kind).flatMap((item) => {
    const count = held.filter((key) => key === item.key).length;
    return count
      ? [
          `${item.emoji} **${item.name}**${count > 1 ? ` ×${count}` : ""} · ${item.blurb}`,
        ]
      : [];
  });
  return lines.length ? lines : ["-# None yet."];
};

export const buildItemsMessage = ({
  playerName,
  held,
  holders,
  pieceHolders,
  userId,
}: ItemsMessageInput) => {
  const elsewhere = (piece: string) => {
    const who = pieceHolders.get(piece);
    return who && who !== userId ? who : undefined;
  };
  // An item the catalogue no longer has is left out rather than shown blank.
  const known = held.filter((key) => itemByKey(key));
  const card = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `## 🎒 ${playerName}'s satchel`,
          "-# Items turn up deep in dungeon runs, from room 15 on, and you only keep them if you walk out.",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          "### Collections",
          ...(Object.keys(COLLECTIONS) as CollectionKey[]).map((key) =>
            setBlock(key, known, holders[key], elsewhere),
          ),
        ].join("\n\n"),
      ),
    )
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          "### Pack boons",
          ...boonLines("pack_boon", known),
          "",
          "### Dungeon boons",
          ...boonLines("dungeon_boon", known),
        ].join("\n"),
      ),
    );

  return {
    components: [card],
    flags: [MessageFlags.IsComponentsV2] as const,
    allowedMentions: { parse: [] },
  };
};
