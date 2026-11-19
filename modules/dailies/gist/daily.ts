import { addCoin } from "../../finicoin";
import { currentDay, dayKey } from "../shared";
import type { WeavePlayer } from "../weave/daily";
import { buildGistBoard, type Note } from "./board";
import {
  WRONG_SOLVE_COST,
  callLetter,
  canCall,
  currentPrices,
  earned,
  expectedKeep,
  finished,
  giveUp,
  hits,
  inBand,
  lettersCalled,
  potOf,
  priceOf,
  solve,
  statusOf,
  type GistProgress,
} from "./game";
import { GIST_PHRASES, type Phrase } from "./phrases";
import {
  createGistRound,
  getGistRound,
  getGistRoundById,
  openGistPlay,
  phrasesUsed,
  progressOf,
  puzzleOf,
  saveGistProgress,
  type GistPlayRecord,
  type GistRoundRecord,
} from "./store";

/**
 * Gist, the daily phrase game. At noon a phrase goes up in the daily post
 * (`../post.ts`); each player opens a private board, buys letters from a pot
 * that starts at 75 fc, and keeps what's left when they solve it.
 */

/**
 * Live since 2026-11-18. Off puts it back on trial: it isn't in the daily
 * post, only the bot admin can play it (`/daily gist`), and nothing is paid.
 */
export const GIST_LIVE = true;

/** Who's playing: the same as Weave's. */
export type GistPlayer = WeavePlayer;

/**
 * A phrase for the day. Never one already used while there's one that
 * hasn't been, and inside the difficulty band when one is left there; once
 * every phrase has been used, the one used longest ago comes back.
 */
export const choosePhrase = (
  used: Map<string, string>,
  phrases: Phrase[] = GIST_PHRASES,
  random: () => number = Math.random,
): Phrase => {
  const fresh = phrases.filter((p) => !used.has(p.text));
  const pool = fresh.filter(inBand).length
    ? fresh.filter(inBand)
    : fresh.length
      ? fresh
      : [];
  if (pool.length) return pool[Math.floor(random() * pool.length)];

  const oldest = [...phrases].sort((a, b) =>
    (used.get(a.text) ?? "").localeCompare(used.get(b.text) ?? ""),
  );
  return oldest.find(inBand) ?? oldest[0];
};

/** Today's phrase, chosen and saved if it doesn't exist yet. */
export const ensureTodaysGist = async (): Promise<GistRoundRecord> => {
  const day = dayKey();
  const existing = await getGistRound(day);
  if (existing) return existing;
  const phrase = choosePhrase(await phrasesUsed());
  const prices = currentPrices();
  // Two makers racing for the day: the unique index keeps the first.
  return createGistRound({
    day,
    ...phrase,
    prices,
    difficulty: expectedKeep(phrase, prices),
  }).catch(async (error) => {
    const raced = await getGistRound(day);
    if (raced) return raced;
    throw error;
  });
};

/* ------------------------------------------------------------- playing */

/** The round a button names, if it's still the one being played; otherwise why not. */
export const playableGist = async (
  roundId: string,
): Promise<{ round: GistRoundRecord } | { refusal: string }> => {
  const round = await getGistRoundById(roundId);
  if (!round)
    return { refusal: "That Gist is gone. Today's is up with `/daily gist`." };
  if (round.day !== currentDay())
    return { refusal: "That Gist is over. Today's is up with `/daily gist`." };
  return { round };
};

/** Boards being saved, by play: a second press while one saves is let go. */
const saving = new Set<string>();

const playOf = (round: GistRoundRecord, player: GistPlayer) =>
  openGistPlay(round.id, player.serverId, player.userId, player.displayName);

const boardFor = (
  round: GistRoundRecord,
  progress: GistProgress,
  note?: Note,
  highlight?: string,
) =>
  buildGistBoard({
    roundId: round.id,
    puzzle: puzzleOf(round),
    progress,
    note,
    highlight,
    trial: !GIST_LIVE,
  });

/** A player's board as it stands, made the first time they open it. */
export const openGist = async (round: GistRoundRecord, player: GistPlayer) =>
  boardFor(round, progressOf(await playOf(round, player)));

/** A board solved just now, for the daily post's announcement. */
export type GistSolve = { fc: number; letters: number };

/** Saves a move, and pays a solve when Gist is live. */
const settle = async (
  play: GistPlayRecord,
  player: GistPlayer,
  progress: GistProgress,
) => {
  const fc = earned(progress);
  await saveGistProgress(play.id, progress, {
    paid: GIST_LIVE ? fc : 0,
    solved: statusOf(progress) === "solved",
    finished: finished(progress),
  });
  if (GIST_LIVE && fc > 0) {
    await addCoin(
      player.userId,
      player.serverId,
      fc,
      player.username,
      player.serverName,
      "Reserve",
    );
  }
};

type Turn = {
  progress: GistProgress;
  note?: Note;
  highlight?: string;
};

/** Runs one move: saved, paid, and the board redrawn with what it did. */
const takeTurn = async (
  round: GistRoundRecord,
  player: GistPlayer,
  move: (progress: GistProgress) => Turn,
): Promise<{
  board: Awaited<ReturnType<typeof boardFor>>;
  solve: GistSolve | null;
}> => {
  const play = await playOf(round, player);
  const before = progressOf(play);
  if (finished(before) || saving.has(play.id))
    return { board: await boardFor(round, before), solve: null };
  saving.add(play.id);
  try {
    const turn = move(before);
    if (turn.progress !== before) await settle(play, player, turn.progress);
    const solve =
      GIST_LIVE && statusOf(turn.progress) === "solved"
        ? { fc: earned(turn.progress), letters: lettersCalled(turn.progress) }
        : null;
    return {
      board: await boardFor(round, turn.progress, turn.note, turn.highlight),
      solve,
    };
  } finally {
    saving.delete(play.id);
  }
};

/** Calls a consonant or buys a vowel. */
export const callGistLetter = (
  round: GistRoundRecord,
  player: GistPlayer,
  letter: string,
) =>
  takeTurn(round, player, (progress) => {
    const puzzle = puzzleOf(round);
    // A stale dropdown: already called, or no longer affordable.
    if (!canCall(puzzle, progress, letter)) return { progress };
    const found = hits(puzzle, letter);
    const price = `-# ${priceOf(puzzle, letter)} fc`;
    return {
      progress: callLetter(puzzle, progress, letter),
      highlight: letter,
      note: found
        ? {
            text: `✅ **${letter}** shows ${found === 1 ? "once" : `${found} times`}\n${price}`,
            tone: "right",
          }
        : { text: `❌ No **${letter}**\n${price}`, tone: "wrong" },
    };
  });

/** A typed solve: free if it can't fit the board, costly if it fits but is wrong. */
export const solveGist = (
  round: GistRoundRecord,
  player: GistPlayer,
  typed: string,
) =>
  takeTurn(round, player, (before) => {
    const puzzle = puzzleOf(round);
    const { progress, result } = solve(puzzle, before, typed);
    const shown = typed.trim();
    if (result === "correct") {
      return {
        progress,
        note: {
          text: `🎉 It's **${puzzle.text}**! **+${earned(progress)} fc**${GIST_LIVE ? "" : " (on trial, so not paid)"}`,
          tone: "right",
        },
      };
    }
    if (result === "wrong") {
      return {
        progress,
        note: {
          text:
            statusOf(progress) === "broke"
              ? `❌ It isn't **${shown}**, and that emptied the pot. It was **${puzzle.text}**.`
              : `❌ It isn't **${shown}**\n-# ${WRONG_SOLVE_COST} fc`,
          tone: "wrong",
        },
      };
    }
    return {
      progress,
      note: {
        text: `🤔 **${shown}** doesn't fit the board\n-# Free: it can't be the answer, so it didn't count.`,
        tone: "neutral",
      },
    };
  });

/** Ends the board and shows the phrase. */
export const giveUpGist = (round: GistRoundRecord, player: GistPlayer) =>
  takeTurn(round, player, (progress) => ({
    progress: giveUp(progress),
    note: {
      text: `🏳️ It was **${round.text}**. You'd kept **${potOf(progress)} fc** of the pot.`,
      tone: "neutral",
    },
  }));
