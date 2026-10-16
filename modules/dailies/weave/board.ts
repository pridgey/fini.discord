import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  THREAD_PRIZES,
  allFound,
  canGuessThread,
  earned,
  nextHint,
  stillPossible,
  threadLetters,
  threadPrizeNow,
  type WeaveProgress,
} from "./game";
import type { WeavePuzzle } from "./puzzle";
import { WEAVE_IMAGE, renderWeaveBoard } from "./render";

/**
 * A player's Weave board: the grid as an image, the words and the thread so
 * far, and buttons to guess words, guess the thread, or take a hint. The
 * guesses are typed into a box the buttons open.
 */

export const WEAVE_BUTTON = "weave";
export const WEAVE_WORDS_MODAL = "weave_words";
export const WEAVE_THREAD_MODAL = "weave_thread";

const ACCENT = 0x8f6fd8;

export type BoardInput = {
  roundId: string;
  puzzle: WeavePuzzle;
  progress: WeaveProgress;
  /** What the last guess did, a line per word: "✅ PURSE · +5 fc". Shown in a card of its own below the board. */
  note?: string;
  /** Weave isn't live yet: say that nothing is paid. */
  trial?: boolean;
};

export const buttonId = (roundId: string, action: string) => `${WEAVE_BUTTON}:${roundId}:${action}`;

/**
 * The words, shortest first - not in the grid's order, which the thread's
 * letters could be matched to. Found ones are spelled out; the rest are blanks
 * with their length, since underscores are hard to count.
 */
const wordLines = (puzzle: WeavePuzzle, progress: WeaveProgress): string[] =>
  puzzle.words
    .map((word, index) => ({ word: word.word, index }))
    .sort((a, b) => a.word.length - b.word.length || a.index - b.index)
    .map(({ word, index }) => {
      if (progress.found.includes(index)) return `✅ **${word.toUpperCase()}**`;
      const hinted = progress.hinted.includes(index);
      const blanks = `${hinted ? word[0].toUpperCase() : "_"}${" _".repeat(word.length - 1)}`;
      return `${hinted ? "💡" : "▫️"} \`${blanks}\` (${word.length})`;
    });

const threadLines = (puzzle: WeavePuzzle, progress: WeaveProgress): string[] => {
  const letters = threadLetters(puzzle, progress).toUpperCase().split("");
  const showing = letters.length > 0 ? letters.map((letter) => `**${letter}**`).join(" · ") : "none yet";
  if (progress.threadGuess === puzzle.thread) {
    return [`✅ **${puzzle.thread.toUpperCase()}** · **+${progress.threadFc} fc**`];
  }
  if (progress.threadGuess !== null) {
    return [`❌ You guessed **${progress.threadGuess.toUpperCase()}**.`];
  }
  if (allFound(puzzle, progress)) {
    return [`It was **${puzzle.thread.toUpperCase()}**, spelled out before it was guessed.`];
  }
  if (!canGuessThread(puzzle, progress)) {
    return [`Letters showing: ${showing}`, "-# Every letter is showing, so the thread can't be guessed any more."];
  }
  return [
    `Letters showing: ${showing}`,
    `A right guess now pays **${threadPrizeNow(puzzle, progress)} fc**.`,
    `-# A ${puzzle.thread.length}-letter word made of the words' first letters, in some order. One guess. It's worth ${THREAD_PRIZES.join(", ")} fc with 0, 1, 2, 3 or 4 letters showing - a hint shows one too.`,
  ];
};

export const boardText = (input: BoardInput): string => {
  const { puzzle, progress } = input;
  const done = allFound(puzzle, progress);
  return [
    "## 🧵 Weave",
    "-# Five hidden words use every letter once, each running up, down, left or right.",
    "",
    "**Words**",
    ...wordLines(puzzle, progress),
    "",
    "**🧵 The thread**",
    ...threadLines(puzzle, progress),
    "",
    done
      ? `🪙 **${earned(puzzle, progress)} fc** won`
      : `🪙 **${earned(puzzle, progress)} fc** so far · up to **${stillPossible(puzzle, progress)} fc**`,
    ...(input.trial ? ["", "-# 🧪 On trial: only you can play it, and nothing is paid."] : []),
  ].join("\n");
};

const RIGHT_ACCENT = 0x5fa834;
const WRONG_ACCENT = 0xd9534f;

/**
 * What the last guess did, in a small card under the board - where it's seen
 * at once, and the board keeps its shape. Green if anything was right, red if
 * every guess missed, the board's own colour otherwise.
 */
export const noteCard = (note: string) =>
  new ContainerBuilder()
    .setAccentColor(note.includes("✅") ? RIGHT_ACCENT : note.includes("❌") ? WRONG_ACCENT : ACCENT)
    .addTextDisplayComponents((text) => text.setContent(note));

/** The board: the image, the words and thread, and its buttons while there's anything left to do. */
export const buildBoard = async (input: BoardInput) => {
  const { puzzle, progress, roundId } = input;
  const image = await renderWeaveBoard({ puzzle, progress });
  const done = progress.found.length === puzzle.words.length;
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) => item.setURL(`attachment://${WEAVE_IMAGE}`).setDescription("Your Weave board")),
    )
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) => text.setContent(boardText(input)));
  if (!done) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonId(roundId, "words"))
          .setLabel("Guess words")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(buttonId(roundId, "thread"))
          .setLabel("Guess the thread")
          .setEmoji("🧵")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!canGuessThread(puzzle, progress)),
        new ButtonBuilder()
          .setCustomId(buttonId(roundId, "hint"))
          .setLabel("Hint")
          .setEmoji("💡")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(nextHint(puzzle, progress) === null),
      ),
    );
  }
  return {
    components: input.note ? [container, noteCard(input.note)] : [container],
    files: [new AttachmentBuilder(image, { name: WEAVE_IMAGE })],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
};

/** The box words are guessed in: one or several at once. */
export const wordsModal = (roundId: string) =>
  new ModalBuilder()
    .setCustomId(`${WEAVE_WORDS_MODAL}:${roundId}`)
    .setTitle("Guess words")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Words you've spotted")
        .setDescription("One, or several separated by spaces or commas.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("words")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g. purse  or  purse, keep, seal")
            .setRequired(true)
            .setMaxLength(100),
        ),
    );

/** The box the thread is guessed in. One guess, so it says so. */
export const threadModal = (roundId: string) =>
  new ModalBuilder()
    .setCustomId(`${WEAVE_THREAD_MODAL}:${roundId}`)
    .setTitle("Guess the thread")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("The thread word")
        .setDescription("You get one guess. The fewer of its letters are showing, the more it pays.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("thread")
            .setStyle(TextInputStyle.Short)
            .setMinLength(5)
            .setMaxLength(5)
            .setRequired(true),
        ),
    );
