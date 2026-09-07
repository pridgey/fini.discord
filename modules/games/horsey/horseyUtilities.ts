import { randomNumber } from "../../../utilities/randomNumber";

/**
 * The horse race behind /horsey.
 *
 * The race is simulated in full before anything is shown, then replayed as a
 * handful of frames. That ordering matters: the payout is decided by the
 * simulation, so a slow or rate-limited animation can never change who won, and
 * a failure part way through the replay costs the player nothing.
 *
 * Ported from the pre-slash-command `fini wager ... horsey` game, which was
 * commented out during the January 2024 migration and never brought across.
 * The rules are the ones it advertised; the payout maths and the two bugs
 * called out below are not.
 */

/** How many horses line up. Changing this changes the odds - see PAYOUTS. */
export const HORSE_COUNT = 5;

/** How far a horse has to travel to finish. Sets how long the race runs. */
export const TRACK_LENGTH = 24;

/** The most ground a horse can make up in a single step. */
const MAX_STEP = 3;

export type Horse = {
  /** 1-based, and what the player bets on. */
  id: number;
  /** Distance covered after each step, starting at 0. */
  positions: number[];
};

/**
 * What a finishing place returns, as a multiple of the stake staked.
 *
 * These are *total return*, not profit: 3 means the player ends up with three
 * times their stake, having already paid it in. Read that way the original
 * game's advertised payouts - "1st 3x, 2nd 1.5x, 3rd 0.5x" - come to a house
 * edge of exactly zero over five horses:
 *
 *   (3 + 1.5 + 0.5 + 0 + 0) / 5 = 1.0
 *
 * which is the same break-even footing /evenodd sits on. Read as profit
 * instead, the same numbers pay out 1.6x staked and the game prints money, so
 * the distinction is worth keeping in mind before tuning these.
 *
 * Ties share a place, so a dead heat for first pays both players 3x and the
 * race returns slightly more than it takes. Over five horses that is rare
 * enough to be a feature rather than a leak.
 */
export const PAYOUTS: Record<number, number> = {
  1: 3,
  2: 1.5,
  3: 0.5,
};

/**
 * Total return for a finishing place, as a multiple of the stake.
 * @param place 1-based finishing place
 * @returns The multiple of the stake returned, 0 for an unplaced horse
 */
export const payoutForPlace = (place: number): number => PAYOUTS[place] ?? 0;

/**
 * Runs a whole race and returns every horse's step-by-step progress.
 *
 * Every horse has an identical step distribution, so the race is fair and no
 * horse number is worth more than another.
 * @returns One entry per horse, each with the same number of recorded steps
 */
export const runRace = (): Horse[] => {
  const horses: Horse[] = Array.from({ length: HORSE_COUNT }, (_, index) => ({
    id: index + 1,
    positions: [0],
  }));

  // Step every horse together until at least one crosses the line, so all the
  // position arrays stay the same length and can be drawn frame by frame.
  while (horses.every((horse) => lastPosition(horse) < TRACK_LENGTH)) {
    for (const horse of horses) {
      const next = lastPosition(horse) + randomNumber(0, MAX_STEP, true);
      horse.positions.push(Math.min(next, TRACK_LENGTH));
    }
  }

  return horses;
};

/** How far a horse has got. */
const lastPosition = (horse: Horse): number =>
  horse.positions[horse.positions.length - 1];

/**
 * Finishing place for each horse, in the order the horses were given.
 *
 * Standard competition ranking: a tie for first leaves both on 1 and the next
 * horse on 3. Ties are common here because horses move in whole steps and the
 * race stops the moment anyone crosses, so several can arrive together.
 * @param horses A finished race
 * @returns 1-based places, parallel to `horses`
 */
export const rankHorses = (horses: Horse[]): number[] => {
  const finals = horses.map(lastPosition);

  return finals.map(
    (distance) => finals.filter((other) => other > distance).length + 1,
  );
};

/**
 * The place a given horse number finished in.
 *
 * Returns 0 for a horse that isn't in the race. The original returned *first
 * place* in that situation - `findIndex` gave -1, `-1 || 0` kept -1 because -1
 * is truthy, `rankings[-1]` was undefined, and `undefined || 0` landed on the
 * winner's index - so betting on a horse that did not exist paid 3x every time.
 * The command validates the range as well, but this must not be the thing
 * standing between a typo and the bank.
 * @param horses A finished race
 * @param horseId The horse the player backed
 * @returns The 1-based place, or 0 if no such horse ran
 */
export const placeOf = (horses: Horse[], horseId: number): number => {
  const index = horses.findIndex((horse) => horse.id === horseId);
  if (index === -1) return 0;

  return rankHorses(horses)[index];
};

/** Ordinal suffix for a place, so 1 reads as "1st" and 2 as "2nd". */
export const ordinal = (place: number): string => {
  // The original built this from a lookup keyed by rank *index* while printing
  // a rank *number*, and rendered second place as "1nd".
  const lastTwo = place % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${place}th`;

  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
};

/**
 * How much room a horse's name gets in the track.
 *
 * Names are padded to a fixed width so the starting gates line up; without
 * that, every lane begins at a different column and the field looks staggered
 * before the race has started. Kept short because the track sits in a code
 * block, which does not wrap - an over-wide line is unreadable on mobile.
 *
 * This is the whole label now that the horse number has gone, so a name gets
 * all twelve characters instead of the ten left over after "1 ".
 */
const LANE_LABEL_WIDTH = 12;

/**
 * Draws the track at one step of the race.
 * @param horses A finished race
 * @param step Which recorded step to draw
 * @param names Optional per-horse names; falls back to bare numbers
 * @returns A code block showing every lane
 */
export const drawTrack = (
  horses: Horse[],
  step: number,
  names?: string[],
): string => {
  const lanes = horses.map((horse) => {
    const position = horse.positions[Math.min(step, horse.positions.length - 1)];
    const behind = "=".repeat(position);
    const ahead = " ".repeat(Math.max(TRACK_LENGTH - position, 0));

    const name = names?.[horse.id - 1];
    const label = name
      ? name.slice(0, LANE_LABEL_WIDTH).padEnd(LANE_LABEL_WIDTH)
      : `${horse.id}`;

    return `${label} |${behind}🏇${ahead}|`;
  });

  return `\`\`\`\n${lanes.join("\n")}\n\`\`\``;
};

/**
 * Picks which steps to actually show.
 *
 * A race runs for anywhere between 8 and 30 steps, and animating every one of
 * them means that many edits to the same message - the original did exactly
 * that, one edit every 1.5 seconds, for up to 45 seconds a race. Discord rate
 * limits edits per message, so a handful of evenly spaced frames keeps the
 * drama without putting several concurrent races into the limiter.
 *
 * The last step is always included, because that is the one showing who won.
 * @param stepCount How many steps the race lasted
 * @param maxFrames The most frames to show
 * @returns Ascending, de-duplicated step indexes, always ending on the finish
 */
export const selectFrames = (stepCount: number, maxFrames: number): number[] => {
  const lastStep = Math.max(stepCount - 1, 0);
  if (maxFrames <= 1 || lastStep === 0) return [lastStep];

  const frames = Array.from({ length: maxFrames }, (_, index) =>
    Math.round((index * lastStep) / (maxFrames - 1)),
  );

  return Array.from(new Set(frames)).sort((a, b) => a - b);
};
