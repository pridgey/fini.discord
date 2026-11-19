import {
  ActionRowBuilder,
  AttachmentBuilder,
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
  CONSONANTS,
  MAX_FC,
  VOWELS,
  WRONG_SOLVE_COST,
  calledOf,
  canCall,
  earned,
  hits,
  potOf,
  priceOf,
  statusOf,
  wrongGuessesOf,
  type GistProgress,
  type GistPuzzle,
} from "./game";
import { GIST_IMAGE, renderGistBoard } from "./render";

/**
 * A player's Gist board: the tiles as an image, the pot and the letters
 * called, two dropdowns to call a consonant or buy a vowel - each priced -
 * and buttons to solve or give up. What the last move did goes in a small
 * card of its own underneath, like Weave's.
 */

export const GIST_BUTTON = "gist";
export const GIST_SOLVE_MODAL = "gist_solve";

export const ACCENT = 0xe2703a;
const RIGHT_ACCENT = 0x5fa834;
const WRONG_ACCENT = 0xd9534f;

export const buttonId = (roundId: string, action: string) =>
  `${GIST_BUTTON}:${roundId}:${action}`;

export type Note = { text: string; tone: "right" | "wrong" | "neutral" };

export type GistBoardInput = {
  roundId: string;
  puzzle: GistPuzzle;
  progress: GistProgress;
  note?: Note;
  /** The letter just called, gold on the board. */
  highlight?: string;
  /** Gist isn't live yet: say that nothing is paid. */
  trial?: boolean;
};

const potLine = (progress: GistProgress): string => {
  switch (statusOf(progress)) {
    case "solved":
      return `🎉 Solved · 🪙 **${earned(progress)} fc** won`;
    case "broke":
      return "💸 The pot ran dry. Better luck tomorrow.";
    case "gave-up":
      return "🏳️ You gave this one up. Better luck tomorrow.";
    default:
      return `🪙 **${potOf(progress)} fc** in the pot`;
  }
};

export const gistBoardText = ({
  puzzle,
  progress,
  trial,
}: GistBoardInput): string => {
  const called = calledOf(progress);
  const hit = called.filter((l) => hits(puzzle, l));
  const missed = called.filter((l) => !hits(puzzle, l));
  const wrong = wrongGuessesOf(progress);
  return [
    "## 💡 Gist",
    `-# Call letters to fill in the phrase - common ones cost more. Solve to keep what's left of the pot, up to ${MAX_FC} fc.`,
    "",
    potLine(progress),
    `✅ ${hit.length ? hit.map((l) => `**${l}** ×${hits(puzzle, l)}`).join(" · ") : "-# No hits yet"}`,
    `❌ ${missed.length ? missed.map((l) => `**${l}**`).join(" · ") : "-# No misses yet"}`,
    ...(wrong.length
      ? [`🚫 ${wrong.map((g) => `~~${g}~~`).join(" · ")}`]
      : []),
    ...(trial
      ? [
          "",
          "-# 🧪 On trial: only the bot admin can play it, and nothing is paid.",
        ]
      : []),
  ].join("\n");
};

const letterMenu = (
  input: GistBoardInput,
  action: string,
  letters: string[],
  placeholder: string,
) => {
  const options = letters
    .filter((l) => canCall(input.puzzle, input.progress, l))
    .map((l) => ({
      label: l,
      description: `${priceOf(input.puzzle, l)} fc`,
      value: l,
    }));
  if (!options.length) return undefined;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buttonId(input.roundId, action))
      .setPlaceholder(placeholder)
      .addOptions(options),
  );
};

export const noteCard = ({ text, tone }: Note) =>
  new ContainerBuilder()
    .setAccentColor(
      tone === "right" ? RIGHT_ACCENT : tone === "wrong" ? WRONG_ACCENT : ACCENT,
    )
    .addTextDisplayComponents((display) => display.setContent(text));

/** The board: the image, the pot and letters, and its controls while it's on. */
export const buildGistBoard = async (input: GistBoardInput) => {
  const { puzzle, progress, roundId, highlight } = input;
  const image = await renderGistBoard({ puzzle, progress, highlight });
  const card = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) =>
        item
          .setURL(`attachment://${GIST_IMAGE}`)
          .setDescription(`Your Gist board: a ${puzzle.category} phrase`),
      ),
    )
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) => text.setContent(gistBoardText(input)));

  if (statusOf(progress) === "playing") {
    for (const row of [
      letterMenu(input, "consonant", CONSONANTS, "Call a consonant"),
      letterMenu(input, "vowel", VOWELS, "Buy a vowel"),
    ]) {
      if (row) card.addActionRowComponents(row);
    }
    card.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonId(roundId, "solve"))
          .setLabel("Solve")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(buttonId(roundId, "give-up"))
          .setLabel("Give up")
          .setEmoji("🏳️")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return {
    components: input.note ? [card, noteCard(input.note)] : [card],
    files: [new AttachmentBuilder(image, { name: GIST_IMAGE })],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
};

/** The box a solve is typed in. */
export const solveModal = (roundId: string, category: string) =>
  new ModalBuilder()
    .setCustomId(`${GIST_SOLVE_MODAL}:${roundId}`)
    .setTitle("Solve the phrase")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(`The ${category.toLowerCase()} phrase`)
        .setDescription(
          `A wrong answer costs ${WRONG_SOLVE_COST} fc. One that doesn't fit the board is free.`,
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("phrase")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100),
        ),
    );
