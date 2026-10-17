/**
 * How much a round's photos give away, from what Mapillary detected in them.
 * Mapillary runs object detection over every photo it hosts and serves the
 * results free: `GET /{image_id}/detections` lists values such as
 * "object--sign--store" or "regulatory--no-entry--g1".
 *
 * What makes a place guessable is mostly writing and country-specific design,
 * so those count most: shop signs and billboards carry language and names;
 * traffic signs differ country to country; street furniture hints more faintly.
 * https://www.mapillary.com/developer/api-documentation#detection
 */

/** Weight per detected thing, by the start of its value. First match wins. */
const CLUE_WEIGHTS: [prefix: string, weight: number][] = [
  // Writing: names, language, phone numbers
  ["object--sign--store", 2],
  ["object--sign--advertisement", 2],
  ["object--sign--information", 2],
  ["object--billboard", 2],
  ["object--banner", 2],
  ["information--", 2],
  ["object--traffic-sign--direction", 2],
  // Traffic signs, whose shapes and colours differ by country
  ["regulatory--", 1.5],
  ["warning--", 1.5],
  ["complementary--", 1.5],
  ["object--traffic-sign--front", 1],
  // Street furniture: weaker, but a seasoned player reads poles and bollards
  ["object--support--utility-pole", 0.5],
  ["object--traffic-light", 0.5],
  ["object--street-light", 0.5],
  ["object--fire-hydrant", 0.5],
  ["object--junction-box", 0.5],
  ["object--bike-rack", 0.5],
  ["object--phone-booth", 0.5],
  ["object--mailbox", 0.5],
  ["marking--", 0.25],
  ["object--traffic-sign--back", 0.25],
];

/** One kind of thing counts at most this many times; ten street lights are not ten clues. */
const MAX_PER_KIND = 3;

/**
 * The most a whole group can add. Road paint and street furniture turn up in
 * every street photo, and across three photos the many kinds of each would
 * otherwise rate an ordinary road as easy as one lined with shop signs.
 */
const GROUP_CAPS: [prefix: string, cap: number][] = [
  ["marking--", 1],
  ["object--support--", 2],
  ["object--traffic-light", 2],
  ["object--street-light", 2],
  ["object--fire-hydrant", 2],
  ["object--junction-box", 2],
  ["object--bike-rack", 2],
  ["object--phone-booth", 2],
  ["object--mailbox", 2],
  ["object--traffic-sign--back", 2],
];
/** The furniture groups share one cap between them, as well as their own. */
const FURNITURE_CAP = 2;
const FURNITURE = GROUP_CAPS.filter(([prefix]) =>
  prefix.startsWith("object--"),
).map(([prefix]) => prefix);

const weightOf = (value: string): number =>
  CLUE_WEIGHTS.find(([prefix]) => value.startsWith(prefix))?.[1] ?? 0;

/** The clue score of everything detected across a round's photos. */
export const clueScore = (values: string[]): number => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = new Map<string, number>();
  let score = 0;
  for (const [value, count] of counts) {
    const weight = weightOf(value) * Math.min(count, MAX_PER_KIND);
    const group = GROUP_CAPS.find(([prefix]) => value.startsWith(prefix));
    if (!group) {
      score += weight;
      continue;
    }
    groups.set(group[0], (groups.get(group[0]) ?? 0) + weight);
  }
  let furniture = 0;
  for (const [prefix, cap] of GROUP_CAPS) {
    const capped = Math.min(groups.get(prefix) ?? 0, cap);
    if (FURNITURE.includes(prefix)) furniture += capped;
    else score += capped;
  }
  score += Math.min(furniture, FURNITURE_CAP);
  return Math.round(score * 100) / 100;
};

/**
 * Below this a round has nothing to go on, and is not used. Street furniture
 * tops out at 2, so a round needs at least one sign to clear it.
 */
export const MIN_CLUES = 2.5;
