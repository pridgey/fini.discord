import { ButtonStyle } from "discord.js";
import { describePlace, type GeocodedGuess, type PlaceInfo } from "./geocode";
import { findRound, type GeoRound } from "./imagery";
import {
  button,
  guessModal as sharedGuessModal,
  guessView,
  photoFiles,
  revealView,
  roundIntro,
  row,
  scoreGuess,
  type RoundFacts,
} from "./messages";

/**
 * The `/geo-test` prototype: one private round at a time, held in memory, so a
 * restart forgets it. The real daily will keep its round and every player's
 * guess in Pocketbase, and post the round in public.
 */

export const GEO_BUTTON = "geotest";
export const GEO_MODAL = "geotest_guess";

type TestRound = { round: GeoRound; place: PlaceInfo; pending?: GeocodedGuess };
const rounds = new Map<string, TestRound>();

export const roundFor = (userId: string) => rounds.get(userId);

/** Rounds tried before giving up, when a spot can't be named (out at sea, say). */
const ROUND_TRIES = 3;

/** A round whose spot is named down to its town, so every check can be judged. */
export const startRound = async (userId: string): Promise<GeoRound | null> => {
  for (let attempt = 0; attempt < ROUND_TRIES; attempt++) {
    const round = await findRound();
    if (!round) return null;
    const place = await describePlace(round.answer).catch(() => null);
    if (!place?.countryCode) continue;
    rounds.set(userId, { round, place });
    return round;
  }
  return null;
};

/** Forgets the round once its answer has been shown. */
export const endRound = (userId: string) => rounds.delete(userId);

export const holdGuess = (userId: string, guess: GeocodedGuess) => {
  const current = rounds.get(userId);
  if (current) current.pending = guess;
};

const id = (action: string) => `${GEO_BUTTON}:${action}`;

/** The box a guess is typed into. `edit` replaces the guess on screen; `new` adds one. */
export const guessModal = (mode: "new" | "edit") => sharedGuessModal(`${GEO_MODAL}:${mode}`);

const factsOf = (round: GeoRound): RoundFacts => ({
  answer: round.answer,
  photoCount: round.photos.length,
  credit: round.credit,
  source: round.source,
  license: round.license,
});

/** The round's photos, with a button to guess. */
export const roundMessage = (round: GeoRound) => ({
  content: [
    ...roundIntro(round.photos.length),
    "-# Test round: only you can see it, and nothing is paid. Guess with the button or `/geo-test guess`.",
  ].join("\n"),
  files: photoFiles(round.photos),
  components: [row(button(id("guess"), "Make a guess", ButtonStyle.Primary, "📍"))],
});

/** Where the bot understood the guess to be, to lock in or redo. */
export const guessMessage = (guess: GeocodedGuess) =>
  guessView(guess, { lock: id("lock"), retry: id("retry") });

/** The answer beside the guess, each check, and what it would have paid. */
export const revealMessage = async (round: GeoRound, place: PlaceInfo, guess: GeocodedGuess) => {
  const facts = factsOf(round);
  const view = await revealView(facts, place, guess, scoreGuess(facts, place, guess), { paid: false });
  return {
    ...view,
    components: [row(button(id("new"), "New round", ButtonStyle.Primary, "🌍"))],
  };
};
