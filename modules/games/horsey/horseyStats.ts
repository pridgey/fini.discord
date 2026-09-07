import { HorseyStatsRecord } from "../../../types/PocketbaseTables";
import { pb } from "../../../utilities/pocketbase";
import { HORSE_COUNT } from "./horseyUtilities";

/**
 * Running form guide for /horsey, kept per server.
 *
 * Every function here swallows its own errors. The tallies are flavour - they
 * decide nothing about the payout - so a database hiccup must never cost
 * someone a race they already paid for.
 */

/**
 * Records the outcome of one race.
 *
 * Every horse gets its `races` incremented; the horses that placed first get a
 * `wins`. A dead heat counts as a win for each horse that tied.
 * @param serverId The guild the race ran in
 * @param serverName Used to build the record's human-readable identifier
 * @param winningHorseIds Every horse that finished first
 */
export const recordRaceResult = async (
  serverId: string,
  serverName: string,
  winningHorseIds: number[],
): Promise<void> => {
  try {
    const existing = await pb
      .collection<HorseyStatsRecord>("horsey_stats")
      .getFullList({ filter: `server_id = "${serverId}"` });

    for (let horse = 1; horse <= HORSE_COUNT; horse++) {
      const record = existing.find((row) => row.horse === horse);
      const won = winningHorseIds.includes(horse) ? 1 : 0;

      if (record?.id) {
        await pb.collection<HorseyStatsRecord>("horsey_stats").update(
          record.id,
          {
            wins: (record.wins ?? 0) + won,
            races: (record.races ?? 0) + 1,
          },
        );
      } else {
        await pb.collection<HorseyStatsRecord>("horsey_stats").create({
          server_id: serverId,
          horse,
          wins: won,
          races: 1,
          identifier: `horsey-${horse}-${serverName}`,
        });
      }
    }
  } catch (err) {
    console.error("Could not record horsey stats:", err);
  }
};

/**
 * Reads the form guide for a server.
 * @param serverId The guild to read
 * @returns One entry per horse that has raced, lowest horse number first
 */
export const getHorseyStats = async (
  serverId: string,
): Promise<HorseyStatsRecord[]> => {
  try {
    const rows = await pb
      .collection<HorseyStatsRecord>("horsey_stats")
      .getFullList({ filter: `server_id = "${serverId}"` });

    return rows.sort((a, b) => a.horse - b.horse);
  } catch (err) {
    console.error("Could not read horsey stats:", err);
    return [];
  }
};

/**
 * A horse's record, short enough to sit inside a finishing-order line.
 *
 * The form guide used to be its own field listing every horse again underneath
 * the finishing order, which meant reading the same five names twice to answer
 * one question. Attaching the record to the placing instead says the same thing
 * in one pass.
 * @param stats Rows as returned by {@link getHorseyStats}
 * @param horseId The horse's 1-based number
 * @returns "wins/races", or "" for a horse with no races on record
 */
export const formFor = (
  stats: HorseyStatsRecord[],
  horseId: number,
): string => {
  const row = stats.find((entry) => entry.horse === horseId);
  if (!row?.races) return "";

  return `${row.wins ?? 0}/${row.races}`;
};
