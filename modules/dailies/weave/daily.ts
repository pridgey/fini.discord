import { addCoin } from "../../finicoin";
import { currentDay, dayKey } from "../shared";
import { buildBoard } from "./board";
import {
  allFound,
  canGuessThread,
  checkWord,
  earned,
  findWord,
  countGuesses,
  finished,
  guessThread,
  nextHint,
  takeHint,
} from "./game";
import { generatePuzzle } from "./puzzle";
import {
  createWeaveRound,
  getWeaveRound,
  getWeaveRoundById,
  openWeavePlay,
  progressOf,
  puzzleOf,
  saveWeaveProgress,
  type WeavePlayRecord,
  type WeaveRoundRecord,
} from "./store";

/**
 * Weave, the daily word puzzle. At noon a puzzle goes up in the daily post
 * (`../post.ts`); each player opens a private board on it, and is paid for
 * every word the moment they find it. The post's live line shows who solved it.
 */

/**
 * Off while Weave is being tried out: it isn't in the daily post, only the bot
 * admin can play it (`/daily weave`), and boards pay nothing. Turning it on is
 * all it takes to go live.
 */
export const WEAVE_LIVE = true;

/** Today's puzzle, made and saved if it doesn't exist yet. */
export const ensureTodaysWeave = async (): Promise<WeaveRoundRecord> => {
  const day = dayKey();
  const existing = await getWeaveRound(day);
  if (existing) return existing;
  // Two makers racing for the day: the unique index keeps the first.
  return createWeaveRound(day, generatePuzzle()).catch(async (error) => {
    const raced = await getWeaveRound(day);
    if (raced) return raced;
    throw error;
  });
};

/* ------------------------------------------------------------- playing */

export type WeavePlayer = {
  serverId: string;
  serverName: string;
  userId: string;
  /** For the bank record. */
  username: string;
  /** For the announcement and the leaderboard. */
  displayName: string;
};

/** The round a button names, if it's still the one being played; otherwise why not. */
export const playableWeave = async (
  roundId: string,
): Promise<{ round: WeaveRoundRecord } | { refusal: string }> => {
  const round = await getWeaveRoundById(roundId);
  if (!round)
    return {
      refusal: "That Weave is gone. Today's is up with `/daily weave`.",
    };
  if (round.day !== currentDay())
    return {
      refusal: "That Weave is over. Today's is up with `/daily weave`.",
    };
  return { round };
};

/** Boards being saved, by play: a second press while one saves is let go. */
const saving = new Set<string>();

/**
 * Saves a board and pays what the save added. On trial nothing is paid, and the
 * first time a board is solved the player is shown what the live post would
 * have said; live, that's the daily post's job.
 */
const settle = async (
  round: WeaveRoundRecord,
  play: WeavePlayRecord,
  player: WeavePlayer,
  progress: ReturnType<typeof progressOf>,
  fc: number,
): Promise<string | null> => {
  const puzzle = puzzleOf(round);
  const done = finished(puzzle, progress);
  await saveWeaveProgress(
    play.id,
    progress,
    earned(puzzle, progress),
    done || play.finished,
  );
  if (!WEAVE_LIVE) {
    return done && !play.finished
      ? solvedMessage(player, progress, puzzle)
      : null;
  }
  if (fc > 0) {
    await addCoin(
      player.userId,
      player.serverId,
      fc,
      player.username,
      player.serverName,
      "Reserve",
    );
  }
  return null;
};

/** "🧵 Aya solved today's Weave in 7 guesses and won 58 fc!" - shown to a player on trial. */
export const solvedMessage = (
  player: Pick<WeavePlayer, "displayName">,
  progress: ReturnType<typeof progressOf>,
  puzzle: ReturnType<typeof puzzleOf>,
): string => {
  const guesses = `${progress.guesses} ${progress.guesses === 1 ? "guess" : "guesses"}`;
  const thread =
    progress.threadGuess === puzzle.thread ? ", thread and all," : "";
  return `🧵 **${player.displayName}** solved today's Weave${thread} in ${guesses} and won **${earned(puzzle, progress)} fc**!`;
};

/** A board, as the player will see it. */
const boardFor = (
  round: WeaveRoundRecord,
  progress: ReturnType<typeof progressOf>,
  note?: string,
) =>
  buildBoard({
    roundId: round.id,
    puzzle: puzzleOf(round),
    progress,
    note,
    trial: !WEAVE_LIVE,
  });

const playOf = (round: WeaveRoundRecord, player: WeavePlayer) =>
  openWeavePlay(round.id, player.serverId, player.userId, player.displayName);

/** A player's board as it stands, made the first time they open it. */
export const openWeave = async (round: WeaveRoundRecord, player: WeavePlayer) =>
  boardFor(round, progressOf(await playOf(round, player)));

/** Lights the first letter of the next unfound word. */
export const hintWeave = async (
  round: WeaveRoundRecord,
  player: WeavePlayer,
) => {
  const puzzle = puzzleOf(round);
  const play = await playOf(round, player);
  const before = progressOf(play);
  if (nextHint(puzzle, before) === null || saving.has(play.id))
    return boardFor(round, before);
  saving.add(play.id);
  try {
    const progress = takeHint(puzzle, before);
    await settle(round, play, player, progress, 0);
    return boardFor(
      round,
      progress,
      "💡 A word's first letter is ringed. Finding that word pays 3 fc, and its letter now shows in the thread, so the thread pays less.",
    );
  } finally {
    saving.delete(play.id);
  }
};

/** Words as typed into the box: split on spaces and commas, each once. */
export const parseWords = (typed: string): string[] => [
  ...new Set(
    typed
      .split(/[\s,]+/)
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  ),
];

/** Typed guesses at the words - one or several - saved and paid for the right ones. */
export const guessWeaveWords = async (
  round: WeaveRoundRecord,
  player: WeavePlayer,
  typed: string,
) => {
  const puzzle = puzzleOf(round);
  const play = await playOf(round, player);
  const before = progressOf(play);
  if (allFound(puzzle, before))
    return boardFor(round, before, "You've found every word today.");
  if (saving.has(play.id)) return boardFor(round, before);

  saving.add(play.id);
  try {
    let progress = before;
    let fc = 0;
    const lines: string[] = [];
    for (const guess of parseWords(typed).slice(0, 10)) {
      const word = guess.toUpperCase();
      const result = checkWord(puzzle, progress, guess);
      // A repeat of a word already found isn't a new guess.
      if (result.kind !== "already") progress = countGuesses(progress, 1);
      if (result.kind === "wrong")
        lines.push(`❌ **${word}** isn't one of the words.`);
      else if (result.kind === "already")
        lines.push(`☑️ **${word}** is already found.`);
      else {
        const found = findWord(progress, result.index);
        progress = found.progress;
        fc += found.fc;
        lines.push(`✅ **${word}** · +${found.fc} fc`);
      }
    }
    const solved =
      progress !== before
        ? await settle(round, play, player, progress, fc)
        : null;

    if (allFound(puzzle, progress) && !allFound(puzzle, before)) {
      lines.push(
        `🎉 That's every word: **${earned(puzzle, progress)} fc** in all.`,
      );
      if (solved)
        lines.push(
          `-# 🧪 On trial, so this wasn't posted. It would say: ${solved}`,
        );
    } else if (
      progress.found.length === puzzle.words.length - 1 &&
      before.found.length < puzzle.words.length - 1 &&
      canGuessThread(puzzle, progress)
    ) {
      lines.push("-# One word left - your last chance to guess the thread.");
    }
    return boardFor(round, progress, lines.join("\n"));
  } finally {
    saving.delete(play.id);
  }
};

/** The one guess at the thread, saved and paid. Returns the board to show. */
export const guessWeaveThread = async (
  round: WeaveRoundRecord,
  player: WeavePlayer,
  guess: string,
) => {
  const puzzle = puzzleOf(round);
  const play = await playOf(round, player);
  const before = progressOf(play);

  if (!canGuessThread(puzzle, before) || saving.has(play.id)) {
    return boardFor(
      round,
      before,
      before.threadGuess !== null
        ? "You've already made your guess at the thread."
        : "Every word's found, so the thread is spelled out - the chance to guess it has passed.",
    );
  }
  saving.add(play.id);
  try {
    const result = guessThread(puzzle, before, guess);
    await settle(round, play, player, result.progress, result.fc);
    return boardFor(
      round,
      result.progress,
      result.right
        ? `🧵 **${puzzle.thread.toUpperCase()}** is the thread! +${result.fc} fc.`
        : `🧵 **${guess.trim().toUpperCase()}** isn't the thread. The words still pay as you find them.`,
    );
  } finally {
    saving.delete(play.id);
  }
};
