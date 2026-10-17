import { continentOf } from "./continents";
import type { GeocodedGuess, GuessLevel, PlaceInfo } from "./geocode";
import { distanceKm, type LatLon } from "./score";

/**
 * How a guess is paid: a run of yes-or-no checks, each worth a set amount of
 * coin, then a bonus for how close a guess in the right town landed.
 *
 * - The two hemispheres are freebies, judged on their own.
 * - Continent, country, province and town are a ladder: each needs the one
 *   before it, and a guess only climbs as far as it named. "Japan" can earn
 *   the country, never the prefecture it happens to land in.
 *
 * No judgement calls: the same answer and guess always pay the same.
 */

export const PAY = {
  northSouth: 10,
  eastWest: 10,
  continent: 20,
  country: 30,
  province: 40,
  city: 60,
  /** The most the closeness bonus pays, for a guess on the spot. */
  closeness: 50,
} as const;

/**
 * A guess this close counts as the right town even when the names differ -
 * Tokyo's wards are towns of their own to OpenStreetMap, so a spot in Chiyoda
 * is not, by name, in "Tokyo". It also stands in for the town when the photo
 * was taken somewhere no town is named.
 */
const SAME_TOWN_KM = 10;
/** The closeness bonus halves roughly every 2 km. */
const CLOSENESS_FALLOFF_KM = 3;

export type Check = {
  kind: keyof typeof PAY;
  /** What was being checked, as the reveal says it: "Europe", "France". */
  label: string;
  /** Earned; missed; or never judged, because an earlier rung was missed or the guess didn't name this far. */
  outcome: "earned" | "missed" | "locked";
  fc: number;
  /** Why a check was missed or locked, for the reveal. */
  note?: string;
};

export type Verdict = {
  km: number;
  checks: Check[];
  /** The closeness bonus, when the town was right. */
  bonus: number;
  total: number;
};

export type JudgedAnswer = LatLon & { place: PlaceInfo };

const normalise = (name: string | undefined) =>
  name
    ?.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const sameName = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && normalise(a) === normalise(b);

const LEVELS: GuessLevel[] = ["country", "province", "city"];
const named = (guess: GeocodedGuess, level: GuessLevel) =>
  LEVELS.indexOf(guess.level) >= LEVELS.indexOf(level);

export const judgeGuess = (
  guess: GeocodedGuess,
  answer: JudgedAnswer,
): Verdict => {
  const km = distanceKm(guess, answer);
  const checks: Check[] = [];

  const north = answer.lat >= 0;
  checks.push({
    kind: "northSouth",
    label: north ? "Northern hemisphere" : "Southern hemisphere",
    outcome: guess.lat >= 0 === north ? "earned" : "missed",
    fc: PAY.northSouth,
  });
  const east = answer.lon >= 0;
  checks.push({
    kind: "eastWest",
    label: east ? "Eastern hemisphere" : "Western hemisphere",
    outcome: guess.lon >= 0 === east ? "earned" : "missed",
    fc: PAY.eastWest,
  });

  // The ladder. `climbing` turns false at the first rung missed.
  let climbing = true;
  const rung = (
    kind: Check["kind"],
    label: string,
    right: boolean,
    level: GuessLevel | null,
    missNote?: string,
  ) => {
    const fc = PAY[kind];
    if (!climbing) {
      checks.push({
        kind,
        label,
        outcome: "locked",
        fc,
        note: "needs the step before",
      });
      return;
    }
    if (level && !named(guess, level)) {
      climbing = false;
      checks.push({
        kind,
        label,
        outcome: "locked",
        fc,
        note: `your guess named a ${guess.level}, not a ${level === "city" ? "town" : level}`,
      });
      return;
    }
    if (!right) climbing = false;
    checks.push({
      kind,
      label,
      outcome: right ? "earned" : "missed",
      fc,
      note: right ? undefined : missNote,
    });
  };

  const answerContinent = continentOf(answer.place.countryCode);
  const guessContinent = continentOf(guess.place.countryCode);
  rung(
    "continent",
    answerContinent ?? "Continent",
    !!answerContinent && answerContinent === guessContinent,
    null,
    guessContinent ? `you said ${guessContinent}` : undefined,
  );

  rung(
    "country",
    answer.place.country ?? "Country",
    !!answer.place.countryCode &&
      answer.place.countryCode === guess.place.countryCode,
    "country",
    guess.place.country ? `you said ${guess.place.country}` : undefined,
  );

  // A country with no provinces (Singapore, Monaco) gives this rung away.
  const noProvinces = !answer.place.provinceCode && !answer.place.province;
  const sameProvince =
    noProvinces ||
    (answer.place.provinceCode && guess.place.provinceCode
      ? answer.place.provinceCode === guess.place.provinceCode
      : sameName(answer.place.province, guess.place.province));
  rung(
    "province",
    answer.place.province ?? "Province",
    sameProvince,
    noProvinces ? null : "province",
    guess.place.province ? `you said ${guess.place.province}` : undefined,
  );

  const sameTown =
    sameName(answer.place.city, guess.place.city) || km <= SAME_TOWN_KM;
  rung(
    "city",
    answer.place.city ?? "The town",
    sameTown,
    "city",
    guess.place.city ? `you said ${guess.place.city}` : undefined,
  );

  const townRight = checks.at(-1)?.outcome === "earned";
  const bonus = townRight
    ? Math.round(PAY.closeness * Math.exp(-km / CLOSENESS_FALLOFF_KM))
    : 0;
  const total =
    checks.reduce(
      (sum, check) => sum + (check.outcome === "earned" ? check.fc : 0),
      0,
    ) + bonus;

  return { km, checks, bonus, total };
};

/** The most a round can pay, before any photo multiplier. */
export const MAX_PAY = Object.values(PAY).reduce((sum, fc) => sum + fc, 0);

/**
 * A round that could only find one or two photos is harder to place, so it
 * pays more: everything a guess earns is multiplied by this.
 */
export const photoMultiplier = (photos: number): number =>
  photos >= 3 ? 1 : photos === 2 ? 1.5 : 2;
