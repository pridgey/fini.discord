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
  cardChip,
  compositionOf,
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

const cardLabel = (card: BattleCard): string =>
  `${card.name} ${statLine(card)}`.slice(0, 76);

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

  const slots = Array.from({ length: RULES.rounds }, (_, slot) => {
    const index = picked[slot];
    if (index === undefined) return `**${slot + 1}.** _empty_`;
    const card = hand[index];
    return `**${slot + 1}.** ${TYPE_EMOJI[card.type]} ${card.name} \`${statLine(card)}\``;
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

  // A restart button, since a misclick would otherwise mean an unwanted lineup.
  if (picked.length > 0 && picked.length < RULES.rounds) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`v2_lineup_pick:${battleId}::reset`)
          .setLabel("Start over")
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }

  /* The opposing hand is the whole basis of the decision, and it was posted in
     the channel - which by now may be several messages up. Repeating it here as
     one compact line means the read can be made without leaving the picker. */
  const facing =
    context.opposing && context.opposing.length > 0
      ? [
          `**Facing ${context.opponentName ?? "them"}** ${compositionOf(context.opposing)}`,
          context.opposing.map(cardChip).join(" · "),
        ]
      : [];

  const done = picked.length === RULES.rounds;

  const container = new ContainerBuilder()
    .setAccentColor(
      picked.length > 0 ? TYPE_ACCENT[hand[picked[0]].type] : NEUTRAL_ACCENT,
    )
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          done
            ? "### Your lineup — locking in…"
            : `### Your lineup — pick slot ${nextSlot} of ${RULES.rounds}`,
          ...slots,
        ].join("\n"),
      ),
    );

  if (facing.length > 0) {
    container
      .addSeparatorComponents((separator) => separator)
      .addTextDisplayComponents((text) => text.setContent(facing.join("\n")));
  }

  container.addTextDisplayComponents((text) => text.setContent(WHEEL_HINT));

  for (const row of rows) {
    container.addActionRowComponents(() => row);
  }

  return {
    components: [container],
    flags: [MessageFlags.IsComponentsV2],
  };
};
