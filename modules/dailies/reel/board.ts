import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { noteCard } from "../weave/board";
import {
  FRAMES,
  FRAME_PAY,
  earned,
  filmName,
  finished,
  framesShown,
  payNow,
  solvedOn,
  type Film,
  type ReelProgress,
} from "./game";
import type { ReelRoundRecord } from "./store";
import { TMDB_CREDIT, frameUrl } from "./tmdb";

/**
 * A player's go at Reel: the frames shown so far, newest first and largest,
 * the guesses made, and buttons to guess or skip. The guess is typed into a
 * box the button opens.
 */

export const REEL_BUTTON = "reel";
export const REEL_GUESS_MODAL = "reel_guess";

const ACCENT = 0xe0a030;

export const buttonId = (roundId: string, action: string) =>
  `${REEL_BUTTON}:${roundId}:${action}`;

export type ReelBoardInput = {
  round: ReelRoundRecord;
  progress: ReelProgress;
  /** What the last turn did, in a card of its own under the board. */
  note?: string;
  /** Films an unclear guess might mean, offered as buttons under the note. */
  choices?: Film[];
  /** Reel isn't live yet: say that nothing is paid. */
  trial?: boolean;
};

const turnLines = (progress: ReelProgress): string[] =>
  progress.turns.map((turn, i) =>
    turn.kind === "skip"
      ? `${i + 1}. ⏭️ Skipped`
      : `${i + 1}. ❌ ${filmName(turn)}`,
  );

export const reelBoardText = ({
  round,
  progress,
  trial,
}: ReelBoardInput): string => {
  const id = round.movie_id;
  const done = finished(id, progress);
  const frame = solvedOn(id, progress);
  // A right guess is the last turn; it's listed as the answer, not a miss.
  const misses = frame ? { turns: progress.turns.slice(0, -1) } : progress;
  return [
    "## 🎬 Reel",
    "-# Name the film from its frames. Each wrong guess or skip shows another.",
    "",
    ...(turnLines(misses).length ? [...turnLines(misses), ""] : []),
    done
      ? frame
        ? `✅ **${filmName(round)}** on frame ${frame} · 🪙 **${earned(id, progress)} fc**`
        : `🎬 It was **${filmName(round)}**. Better luck tomorrow.`
      : `Frame **${framesShown(id, progress)}** of ${FRAMES} · 🪙 a right guess pays **${payNow(progress)} fc**`,
    ...(done
      ? []
      : [`-# ${FRAME_PAY.join(" · ")} fc on frames 1 to ${FRAMES}.`]),
    ...(trial
      ? [
          "",
          "-# 🧪 On trial: only the bot admin can play it, and nothing is paid.",
        ]
      : []),
    `-# ${TMDB_CREDIT}`,
  ].join("\n");
};

/** Discord's longest button label. */
const LABEL_MAX = 80;
const clip = (label: string) =>
  label.length <= LABEL_MAX ? label : `${label.slice(0, LABEL_MAX - 1)}…`;

/** The board: the frames, the guesses, and its buttons while the round is on. */
export const buildReelBoard = async (input: ReelBoardInput) => {
  const { round, progress } = input;
  const shown = framesShown(round.movie_id, progress);
  // Newest first, so the frame just revealed is the big one.
  const frames = round.frames.slice(0, shown).reverse();
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addMediaGalleryComponents((gallery) =>
      gallery.addItems(
        ...frames.map((path, i) =>
          new MediaGalleryItemBuilder()
            .setURL(frameUrl(path))
            .setDescription(`Frame ${shown - i}`),
        ),
      ),
    )
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) => text.setContent(reelBoardText(input)));
  if (!finished(round.movie_id, progress)) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonId(round.id, "guess"))
          .setLabel("Guess the film")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(buttonId(round.id, "skip"))
          .setLabel(shown < FRAMES ? "Skip to the next frame" : "Give up")
          .setEmoji("⏭️")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }
  const note = input.note && noteCard(input.note);
  if (note && input.choices?.length && !finished(round.movie_id, progress))
    note.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...input.choices.map((film) =>
          new ButtonBuilder()
            .setCustomId(buttonId(round.id, `pick:${film.movieId}`))
            .setLabel(clip(filmName(film)))
            .setStyle(ButtonStyle.Primary),
        ),
      ),
    );
  return {
    components: note ? [container, note] : [container],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
};

/** The box a guess is typed in. */
export const guessModal = (roundId: string) =>
  new ModalBuilder()
    .setCustomId(`${REEL_GUESS_MODAL}:${roundId}`)
    .setTitle("Guess the film")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("The film")
        .setDescription(
          "Its title. Add the year for a remake or a film that shares a name.",
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("film")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g. Inception  or  Dune 1984")
            .setRequired(true)
            .setMaxLength(100),
        ),
    );
