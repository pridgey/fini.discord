import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { findKeyword } from "../keywords";
import { CARD_EMOJI } from "../rules";
import {
  PACK_COVER_NAME,
  PACK_OPENING_NAME,
  packCover,
  packOpeningGif,
  renderCardMedia,
  renderCardMediaList,
  type CardMedia,
} from "../cardArt";
import type { BattleCard } from "../types";
import {
  NEUTRAL_ACCENT,
  TYPE_ACCENT,
  TYPE_NAME,
  cardLine,
  compositionOf,
  rarityLabel,
  statLine,
} from "./theme";

/**
 * Card and pack presentation.
 *
 * A pack has the same problem the reveal had - five loose attachments stack down
 * the channel and bury the text that tells you what you pulled. One container
 * with a gallery keeps the pull together and readable.
 */

export type BuiltCardMessage = {
  components: ContainerBuilder[];
  files: AttachmentBuilder[];
  flags: [MessageFlags.IsComponentsV2];
};

/**
 * A single card: the image, and only the facts the image can't carry.
 *
 * Deliberately no ASCII stat block. The rendered card already shows the name,
 * type, stats, tags and ability, so repeating them as text was pure duplication -
 * the only thing a player needs alongside the picture is the id they type into a
 * deck command.
 */
export const buildCardMessage = async (
  card: BattleCard,
): Promise<BuiltCardMessage | null> => {
  // A Legendary is shown moving; everything else as its still.
  const media = await renderCardMedia(card);
  if (!media) return null;

  const { name, buffer: image } = media;
  const keyword = findKeyword(card.keyword);

  const container = new ContainerBuilder()
    .setAccentColor(TYPE_ACCENT[card.type])
    .addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) =>
        item.setURL(`attachment://${name}`).setDescription(card.name),
      ),
    )
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `**${card.name}**${card.foil ? " ✨ foil" : ""} · ${rarityLabel(card)} · ${TYPE_NAME[card.type]} ${card.stats[card.type]}`,
          `-# \`${statLine(card)}\` power/wit/heart${keyword ? ` · ${keyword.name}` : ""} · id \`${card.instanceId}\``,
        ].join("\n"),
      ),
    );

  return {
    components: [container],
    files: [new AttachmentBuilder(image, { name })],
    flags: [MessageFlags.IsComponentsV2],
  };
};

export type PackMessageInput = {
  cards: BattleCard[];
  cost: number;
  /** Cards the pack couldn't hand out because the pool is exhausted. */
  shortfall: number;
  reimbursement: number;
  /**
   * Show a Legendary as its pull reveal rather than its loop. The reveal plays
   * once, so the caller follows it with the same message built without this.
   */
  reveal?: boolean;
  /** Said in place of the price, for a pack that was not paid for. */
  note?: string;
  /** The label of a button that gets another pack like this one. Absent, there is none. */
  again?: string;
  /** Who opened it - a pack bought from a button is posted by Fini, so it says. */
  opener?: string;
};

/** "**Aya**'s pack", or "Pack" when nobody is named. */
const packOf = (opener?: string) => (opener ? `**${opener}**'s pack` : "Pack");

/** A pack pull: one block, one gallery, one line per card with its id. */
export const buildPackMessage = async (
  input: PackMessageInput,
): Promise<BuiltCardMessage> => {
  const images = await renderCardMediaList(input.cards, {
    reveal: input.reveal,
  });

  const container = new ContainerBuilder()
    .setAccentColor(NEUTRAL_ACCENT)
    .addTextDisplayComponents((text) =>
      text.setContent(
        `## ${CARD_EMOJI} ${input.opener ? `${input.opener}'s pack` : "Pack opened"} — ${input.cards.length} card${input.cards.length === 1 ? "" : "s"} ${compositionOf(input.cards)}`,
      ),
    );

  if (images.length > 0) {
    container.addMediaGalleryComponents((gallery) => {
      for (const image of images) {
        gallery.addItems((item) =>
          item
            .setURL(`attachment://${image.name}`)
            .setDescription(image.name.replace(/\.(png|gif)$/, "")),
        );
      }
      return gallery;
    });
  }

  container
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) =>
      text.setContent(
        input.cards
          .map(
            (card) =>
              `${cardLine(card)}${specialMark(card)}${card.isNew ? " · 🆕 **New**" : ""} · \`${card.instanceId}\``,
          )
          .join("\n") || "_Nothing left in the pool._",
      ),
    )
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `-# ${input.note ?? `${input.cost} fc`} · add these to a deck with \`/finicard deck add\``,
          input.shortfall > 0
            ? `-# ${input.shortfall} card(s) couldn't be pulled — the pool is out of room. ${input.reimbursement} fc reimbursed.`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );

  const again = input.again;
  if (again) {
    container.addActionRowComponents(() =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(PACK_BUTTON.again)
          .setLabel(again)
          .setStyle(ButtonStyle.Success),
      ),
    );
  }

  return {
    components: [container],
    files: images.map(
      (image) => new AttachmentBuilder(image.buffer, { name: image.name }),
    ),
    flags: [MessageFlags.IsComponentsV2],
  };
};

/** Button ids of the pack flow, handled by the collector in `packFlow.ts`. */
export const PACK_BUTTON = {
  open: "v2pack-open",
  next: "v2pack-next",
  all: "v2pack-all",
  again: "v2pack-again",
} as const;

/** What a pull is, where it is anything more than its rarity. */
const specialMark = (card: BattleCard): string =>
  card.legendary
    ? ` · 👑 **${rarityLabel(card)}**`
    : card.secretArt
      ? " · 🌟 **Secret Art**"
      : "";

/** The sealed pack, waiting to be opened. Says nothing of what is inside. */
export const buildPackCoverMessage = async (input: {
  size: number;
  cost: number;
  note?: string;
  opener?: string;
}): Promise<BuiltCardMessage> => {
  const container = new ContainerBuilder()
    .setAccentColor(NEUTRAL_ACCENT)
    .addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) =>
        item
          .setURL(`attachment://${PACK_COVER_NAME}`)
          .setDescription("A sealed booster pack"),
      ),
    )
    .addTextDisplayComponents((text) =>
      text.setContent(
        `-# ${packOf(input.opener)} · ${input.note ?? `${input.cost} fc`} · ${input.size} cards inside`,
      ),
    )
    .addActionRowComponents(() =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(PACK_BUTTON.open)
          .setLabel("Open pack")
          .setStyle(ButtonStyle.Primary),
      ),
    );

  return {
    components: [container],
    files: [
      new AttachmentBuilder(await packCover(), { name: PACK_COVER_NAME }),
    ],
    flags: [MessageFlags.IsComponentsV2],
  };
};

/** The pack tearing open. Shown for as long as the animation runs. */
export const buildPackOpeningMessage = async (): Promise<BuiltCardMessage> => ({
  components: [
    new ContainerBuilder()
      .setAccentColor(NEUTRAL_ACCENT)
      .addMediaGalleryComponents((gallery) =>
        gallery.addItems((item) =>
          item
            .setURL(`attachment://${PACK_OPENING_NAME}`)
            .setDescription("The pack opening"),
        ),
      ),
  ],
  files: [
    new AttachmentBuilder(await packOpeningGif(), { name: PACK_OPENING_NAME }),
  ],
  flags: [MessageFlags.IsComponentsV2],
});

/**
 * One card out of a pack, on its own, with the way on to the next.
 *
 * `media` is the card as it should be shown at this moment - a Legendary's
 * reveal, then its loop - which is why it is passed in rather than drawn here.
 */
export const buildPackCardMessage = (input: {
  card: BattleCard;
  media: CardMedia;
  /** This card's place in the pack, from 0. */
  index: number;
  total: number;
  opener?: string;
  /** On the last card: the label of a button that gets another pack. */
  again?: string;
}): BuiltCardMessage => {
  const { card, media } = input;
  const keyword = findKeyword(card.keyword);
  const last = input.index >= input.total - 1;

  const row = new ActionRowBuilder<ButtonBuilder>();
  if (!last) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(PACK_BUTTON.next)
        .setLabel("Next card")
        .setStyle(ButtonStyle.Primary),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(PACK_BUTTON.all)
      .setLabel(last ? "See the whole pack" : "Skip to the end")
      .setStyle(last ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
  if (last && input.again) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(PACK_BUTTON.again)
        .setLabel(input.again)
        .setStyle(ButtonStyle.Success),
    );
  }

  const container = new ContainerBuilder()
    .setAccentColor(TYPE_ACCENT[card.type])
    .addTextDisplayComponents((text) =>
      text.setContent(
        `-# ${packOf(input.opener)} · card ${input.index + 1} of ${input.total}`,
      ),
    )
    .addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) =>
        item.setURL(`attachment://${media.name}`).setDescription(card.name),
      ),
    )
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          ...(card.isNew ? ["🆕 **New to your collection!**"] : []),
          `**${card.name}**${card.foil ? " ✨ foil" : ""} · ${rarityLabel(card)} · ${TYPE_NAME[card.type]} ${card.stats[card.type]}${
            card.legendary ? " · 👑" : card.secretArt ? " · 🌟" : ""
          }`,
          `-# \`${statLine(card)}\` power/wit/heart${keyword ? ` · ${keyword.name}` : ""} · id \`${card.instanceId}\``,
        ].join("\n"),
      ),
    )
    .addActionRowComponents(() => row);

  return {
    components: [container],
    files: [new AttachmentBuilder(media.buffer, { name: media.name })],
    flags: [MessageFlags.IsComponentsV2],
  };
};

/**
 * The "locked in, waiting on them" confirmation.
 *
 * Shows the committed order back, because it is the last chance to see it - the
 * lineup stays hidden from the opponent until the match resolves, so this
 * ephemeral is the only record the player has of what they played.
 */
export const buildLockedInMessage = (
  chosen: BattleCard[],
  opponentName: string,
): { components: ContainerBuilder[]; flags: [MessageFlags.IsComponentsV2] } => {
  const container = new ContainerBuilder()
    .setAccentColor(TYPE_ACCENT[chosen[0]?.type ?? "power"])
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          "### ✅ Lineup locked in",
          ...chosen.map((card, index) => `**${index + 1}.** ${cardLine(card)}`),
          "",
          `-# Waiting on **${opponentName}**. The match resolves the moment they lock in.`,
        ].join("\n"),
      ),
    );

  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
};
