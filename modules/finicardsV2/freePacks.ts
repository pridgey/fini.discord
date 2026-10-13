import type { V2FreePackRecord, FreePackSpecial } from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";

/**
 * Free packs: boosters a player is owed without paying.
 *
 * At launch these are the thanks for v1's item cards, which did not come
 * across to v2: one pack for every `ITEMS_PER_FREE_PACK` items lost, rounded
 * up so that anyone who lost an item gets a pack.
 *
 * A free pack does not roll a Secret Art or a Legendary by chance. Instead
 * each server's batch holds exactly one of each, placed in a pack chosen at
 * random when the batch is made (`planFreePacks`) and found only when that
 * pack is opened.
 */

export const V2_FREE_PACK = "v2_free_pack";

/** v1 item cards lost per free pack given. Set by Taylor. */
export const ITEMS_PER_FREE_PACK = 40;

export const freePacksOwed = (items: number): number =>
  items > 0 ? Math.ceil(items / ITEMS_PER_FREE_PACK) : 0;

export type ItemOwner = {
  userId: string;
  serverId: string;
  identifier: string;
  /** How many item cards they are losing. */
  items: number;
};

export type PlannedPack = {
  userId: string;
  serverId: string;
  identifier: string;
  special: FreePackSpecial;
};

export type FreePackPlan = {
  packs: PlannedPack[];
  /** Specials no pack could take, as "<server id>:<special>". */
  unplaced: string[];
};

const SPECIALS: Exclude<FreePackSpecial, "">[] = ["secret_art", "legendary"];

/**
 * Every pack owed for a set of item holdings, with each server's Secret Art
 * and Legendary placed.
 *
 * Every pack on a server is as likely as any other to be chosen, so a player's
 * chance is in proportion to the packs they hold - except the packs of
 * `exclude`, which are never chosen. The two specials go in different packs.
 */
export const planFreePacks = (
  owners: ItemOwner[],
  options: { exclude?: string; random?: () => number } = {},
): FreePackPlan => {
  const random = options.random ?? Math.random;
  const packs: PlannedPack[] = [];
  const unplaced: string[] = [];

  const servers = [...new Set(owners.map((owner) => owner.serverId))].sort();
  for (const serverId of servers) {
    const batch: PlannedPack[] = owners
      .filter((owner) => owner.serverId === serverId)
      .sort((a, b) => a.userId.localeCompare(b.userId))
      .flatMap((owner) =>
        Array.from({ length: freePacksOwed(owner.items) }, () => ({
          userId: owner.userId,
          serverId,
          identifier: owner.identifier,
          special: "" as FreePackSpecial,
        })),
      );

    for (const special of SPECIALS) {
      const open = batch.filter((pack) => pack.special === "" && pack.userId !== options.exclude);
      if (open.length === 0) {
        unplaced.push(`${serverId}:${special}`);
        continue;
      }
      open[Math.min(Math.floor(random() * open.length), open.length - 1)].special = special;
    }

    packs.push(...batch);
  }

  return { packs, unplaced };
};

const filterSafe = (value: string): string => (value ?? "").replace(/["\\]/g, "\\$&");

/** A player's free packs still to open on a server, oldest first. */
export const getUnopenedFreePacks = async (
  userId: string,
  serverId: string,
): Promise<V2FreePackRecord[]> =>
  pb.collection<V2FreePackRecord>(V2_FREE_PACK).getFullList({
    filter: `user_id = "${filterSafe(userId)}" && server_id = "${filterSafe(serverId)}" && opened = false`,
    sort: "created",
    requestKey: null,
  });

export const markFreePackOpened = async (id: string): Promise<void> => {
  await pb.collection<V2FreePackRecord>(V2_FREE_PACK).update(id, { opened: true });
};

/**
 * Hands a special that a pack could not deliver - no Secret Art left to give,
 * say - to another unopened free pack on the server, so the server still gets
 * it. Never to a pack of `exclude`. Returns whether a pack took it.
 */
export const passOnSpecial = async (
  serverId: string,
  special: Exclude<FreePackSpecial, "">,
  exclude?: string,
  random: () => number = Math.random,
): Promise<boolean> => {
  const open = (
    await pb.collection<V2FreePackRecord>(V2_FREE_PACK).getFullList({
      filter: `server_id = "${filterSafe(serverId)}" && opened = false && special = ""`,
      requestKey: null,
    })
  ).filter((pack) => pack.user_id !== exclude);
  if (open.length === 0) return false;

  const chosen = open[Math.floor(random() * open.length)];
  await pb.collection<V2FreePackRecord>(V2_FREE_PACK).update(chosen.id!, { special });
  return true;
};
