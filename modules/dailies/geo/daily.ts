import { ButtonStyle } from "discord.js";
import { addCoin } from "../../finicoin";
import {
  createRound,
  dayKey,
  factsOf,
  findGuess,
  getRound,
  roundPhotos,
  saveGuess,
  type DailyRoundRecord,
} from "./dailyStore";
import { describePlace, type GeocodedGuess, type PlaceInfo } from "./geocode";
import { findRound, type GeoRound } from "./imagery";
import {
  button,
  guessView,
  pastRevealView,
  photoFiles,
  revealView,
  roundIntro,
  row,
  scoreGuess,
} from "./messages";
import { formatDistance } from "./score";
import { POST_TIME, currentDay } from "../shared";
import { warnAndUse } from "../../../utilities/fallback";

/**
 * The daily location game. Each day at noon a round is made and goes up in the
 * daily post (`../post.ts`). Anyone may guess once per round per server; a
 * guess is judged and paid the moment it's locked in, and the post's live line
 * shows how the server is doing.
 */

export const DAILY_BUTTON = "geodaily";
export const DAILY_MODAL = "geodaily_guess";

export { POST_HOUR, currentDay } from "../shared";

const ids = (roundId: string) => ({
  guess: `${DAILY_BUTTON}:guess:${roundId}`,
  lock: `${DAILY_BUTTON}:lock:${roundId}`,
  retry: `${DAILY_BUTTON}:retry:${roundId}`,
});

export const modalId = (roundId: string, mode: "new" | "edit") =>
  `${DAILY_MODAL}:${roundId}:${mode}`;

/** Rounds tried before giving up for this minute, when a spot can't be named. */
const ROUND_TRIES = 3;

/** Makes a round whose spot is named down to its town, or null. */
const makeRound = async (): Promise<{
  round: GeoRound;
  place: PlaceInfo;
} | null> => {
  for (let attempt = 0; attempt < ROUND_TRIES; attempt++) {
    const round = await findRound();
    if (!round) return null;
    const place = await describePlace(round.answer).catch(
      warnAndUse(null, "name the round's place"),
    );
    if (place?.countryCode) return { round, place };
  }
  return null;
};

/** Today's round, made and saved if it doesn't exist yet. */
export const ensureTodaysRound = async (): Promise<DailyRoundRecord | null> => {
  const day = dayKey();
  const existing = await getRound(day);
  if (existing) return existing;

  const made = await makeRound();
  if (!made) return null;
  // Two makers racing for the day: the unique index keeps the first.
  return createRound(day, made.round, made.place).catch(() => getRound(day));
};

/** A player's round: the photos, the prize, and the button to guess. */
export const roundPost = (round: DailyRoundRecord, photos: Buffer[]) => ({
  content: [
    ...roundIntro(round.photos.length),
    `-# One guess each until the next round, tomorrow at ${POST_TIME}.`,
  ].join("\n"),
  files: photoFiles(photos),
  components: [
    row(button(ids(round.id).guess, "Make a guess", ButtonStyle.Primary, "📍")),
  ],
});

/* ------------------------------------------------------------- guessing */

/** Guesses waiting on Lock in, by round, server and player. A restart drops them. */
const pending = new Map<string, GeocodedGuess>();
const locking = new Set<string>();
const key = (roundId: string, serverId: string, userId: string) =>
  `${roundId}:${serverId}:${userId}`;

export const holdDailyGuess = (
  roundId: string,
  serverId: string,
  userId: string,
  guess: GeocodedGuess,
) => pending.set(key(roundId, serverId, userId), guess);

export const dailyGuessView = (roundId: string, guess: GeocodedGuess) => {
  const { lock, retry } = ids(roundId);
  return guessView(guess, { lock, retry });
};

/**
 * Why a player can't guess at this round now, or null if they can: it isn't
 * today's round any more, or they've played it.
 */
export const cannotGuess = async (
  round: DailyRoundRecord | null,
  serverId: string,
  userId: string,
): Promise<string | null> => {
  if (!round)
    return "That round is gone. The current one is up with `/daily geo`.";
  if (round.day !== currentDay())
    return "That round is over. The current one is up with `/daily geo`.";
  const played = await findGuess(round.id, serverId, userId);
  if (played) {
    return `You've played this round: **${played.total} fc**, ${formatDistance(played.km)} away. The next one is up at ${POST_TIME}.`;
  }
  return null;
};

/**
 * A player's result for the current round shown again, if they've played it:
 * the map, each check and what it paid, as when they locked in.
 */
export const playedResult = async (
  round: DailyRoundRecord | null,
  serverId: string,
  userId: string,
) => {
  if (!round || round.day !== currentDay()) return null;
  const played = await findGuess(round.id, serverId, userId);
  if (!played) return null;
  const view = await pastRevealView(factsOf(round), round.place, {
    lat: played.guess_lat,
    lon: played.guess_lon,
    label: played.label,
    km: played.km,
    total: played.total,
    checks: played.checks ?? [],
  });
  return {
    ...view,
    content: `${view.content}\n-# You've played this round. The next one is up at ${POST_TIME}.`,
  };
};

export type Player = {
  serverId: string;
  serverName: string;
  userId: string;
  /** For the bank record. */
  username: string;
  /** For the announcement and the leaderboard. */
  displayName: string;
};

/**
 * Locks in a pending guess: judges it, saves it and pays it. Returns the
 * player's reveal, or why it couldn't be locked.
 */
export const lockDailyGuess = async (
  round: DailyRoundRecord,
  player: Player,
): Promise<
  { reveal: Awaited<ReturnType<typeof revealView>> } | { refusal: string }
> => {
  const k = key(round.id, player.serverId, player.userId);
  const guess = pending.get(k);
  if (!guess)
    return {
      refusal:
        "That guess has expired. Make it again with the button on the round.",
    };
  if (locking.has(k)) return { refusal: "Still locking in your guess." };

  locking.add(k);
  try {
    const refusal = await cannotGuess(round, player.serverId, player.userId);
    if (refusal) return { refusal };

    const facts = factsOf(round);
    const scored = scoreGuess(facts, round.place, guess);
    const saved = await saveGuess({
      round: round.id,
      server_id: player.serverId,
      user_id: player.userId,
      username: player.displayName,
      guess: guess.label,
      label: guess.label,
      guess_lat: guess.lat,
      guess_lon: guess.lon,
      km: Math.round(scored.verdict.km * 1000) / 1000,
      total: scored.total,
      checks: scored.verdict.checks,
    });
    if (!saved) return { refusal: "You've already played this round." };
    pending.delete(k);

    if (scored.total > 0) {
      await addCoin(
        player.userId,
        player.serverId,
        scored.total,
        player.username,
        player.serverName,
        "Reserve",
      );
    }

    return {
      reveal: await revealView(facts, round.place, guess, scored, {
        paid: true,
      }),
    };
  } finally {
    locking.delete(k);
  }
};

/** The current round for one player, privately: the post again, or what they scored. */
export const todaysRoundFor = async (serverId: string, userId: string) => {
  const round = await getRound(currentDay());
  if (!round) {
    return {
      content: `There's no round up right now. The next one posts at ${POST_TIME}.`,
    };
  }
  const result = await playedResult(round, serverId, userId);
  if (result) return result;
  const refusal = await cannotGuess(round, serverId, userId);
  if (refusal) return { content: refusal };
  return roundPost(round, await roundPhotos(round));
};
