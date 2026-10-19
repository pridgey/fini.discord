/**
 * Reel's rules, apart from Discord and the database.
 *
 * A film is shown one frame at a time, five in all. Each wrong guess or skip
 * shows the next; a right one ends the round and pays for how few frames it
 * took. Five misses and the round is over with nothing paid.
 */

/** The frames a round has, and the most a player can see. */
export const FRAMES = 5;

/** What a right guess pays on frame 1, 2, 3, 4 and 5. */
export const FRAME_PAY = [30, 25, 20, 10, 5] as const;

export const MAX_FC = FRAME_PAY[0];

/** A film as TMDB names it: enough to say which one a guess matched. */
export type Film = { movieId: number; title: string; year: string };

export type Turn = ({ kind: "guess" } & Film) | { kind: "skip" };

/** A player's go so far: each guess or skip, oldest first. */
export type ReelProgress = { turns: Turn[] };

export const NO_PROGRESS: ReelProgress = { turns: [] };

/** "Interstellar (2014)", or the bare title for a film with no date. */
export const filmName = (film: Pick<Film, "title" | "year">): string =>
  film.year ? `${film.title} (${film.year})` : film.title;

/** The turn that guessed `answer`, by its place in the round; -1 if none did. */
const rightTurn = (answerId: number, progress: ReelProgress): number =>
  progress.turns.findIndex(
    (turn) => turn.kind === "guess" && turn.movieId === answerId,
  );

export const solved = (answerId: number, progress: ReelProgress): boolean =>
  rightTurn(answerId, progress) !== -1;

export const finished = (answerId: number, progress: ReelProgress): boolean =>
  solved(answerId, progress) || progress.turns.length >= FRAMES;

/** The frames on show: one more per miss, all of them once the round is over. */
export const framesShown = (
  answerId: number,
  progress: ReelProgress,
): number => {
  if (finished(answerId, progress)) return FRAMES;
  return Math.min(progress.turns.length + 1, FRAMES);
};

/** What a right guess would pay now, on the frame being shown. */
export const payNow = (progress: ReelProgress): number =>
  FRAME_PAY[Math.min(progress.turns.length, FRAMES - 1)];

/** What the round paid: the frame it was solved on, or nothing. */
export const earned = (answerId: number, progress: ReelProgress): number => {
  const turn = rightTurn(answerId, progress);
  return turn === -1 ? 0 : FRAME_PAY[turn];
};

/** The frame a round was solved on, 1-based; null if it wasn't. */
export const solvedOn = (
  answerId: number,
  progress: ReelProgress,
): number | null => {
  const turn = rightTurn(answerId, progress);
  return turn === -1 ? null : turn + 1;
};

export type TurnResult =
  | { kind: "over" }
  | { kind: "repeat"; film: Film }
  | { kind: "right"; progress: ReelProgress; fc: number }
  | { kind: "wrong"; progress: ReelProgress }
  | { kind: "skipped"; progress: ReelProgress };

/**
 * A guess at the film, already matched to one. Guessing a film a second time
 * isn't a turn: it was wrong the first time, and costing a frame for it would
 * only punish a slip.
 */
export const guess = (
  answerId: number,
  progress: ReelProgress,
  film: Film,
): TurnResult => {
  if (finished(answerId, progress)) return { kind: "over" };
  const repeat = progress.turns.some(
    (turn) => turn.kind === "guess" && turn.movieId === film.movieId,
  );
  if (repeat) return { kind: "repeat", film };
  const next: ReelProgress = {
    turns: [...progress.turns, { kind: "guess", ...film }],
  };
  return film.movieId === answerId
    ? { kind: "right", progress: next, fc: earned(answerId, next) }
    : { kind: "wrong", progress: next };
};

/** Gives up on a frame for the next one. */
export const skip = (answerId: number, progress: ReelProgress): TurnResult =>
  finished(answerId, progress)
    ? { kind: "over" }
    : {
        kind: "skipped",
        progress: { turns: [...progress.turns, { kind: "skip" }] },
      };
