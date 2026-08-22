import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { handStripName, renderHandStrip } from "../cardArt";
import type { BattleCard, Side } from "../types";
import {
  MECHANIC_HINT,
  NEUTRAL_ACCENT,
  SIDE_ACCENT,
  cardLine,
  compositionOf,
} from "./theme";

/**
 * The reveal.
 *
 * Two problems to solve here. The first is ownership: ten card images in a flat
 * message make it impossible to tell at a glance which five are yours, so each
 * hand gets its own bordered container with its own accent colour.
 *
 * The second is legibility. Portrait cards in a gallery each get a fraction of
 * the message width, at which point the stats are unreadable and you have to
 * click every card - which defeats the point of showing them. So a hand is a
 * *single* wide image with one landscape strip per card (`renderHandStrip`),
 * because a lone gallery item gets the full width. That is also why there is no
 * longer a text line per card: the strip already carries the name, type and
 * stats at a readable size.
 */

export type RevealHand = {
  side: Side;
  name: string;
  userId: string;
  cards: BattleCard[];
};

export type RevealMessageInput = {
  challenger: RevealHand;
  defender: RevealHand;
  wager: number;
  battleId: string;
};

export type BuiltMessage = {
  components: ContainerBuilder[];
  files: AttachmentBuilder[];
  /** Narrow literal rather than `MessageFlags[]`, which discord.js rejects. */
  flags: [MessageFlags.IsComponentsV2];
};

/** One player's hand: accent-coloured block and one full-width strip image. */
const handContainer = (
  hand: RevealHand,
  stripFile: string | null,
): ContainerBuilder => {
  const container = new ContainerBuilder()
    .setAccentColor(SIDE_ACCENT[hand.side])
    .addTextDisplayComponents((text) =>
      text.setContent(`### ${hand.name}'s hand ${compositionOf(hand.cards)}`),
    );

  if (stripFile) {
    return container.addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) =>
        item
          .setURL(`attachment://${stripFile}`)
          .setDescription(`${hand.name}'s hand`),
      ),
    );
  }

  // Only reached if the strip failed to render; the text is the fallback.
  return container.addTextDisplayComponents((text) =>
    text.setContent(hand.cards.map(cardLine).join("\n")),
  );
};

/**
 * Builds the reveal message.
 *
 * Renders both hands' images in one pass, then splits them between the two
 * containers - a card that fails to render simply loses its thumbnail, and the
 * text lines still carry the information.
 */
export const buildRevealMessage = async (
  input: RevealMessageInput,
): Promise<BuiltMessage> => {
  /* One image per hand, rendered concurrently. Two files instead of ten, and
     each one gets the full message width. */
  const [challengerStrip, defenderStrip] = await Promise.all([
    renderHandStrip(input.challenger.cards),
    renderHandStrip(input.defender.cards),
  ]);

  const challengerFile = handStripName(`${input.challenger.name}-challenger`);
  const defenderFile = handStripName(`${input.defender.name}-defender`);

  const files: AttachmentBuilder[] = [];
  if (challengerStrip) {
    files.push(new AttachmentBuilder(challengerStrip, { name: challengerFile }));
  }
  if (defenderStrip) {
    files.push(new AttachmentBuilder(defenderStrip, { name: defenderFile }));
  }

  const lineupButton = new ButtonBuilder()
    .setCustomId(`v2_lineup_open:${input.battleId}`)
    .setLabel("Set your lineup")
    .setStyle(ButtonStyle.Primary);

  const header = new ContainerBuilder()
    .setAccentColor(NEUTRAL_ACCENT)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          "## ⚔️ Hands are dealt",
          `<@${input.challenger.userId}> vs <@${input.defender.userId}>${
            input.wager > 0 ? ` · **${input.wager} fc** each` : " · friendly"
          }`,
        ].join("\n"),
      ),
    )
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) =>
      text.setContent(
        `Both of you now pick **3 of your ${input.challenger.cards.length}**, in slot order. The two you leave behind are the decision.\n${MECHANIC_HINT}`,
      ),
    )
    .addActionRowComponents(() =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(lineupButton),
    );

  return {
    components: [
      header,
      handContainer(input.challenger, challengerStrip ? challengerFile : null),
      handContainer(input.defender, defenderStrip ? defenderFile : null),
    ],
    files,
    flags: [MessageFlags.IsComponentsV2],
  };
};
