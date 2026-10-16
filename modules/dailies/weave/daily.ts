import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, Client } from "discord.js";
import { addCoin } from "../../finicoin";
import { getBotChannelForServer } from "../../../utilities/config/configUtils";
import { POST_HOUR, POST_TIME, currentDay, dayKey, previousDay, sendTo } from "../shared";
import { buildBoard, buttonId } from "./board";
import { WEAVE_IMAGE, renderWeaveBoard } from "./render";
import {
  MAX_FC,
  NO_PROGRESS,
  allFound,
  canGuessThread,
  checkWord,
  earned,
  findWord,
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
  recordWeavePost,
  saveWeaveProgress,
  weavePlaysFor,
  type WeavePlayRecord,
  type WeaveRoundRecord,
} from "./store";

/**
 * Weave, the daily word puzzle. At noon a puzzle goes up in every server's bot
 * channel, after yesterday's answers; each player opens a private board on it,
 * and is paid for every word the moment they find it. Finishing - every word
 * found, and the thread guessed - is announced in the channel.
 */

/**
 * Off while Weave is being tried out: it isn't posted, only the bot admin can
 * play it (`/daily weave`), and boards pay nothing and announce nothing.
 * Turning it on is all it takes to go live.
 */
export const WEAVE_LIVE = false;

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

/** The public post: the grid, the prize, and a button that opens a board. */
export const weavePost = async (round: WeaveRoundRecord) => ({
  content: [
    "🧵 **Today's Weave**",
    "",
    "Five hidden words use every letter once, each running up, down, left or right. Their first letters, in some order, spell a sixth word: the thread.",
    "",
    `🪙 Up to **${MAX_FC} fc**: 5 a word, 3 if you took its hint, 15 for the thread.`,
    "",
    `-# Press **My board** to play. Your board is your own and saves as you go, until the next Weave at ${POST_TIME}.`,
  ].join("\n"),
  files: [
    new AttachmentBuilder(await renderWeaveBoard({ puzzle: puzzleOf(round), progress: NO_PROGRESS }), {
      name: WEAVE_IMAGE,
    }),
  ],
  components: [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buttonId(round.id, "open"))
        .setLabel("My board")
        .setEmoji("🧵")
        .setStyle(ButtonStyle.Primary),
    ),
  ],
});

const MEDALS = ["🥇", "🥈", "🥉"];

/** Yesterday's answers, and who did what. */
export const weaveResultsText = (round: WeaveRoundRecord, plays: WeavePlayRecord[]): string => {
  const puzzle = puzzleOf(round);
  const played = plays.filter((play) => (play.found ?? []).length > 0 || play.thread_guess);
  const lines = played.slice(0, 10).map((play, i) => {
    const progress = progressOf(play);
    const thread = progress.threadGuess === null ? "" : progress.threadGuess === puzzle.thread ? " · thread ✅" : " · thread ❌";
    return `${MEDALS[i] ?? "▫️"} **${play.username}** · ${earned(puzzle, progress)} fc · ${progress.found.length}/${puzzle.words.length} words${thread}`;
  });
  return [
    `🧵 **Yesterday's Weave** - the thread was **${puzzle.thread.toUpperCase()}**: ${puzzle.words
      .map((word) => word.word.toUpperCase())
      .join(", ")}.`,
    "",
    ...(lines.length > 0 ? lines : ["Nobody played it."]),
    ...(played.length > lines.length ? [`-# …and ${played.length - lines.length} more`] : []),
  ].join("\n");
};

/** The answers as a post: the text, and the grid with every word drawn in. */
export const weaveResultsPost = async (round: WeaveRoundRecord, plays: WeavePlayRecord[]) => ({
  content: weaveResultsText(round, plays),
  files: [
    new AttachmentBuilder(
      await renderWeaveBoard({ puzzle: puzzleOf(round), progress: NO_PROGRESS, reveal: true }),
      { name: WEAVE_IMAGE },
    ),
  ],
});

/**
 * Posts today's Weave in every server with a bot channel that hasn't had it,
 * yesterday's answers first. Safe to run every minute.
 */
export const postWeave = async (cl: Client): Promise<number> => {
  const round = await ensureTodaysWeave();
  const yesterday = await getWeaveRound(previousDay(round.day)).catch(() => null);
  let posted = 0;

  for (const guild of cl.guilds.cache.values()) {
    if (round.posts?.[guild.id]) continue;
    const channelId = await getBotChannelForServer(guild.id);
    if (!channelId) continue;

    if (yesterday?.posts?.[guild.id]) {
      const plays = await weavePlaysFor(yesterday.id, guild.id).catch(() => []);
      await sendTo(cl, channelId, await weaveResultsPost(yesterday, plays));
    }

    const message = await sendTo(cl, channelId, await weavePost(round));
    if (message) {
      await recordWeavePost(round.id, guild.id, { channelId, messageId: message.id });
      round.posts = { ...(round.posts ?? {}), [guild.id]: { channelId, messageId: message.id } };
      posted++;
    }
  }
  return posted;
};

let running = false;

/** The polling loop's hook: from POST_HOUR on, make sure today's Weave is out. */
export const runWeaveDaily = async (cl: Client) => {
  if (!WEAVE_LIVE || running || new Date().getHours() < POST_HOUR) return;
  running = true;
  try {
    const posted = await postWeave(cl);
    if (posted) console.log(`🧵 Weave posted in ${posted} server(s)`);
  } catch (error) {
    console.error("Weave: posting failed", error);
  } finally {
    running = false;
  }
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
  if (!round) return { refusal: "That Weave is gone. Today's is up with `/daily weave`." };
  if (round.day !== currentDay()) return { refusal: "That Weave is over. Today's is up with `/daily weave`." };
  return { round };
};

/** Boards being saved, by play: a second press while one saves is let go. */
const saving = new Set<string>();

/**
 * Pays what a save added and, the first time a board is finished, says so in
 * the round's channel.
 */
const settle = async (
  cl: Client,
  round: WeaveRoundRecord,
  play: WeavePlayRecord,
  player: WeavePlayer,
  progress: ReturnType<typeof progressOf>,
  fc: number,
  fallbackChannelId: string | null,
) => {
  const puzzle = puzzleOf(round);
  const done = finished(puzzle, progress);
  await saveWeaveProgress(play.id, progress, earned(puzzle, progress), done || play.finished);
  // On trial: nothing paid, nothing said in the channel.
  if (!WEAVE_LIVE) return;
  if (fc > 0) {
    await addCoin(player.userId, player.serverId, fc, player.username, player.serverName, "Reserve");
  }
  if (done && !play.finished) {
    const channelId = round.posts?.[player.serverId]?.channelId ?? fallbackChannelId;
    if (channelId) {
      const thread =
        progress.threadGuess === puzzle.thread ? "thread ✅" : progress.threadGuess ? "thread ❌" : "thread not guessed";
      await sendTo(
        cl,
        channelId,
        `🧵 **${player.displayName}** finished today's Weave: ${progress.found.length}/${puzzle.words.length} words, ${thread} · **${earned(puzzle, progress)} fc**`,
      );
    }
  }
};

/** A board, as the player will see it. */
const boardFor = (round: WeaveRoundRecord, progress: ReturnType<typeof progressOf>, note?: string) =>
  buildBoard({ roundId: round.id, puzzle: puzzleOf(round), progress, note, trial: !WEAVE_LIVE });

const playOf = (round: WeaveRoundRecord, player: WeavePlayer) =>
  openWeavePlay(round.id, player.serverId, player.userId, player.displayName);

/** A player's board as it stands, made the first time they open it. */
export const openWeave = async (round: WeaveRoundRecord, player: WeavePlayer) =>
  boardFor(round, progressOf(await playOf(round, player)));

/** Lights the first letter of the next unfound word. */
export const hintWeave = async (cl: Client, round: WeaveRoundRecord, player: WeavePlayer) => {
  const puzzle = puzzleOf(round);
  const play = await playOf(round, player);
  const before = progressOf(play);
  if (nextHint(puzzle, before) === null || saving.has(play.id)) return boardFor(round, before);
  saving.add(play.id);
  try {
    const progress = takeHint(puzzle, before);
    await settle(cl, round, play, player, progress, 0, null);
    return boardFor(round, progress, "💡 A word's first letter is ringed. Finding that word pays 3 fc.");
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
  cl: Client,
  round: WeaveRoundRecord,
  player: WeavePlayer,
  typed: string,
  fallbackChannelId: string | null,
) => {
  const puzzle = puzzleOf(round);
  const play = await playOf(round, player);
  const before = progressOf(play);
  if (allFound(puzzle, before)) return boardFor(round, before, "You've found every word today.");
  if (saving.has(play.id)) return boardFor(round, before);

  saving.add(play.id);
  try {
    let progress = before;
    let fc = 0;
    const lines: string[] = [];
    for (const guess of parseWords(typed).slice(0, 10)) {
      const word = guess.toUpperCase();
      const result = checkWord(puzzle, progress, guess);
      if (result.kind === "wrong") lines.push(`❌ **${word}** isn't one of the words.`);
      else if (result.kind === "already") lines.push(`☑️ **${word}** is already found.`);
      else {
        const found = findWord(progress, result.index);
        progress = found.progress;
        fc += found.fc;
        lines.push(`✅ **${word}** · +${found.fc} fc`);
      }
    }
    if (progress !== before) await settle(cl, round, play, player, progress, fc, fallbackChannelId);

    if (allFound(puzzle, progress) && !allFound(puzzle, before)) {
      lines.push(`🎉 That's every word: **${earned(puzzle, progress)} fc** in all.`);
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
  cl: Client,
  round: WeaveRoundRecord,
  player: WeavePlayer,
  guess: string,
  fallbackChannelId: string | null,
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
    await settle(cl, round, play, player, result.progress, result.fc, fallbackChannelId);
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
