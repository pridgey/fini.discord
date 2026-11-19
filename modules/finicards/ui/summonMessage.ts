import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { COLLECTIONS, type CollectionKey } from "../items";
import type { BattleCard } from "../types";
import { cardLine } from "./theme";

/**
 * A summoning, in the channel: the animation while it plays, then the card
 * it called, and a short card in the bot channel so the server hears of it.
 */

const ACCENT: Record<CollectionKey, number> = {
  dragon_balls: 0xffb03b,
  exodia: 0xc79bff,
  chaos_emeralds: 0xfff1a0,
};

export type SummonMessageInput = {
  set: CollectionKey;
  card: BattleCard;
  userId: string;
  /** The picture: the animation while it plays, then the card's still. */
  media: { name: string; buffer: Buffer } | null;
  /** Played through: the card's details show under it. */
  resting: boolean;
};

export const buildSummonMessage = ({
  set,
  card,
  userId,
  media,
  resting,
}: SummonMessageInput) => {
  const { name, summons, emoji } = COLLECTIONS[set];
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT[set])
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          `## ✨ ${summons} is summoned`,
          `${emoji} <@${userId}> gathered every one of the ${name} and called **${summons}**, the only one on this server.`,
        ].join("\n"),
      ),
    );
  if (media) {
    container.addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) =>
        item.setURL(`attachment://${media.name}`).setDescription(summons),
      ),
    );
  }
  if (resting) {
    container.addTextDisplayComponents((text) =>
      text.setContent(
        [
          `${cardLine(card)} · \`${card.instanceId}\``,
          `-# The ${name} are spent, and scatter back into the dungeon.`,
        ].join("\n"),
      ),
    );
  }
  return {
    components: [container],
    files: media ? [new AttachmentBuilder(media.buffer, { name: media.name })] : [],
    flags: [MessageFlags.IsComponentsV2] as const,
    allowedMentions: { parse: [] },
  };
};

/** The bot channel's notice, with a link to the summoning itself. */
export const buildSummonNotice = (
  set: CollectionKey,
  userId: string,
  link: string | null,
) => {
  const { summons, emoji, name } = COLLECTIONS[set];
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT[set])
    .addTextDisplayComponents((text) =>
      text.setContent(
        `${emoji} <@${userId}> gathered every one of the ${name} and summoned **${summons}**!`,
      ),
    );
  if (link) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("See the summoning")
          .setURL(link),
      ),
    );
  }
  return {
    components: [container],
    flags: [MessageFlags.IsComponentsV2] as const,
    allowedMentions: { parse: [] },
  };
};
