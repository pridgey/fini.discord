import { getConfigForServer } from "../../../utilities/config/configUtils";
import { HORSE_COUNT } from "./horseyUtilities";

/**
 * Per-server names for the horses in /horsey.
 *
 * Names are cosmetic. A horse is identified everywhere else by its number, and
 * nothing here can change a race or a payout - so a server that has never
 * configured names, or has configured half of them, still gets a working game.
 */

/** Used for any horse a server hasn't named. */
export const DEFAULT_HORSEY_NAMES = [
  "Glue Factory",
  "Second Breakfast",
  "Unemployed",
  "Mild Concern",
  "Probably Fine",
];

/** Discord rejects choice names over 100 characters, and long names wreck the track. */
const MAX_NAME_LENGTH = 32;

/**
 * Turns the stored string into exactly one name per horse.
 *
 * Always returns HORSE_COUNT names, whatever it is given: a server that named
 * three horses keeps the defaults for the other two, and a server that named
 * eight has the extras dropped. Callers index this array by horse, so a short
 * array would be an undefined name in the middle of a race.
 * @param raw The stored comma-separated value, if any
 * @returns One name per horse, in horse order
 */
export const parseHorseyNames = (raw?: string | null): string[] => {
  const configured = (raw ?? "")
    .split(",")
    .map((name) => name.trim().slice(0, MAX_NAME_LENGTH))
    .filter(Boolean);

  return DEFAULT_HORSEY_NAMES.map(
    (fallback, index) => configured[index] || fallback,
  ).slice(0, HORSE_COUNT);
};

/**
 * Turns admin input back into the stored form.
 *
 * Commas are the separator, so any the admin typed inside a name are stripped
 * rather than silently splitting one horse into two.
 * @param raw What the admin typed into /config
 * @returns The value to store, or "" to fall back to the built-in names
 */
export const serializeHorseyNames = (raw: string): string => {
  const names = raw
    .split(",")
    .map((name) => name.trim().replace(/,/g, "").slice(0, MAX_NAME_LENGTH))
    .filter(Boolean)
    .slice(0, HORSE_COUNT);

  return names.join(", ");
};

/**
 * The names to use for one server.
 *
 * Falls back to the built-in names if the server has no config record, has not
 * set any names, or the lookup fails - this is decoration, and it must never be
 * the reason a race doesn't run.
 * @param serverId The guild the race is in
 * @returns One name per horse, in horse order
 */
export const getHorseyNames = async (serverId: string): Promise<string[]> => {
  try {
    const config = await getConfigForServer(serverId);
    return parseHorseyNames(config?.horsey_names);
  } catch (err) {
    console.error("Could not read horsey names, using defaults:", err);
    return parseHorseyNames();
  }
};

/**
 * Renders a horse the way it should read to a player.
 *
 * Name only. The number is what the bet is actually placed on, but printing it
 * alongside every name - in the lanes, the finishing order and the autocomplete
 * - spent a column on a detail the player never types: autocomplete resolves
 * the pick, and the lanes are already in horse order top to bottom.
 * @param names One name per horse, as returned by {@link getHorseyNames}
 * @param horseId The horse's 1-based number
 * @returns The horse's name, or a numbered fallback if it has none
 */
export const labelFor = (names: string[], horseId: number): string =>
  names[horseId - 1] ?? `Horsey ${horseId}`;
