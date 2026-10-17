/**
 * Parsing for the RCON `list` response.
 *
 * Split out from the monitor because the empty-server shutdown now hinges on
 * it: Fini's bot is a real `ServerPlayer`, so it is counted by `list` exactly
 * like a person. Counting it would mean the server never looks empty and never
 * shuts down - the same symptom as the state-machine bug, from a new cause.
 */

export type ParsedPlayerList = {
  /** The count the server reported, bots included. */
  total: number;
  /** Player names with any mod-added prefixes stripped. */
  names: string[];
};

/**
 * This server's `list` output carries a bracketed prefix on every name:
 *
 *     There are 2 of a max of 20 players online: [334] Pridgey, [0] FINI
 *
 * The number appears to come from a mod rather than vanilla, so the prefix is
 * stripped rather than interpreted.
 */
export const parsePlayerList = (response: string): ParsedPlayerList | null => {
  const totalMatch = response.match(/There are (\d+)/);
  if (!totalMatch) return null;

  const total = parseInt(totalMatch[1], 10);

  // Everything after the first colon is the name list, which is empty when
  // nobody is online
  const colonIndex = response.indexOf(":");
  const nameSection = colonIndex >= 0 ? response.slice(colonIndex + 1) : "";

  const names = nameSection
    .split(",")
    .map((entry) => entry.replace(/\[[^\]]*\]/g, "").trim())
    .filter((entry) => entry.length > 0);

  return { total, names };
};

/**
 * The names of the *people* online, ignoring Fini's bots.
 *
 * Null when the response can't be read, which the caller must treat as
 * "unknown" rather than "nobody".
 */
export const humanPlayers = (
  response: string,
  botNames: readonly string[],
): string[] | null => {
  const parsed = parsePlayerList(response);
  if (!parsed) return null;

  const bots = botNames.map((name) => name.toLowerCase());
  return parsed.names.filter((name) => !bots.includes(name.toLowerCase()));
};

/**
 * How many *people* are online, ignoring Fini's bots.
 *
 * Returns null when the response can't be read at all, which the caller must
 * treat as "unknown" rather than "empty".
 *
 * When the name list can't be recovered but the server reported players, the
 * reported total is used instead. That errs towards keeping the server up: a
 * missed shutdown wastes power, a wrong one kicks people out of the world.
 */
export const countHumanPlayers = (
  response: string,
  botNames: readonly string[],
): number | null => {
  const parsed = parsePlayerList(response);
  if (!parsed) return null;

  if (parsed.total === 0) return 0;

  // Reported players but no readable names - fall back to the total
  if (parsed.names.length === 0) return parsed.total;

  const bots = botNames.map((name) => name.toLowerCase());
  return parsed.names.filter((name) => !bots.includes(name.toLowerCase()))
    .length;
};
