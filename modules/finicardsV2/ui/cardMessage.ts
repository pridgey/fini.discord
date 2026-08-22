import {
  AttachmentBuilder,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { findKeyword } from "../keywords";
import { renderCardAttachments, renderCardImage, cardImageName } from "../cardArt";
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
  const image = await renderCardImage(card);
  if (!image) return null;

  const name = cardImageName(card);
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
};

/** A pack pull: one block, one gallery, one line per card with its id. */
export const buildPackMessage = async (
  input: PackMessageInput,
): Promise<BuiltCardMessage> => {
  const images = await renderCardAttachments(input.cards);

  const container = new ContainerBuilder()
    .setAccentColor(NEUTRAL_ACCENT)
    .addTextDisplayComponents((text) =>
      text.setContent(
        `## 🎴 Pack opened — ${input.cards.length} card${input.cards.length === 1 ? "" : "s"} ${compositionOf(input.cards)}`,
      ),
    );

  if (images.length > 0) {
    container.addMediaGalleryComponents((gallery) => {
      for (const image of images) {
        gallery.addItems((item) =>
          item
            .setURL(`attachment://${image.name}`)
            .setDescription(image.name.replace(/\.png$/, "")),
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
          .map((card) => `${cardLine(card)} · \`${card.instanceId}\``)
          .join("\n") || "_Nothing left in the pool._",
      ),
    )
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `-# ${input.cost} fc · add these to a deck with \`/finicard-v2 deck add\``,
          input.shortfall > 0
            ? `-# ${input.shortfall} card(s) couldn't be pulled — the pool is out of room. ${input.reimbursement} fc reimbursed.`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );

  return {
    components: [container],
    files: images.map(
      (image) => new AttachmentBuilder(image.buffer, { name: image.name }),
    ),
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
          ...chosen.map(
            (card, index) => `**${index + 1}.** ${cardLine(card)}`,
          ),
          "",
          `-# Waiting on **${opponentName}**. The match resolves the moment they lock in.`,
        ].join("\n"),
      ),
    );

  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
};
