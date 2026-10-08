import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { RULES, TYPE_EMOJI } from "./rules";
import type { BattleCard } from "./types";
import {
  NEUTRAL_ACCENT,
  TYPE_ACCENT,
  WHEEL_HINT,
  activeKeyword,
  cardChip,
  keywordGlossary,
  statLine,
} from "./ui/theme";

/**
 * The private lineup picker: click three of your five, in slot order.
 *
 * Progress lives entirely in the button custom ids - `v2_lineup_pick:<battle>:
 * <picked so far>:<next>` - rather than in the database. Partial picks are worth
 * nothing if abandoned, and encoding them this way means an abandoned pick leaves
 * no row to clean up and a stale ephemeral can never desync from stored state.
 *
 * Hand indices are single digits, which is safe as long as a hand stays under
 * ten cards. `HAND_SIZE` is five, and `encodeLimit` asserts the rest.
 */

export const MAX_ENCODABLE_HAND = 10;

/**
 * The most keywords the picker explains inline. Two hands of five can carry ten
 * different ones, and ten lines of legend bury the prompt; past this the picker
 * explains the player's own and puts the rest behind a button.
 */
export const MAX_INLINE_KEYWORDS = 6;

export const encodePicks = (indices: number[]): string => indices.join("");

export const decodePicks = (encoded: string): number[] =>
  (encoded ?? "")
    .split("")
    .map((character) => Number.parseInt(character, 10))
    .filter((value) => Number.isInteger(value));

/** Guards the single-digit encoding before it can silently corrupt a pick. */
export const assertEncodable = (handSize: number): void => {
  if (handSize > MAX_ENCODABLE_HAND) {
    throw new Error(
      `A hand of ${handSize} cannot be encoded in the lineup picker; it packs indices as single digits.`,
    );
  }
};

/** The keyword goes first in the tail, so a long name truncates the name. */
const cardLabel = (card: BattleCard): string => {
  const keyword = activeKeyword(card);
  const tail = ` ${statLine(card)}${keyword ? ` · ${keyword.name}` : ""}`;
  return `${card.name.slice(0, 76 - tail.length)}${tail}`;
};

/**
 * A Components V2 message, not a `content` string.
 *
 * The picker is edited on every click, and a message created with
 * `IsComponentsV2` can never be edited back to a plain `content` message - so it
 * has to be V2 from the first reply, and every later update with it.
 */
export type PickerView = {
  components: ContainerBuilder[];
  flags: [MessageFlags.IsComponentsV2];
};

export type PickerContext = {
  /** The opposing hand, so the read can be made without scrolling back up. */
  opposing?: BattleCard[];
  opponentName?: string;
  /** Whose lineup this is, when the player is picking for more than one side. */
  playingAs?: string;
};

/**
 * Renders the picker for a partially-filled lineup.
 *
 * Cards already picked are shown in the running order rather than as buttons, so
 * the slot a card is going into is always visible - the ordering is the decision,
 * and a picker that hides it would be asking players to hold it in their heads.
 */
export const buildPickerView = (
  battleId: string,
  hand: BattleCard[],
  picked: number[],
  context: PickerContext = {},
): PickerView => {
  assertEncodable(hand.length);

  const remaining = hand
    .map((card, index) => ({ card, index }))
    .filter((entry) => !picked.includes(entry.index));

  /* Only the slots already filled: the heading says which one is next, and
     three lines of "empty" were the first thing on a screen with a lot to read. */
  const slots = picked.map((index, slot) => {
    const card = hand[index];
    const keyword = activeKeyword(card);
    return `**${slot + 1}.** ${TYPE_EMOJI[card.type]} ${card.name} \`${statLine(card)}\`${keyword ? ` · _${keyword.name}_` : ""}`;
  });

  const nextSlot = picked.length + 1;
  const encoded = encodePicks(picked);

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let index = 0; index < remaining.length; index += 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        remaining.slice(index, index + 5).map((entry) =>
          new ButtonBuilder()
            .setCustomId(`v2_lineup_pick:${battleId}:${encoded}:${entry.index}`)
            .setLabel(cardLabel(entry.card))
            .setEmoji(TYPE_EMOJI[entry.card.type])
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
  }

  /* Most keywords pay off in one slot and are dead in another, so what each one
     does has to be readable at the moment the slot is chosen. When the two hands
     carry more than fit, the player's own come first - those are the ones being
     slotted - and the full list is one click away. */
  const everyKeyword = keywordGlossary([...hand, ...(context.opposing ?? [])]);
  const ownKeywords = keywordGlossary(hand);
  const overflowing = everyKeyword.length > MAX_INLINE_KEYWORDS;
  const glossary = overflowing
    ? [
        ...ownKeywords,
        `-# …and ${everyKeyword.length - ownKeywords.length} more on ${context.opponentName ?? "their"}${context.opponentName ? "'s" : ""} cards — **Keywords** lists them all.`,
      ]
    : everyKeyword;

  /* Utility buttons share a row under the cards: a restart, since a misclick
     would otherwise mean an unwanted lineup, and the full keyword list. */
  const utilities: ButtonBuilder[] = [];
  if (picked.length > 0 && picked.length < RULES.rounds) {
    utilities.push(
      new ButtonBuilder()
        .setCustomId(`v2_lineup_pick:${battleId}::reset`)
        .setLabel("Start over")
        .setStyle(ButtonStyle.Danger),
    );
  }
  if (overflowing) {
    utilities.push(
      new ButtonBuilder()
        .setCustomId(`v2_keywords:${battleId}`)
        .setLabel("Keywords")
        .setEmoji("📖")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (utilities.length > 0) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(utilities));
  }

  const done = picked.length === RULES.rounds;
  const owner = context.playingAs ? `${context.playingAs}'s lineup` : "Your lineup";

  const container = new ContainerBuilder().setAccentColor(
    picked.length > 0 ? TYPE_ACCENT[hand[picked[0]].type] : NEUTRAL_ACCENT,
  );

  /* The opposing hand is the whole basis of the decision, and it was posted in
     the channel - which by now may be several messages up. Repeating it here,
     a card a line, means the read can be made without leaving the picker.
     Heading and roster are separate components for the gap between them. */
  if (context.opposing && context.opposing.length > 0) {
    container
      .addTextDisplayComponents((text) =>
        text.setContent(`**Facing ${context.opponentName ?? "them"}**`),
      )
      .addTextDisplayComponents((text) =>
        text.setContent(context.opposing!.map(cardChip).join("\n")),
      )
      .addSeparatorComponents((separator) => separator);
  }

  if (glossary.length > 0) {
    container.addTextDisplayComponents((text) =>
      text.setContent(glossary.join("\n")),
    );
  }
  container
    .addTextDisplayComponents((text) => text.setContent(WHEEL_HINT))
    .addSeparatorComponents((separator) => separator);

  /* The prompt sits last, directly above the buttons it is asking about, so it
     reads as their label rather than as a title for the reference above. */
  container.addTextDisplayComponents((text) =>
    text.setContent(
      [
        done
          ? `### ${owner} — locking in…`
          : `### ${owner} — pick slot ${nextSlot} of ${RULES.rounds}`,
        ...slots,
      ].join("\n"),
    ),
  );

  for (const row of rows) {
    container.addActionRowComponents(() => row);
  }

  return {
    components: [container],
    flags: [MessageFlags.IsComponentsV2],
  };
};
