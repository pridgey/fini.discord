import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  COLLECTIONS,
  ITEMS,
  itemByKey,
  setProgress,
  type CollectionKey,
  type ItemDefinition,
  type ItemKind,
} from "../items";
import type { UseOption } from "../useItem";

/**
 * `/finicard items`: a player's satchel. The sets they've started, with how
 * far they've got - pieces held, duplicates, what's missing - then their
 * boons, counted. A set they hold nothing of stays hidden, and so does the
 * card a set summons until it's complete: the satchel says only that more are
 * out there. Items are used from the dropdown underneath, and a long satchel
 * turns pages.
 */

const ACCENT = 0xb18cff;

/** Custom ids: `<namespace>:<page>:<userId>`, and the form's `:<item>` before them. */
export const ITEMS_PAGE = "v2_items_page";
export const ITEMS_USE = "v2_items_use";
export const ITEMS_CARD = "v2_items_card";

/** Entries to a page: a set counts as one, as does each boon. */
export const ITEMS_PER_PAGE = 8;

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
  /** Boons switched on, waiting for the next pack or run, by catalogue key. */
  active?: string[];
  /** What can be used, for the dropdown. */
  options?: UseOption[];
  /** Which page, from 0. Out of range is brought back in. */
  page?: number;
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
  // Who a set calls is a surprise until the set is whole, or it's been
  // called on the server for all to see.
  const named = complete || holder;
  const lines = [
    `${set.emoji} **${set.name}** · ${have.length} of ${total} · summons **${named ? set.summons : "???"}**`,
    have
      .map(({ item, count }) =>
        count > 1 ? `${item.short} ×${count}` : `${item.short}`,
      )
      .join(" · "),
  ];
  if (holder) {
    lines.push(
      `-# ${set.summons} has been summoned on this server by <@${holder}>. These pieces are keepsakes now.`,
    );
  } else if (complete) {
    lines.push(
      `-# ✅ The set is complete. Summon ${set.summons} from the dropdown below.`,
    );
  } else {
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

const boonLines = (
  kind: ItemKind,
  held: string[],
  active: string[],
): string[] =>
  // A boon that's switched on shows in its own section; these are the rest.
  ITEMS.filter((item) => item.kind === kind).flatMap((item) => {
    const count =
      held.filter((key) => key === item.key).length -
      active.filter((key) => key === item.key).length;
    return count > 0
      ? [
          `${item.emoji} **${item.name}**${count > 1 ? ` ×${count}` : ""} · ${item.blurb}`,
        ]
      : [];
  });

const switchedOnLine = (item: ItemDefinition): string =>
  `${item.emoji} **${item.name}** · ${
    item.kind === "pack_boon"
      ? item.key === "boon_set_compass"
        ? "your next set pack spends it"
        : "your next pack spends it"
      : item.kind === "dungeon_key"
        ? "your next dungeon run is free to enter"
        : "your next dungeon run starts with it"
  }`;

/** A section's heading and its entries; `always` shows it even when empty. */
type Section = { heading: string; entries: string[]; empty?: string };

const sectionsFor = ({
  held,
  holders,
  pieceHolders,
  userId,
  active = [],
}: ItemsMessageInput): Section[] => {
  const elsewhere = (piece: string) => {
    const who = pieceHolders.get(piece);
    return who && who !== userId ? who : undefined;
  };
  // An item the catalogue no longer has is left out rather than shown blank.
  const known = held.filter((key) => itemByKey(key));
  const keys = Object.keys(COLLECTIONS) as CollectionKey[];
  const started = keys.filter(
    (key) => setProgress(key, known).have.length > 0,
  );
  const hidden = keys.length - started.length;
  const teaser =
    hidden > 0
      ? `-# 🔒 ${hidden === keys.length ? `${hidden} collections are` : hidden === 1 ? "1 more collection is" : `${hidden} more collections are`} hidden in the deep. Find a piece to start one.`
      : undefined;

  const switchedOn = active.flatMap((key) => {
    const item = itemByKey(key);
    return item ? [switchedOnLine(item)] : [];
  });

  return [
    // What's switched on comes first: it's what the player's next pack or
    // run will be spending.
    { heading: "✨ Switched on", entries: switchedOn },
    {
      heading: "Collections",
      entries: [
        ...started.map((key) =>
          setBlock(key, known, holders[key], elsewhere),
        ),
        ...(teaser ? [teaser] : []),
      ],
    },
    {
      heading: "Pack boons",
      entries: boonLines("pack_boon", known, active),
      empty: "-# None yet.",
    },
    {
      heading: "Dungeon boons",
      entries: boonLines("dungeon_boon", known, active),
      empty: "-# None yet.",
    },
    // The rarer kinds show only once there's one to show.
    { heading: "Keys", entries: boonLines("dungeon_key", known, active) },
    { heading: "Card boons", entries: boonLines("card_boon", known, active) },
    { heading: "Mystery boxes", entries: boonLines("box", known, active) },
  ].flatMap((section: Section) =>
    section.entries.length
      ? [section]
      : section.empty
        ? [{ ...section, entries: [section.empty] }]
        : [],
  );
};

/**
 * The sections cut into pages of `ITEMS_PER_PAGE` entries. A section split
 * across pages carries its heading onto each.
 */
export const satchelPages = (sections: Section[]): Section[][] => {
  const pages: Section[][] = [[]];
  let count = 0;
  for (const section of sections) {
    for (const entry of section.entries) {
      if (count === ITEMS_PER_PAGE) {
        pages.push([]);
        count = 0;
      }
      const page = pages[pages.length - 1];
      const last = page[page.length - 1];
      if (last?.heading === section.heading) last.entries.push(entry);
      else page.push({ heading: section.heading, entries: [entry] });
      count++;
    }
  }
  return pages;
};

export const buildItemsMessage = (input: ItemsMessageInput) => {
  const { playerName, userId, options = [] } = input;
  const pages = satchelPages(sectionsFor(input));
  const page = Math.min(Math.max(input.page ?? 0, 0), pages.length - 1);

  const card = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `## 🎒 ${playerName}'s satchel`,
          "-# Items turn up deep in dungeon runs, from room 15 on, and you only keep them if you walk out.",
        ].join("\n"),
      ),
    );

  for (const section of pages[page]) {
    card
      .addSeparatorComponents((separator) => separator)
      .addTextDisplayComponents((text) =>
        text.setContent(
          [`### ${section.heading}`, ...section.entries].join(
            section.heading === "Collections" ? "\n\n" : "\n",
          ),
        ),
      );
  }

  card
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          options.length
            ? "-# Use an item from the dropdown: a boon or key is switched on for your next pack or run (one of each kind at a time), a card boon asks which card, a box opens."
            : undefined,
          "-# Sell an item with `/finicard sell item:`, or trade it with `/finicard trade`.",
          pages.length > 1 ? `-# Page ${page + 1} of ${pages.length}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );

  if (options.length) {
    card.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${ITEMS_USE}:${page}:${userId}`)
          .setPlaceholder("Use an item…")
          .addOptions(
            options.slice(0, 25).map((option) => ({
              label: option.label.slice(0, 100),
              value: option.value,
              description: option.description?.slice(0, 100),
              emoji: option.emoji,
            })),
          ),
      ),
    );
  }

  if (pages.length > 1) {
    card.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${ITEMS_PAGE}:${page - 1}:${userId}`)
          .setLabel("◀ Back")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(`${ITEMS_PAGE}:${page + 1}:${userId}`)
          .setLabel("Next ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === pages.length - 1),
      ),
    );
  }

  return {
    components: [card],
    flags: [MessageFlags.IsComponentsV2] as const,
    allowedMentions: { parse: [] },
  };
};

/** The form a card boon asks with: which card, and for a Name Tag, the name. */
export const cardBoonModal = (
  item: ItemDefinition,
  page: number,
  userId: string,
) => {
  const modal = new ModalBuilder()
    .setCustomId(`${ITEMS_CARD}:${item.key}:${page}:${userId}`)
    .setTitle(`${item.name}`.slice(0, 45))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Which card")
        .setDescription("Its name or id, as `/finicard collection` shows it.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("card")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100),
        ),
    );
  if (item.key === "card_name_tag") {
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Its new name")
        .setDescription("Up to 32 letters, numbers and spaces.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("name")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(32),
        ),
    );
  }
  return modal;
};
