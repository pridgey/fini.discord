import type { V2PackOpenRecord } from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";

/**
 * God packs: every card full-art. Their odds are kept per server.
 *
 * After a god pack the server gets none for `GOD_PACK_COOLDOWN_MS`, however
 * many packs it opens - so a big night of opening never turns up two. After
 * that the odds start at `GOD_PACK_START` and climb with every pack opened,
 * reaching `GOD_PACK_CAP` after `GOD_PACK_RAMP_PACKS`. They climb per pack,
 * not per day, so holding off opening gains nothing.
 */

export const V2_PACK_OPEN = "v2_pack_open";

export const GOD_PACK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const GOD_PACK_START = 0.001;
export const GOD_PACK_CAP = 0.0025;
export const GOD_PACK_RAMP_PACKS = 400;

export type GodPackState = {
  /** When the server's latest god pack was opened, or null for never. */
  lastGodPackAt: Date | null;
  /** Packs opened since the cooldown after it ended - or ever, for none. */
  packsSinceCooldown: number;
};

/** One pack's god pack chance for a server in `state` at `now`. Pure. */
export const godPackChance = (state: GodPackState, now: Date): number => {
  if (
    state.lastGodPackAt &&
    now.getTime() - state.lastGodPackAt.getTime() < GOD_PACK_COOLDOWN_MS
  )
    return 0;
  const progress = Math.min(state.packsSinceCooldown / GOD_PACK_RAMP_PACKS, 1);
  return GOD_PACK_START + (GOD_PACK_CAP - GOD_PACK_START) * progress;
};

/** PocketBase's "2026-11-04 12:00:00.000Z" as a Date. */
const parseCreated = (created: string) => new Date(created.replace(" ", "T"));

/** Reads a server's god pack state from the packs it has opened. */
export const getGodPackState = async (
  serverId: string,
): Promise<GodPackState> => {
  const opens = pb.collection<V2PackOpenRecord>(V2_PACK_OPEN);
  const last = await opens
    .getFirstListItem(
      pb.filter("server_id = {:server_id} && god_pack = true", {
        server_id: serverId,
      }),
      { sort: "-created", fields: "created", requestKey: null },
    )
    .catch(() => null);
  const lastGodPackAt = last?.created ? parseCreated(last.created) : null;

  const since = lastGodPackAt
    ? new Date(lastGodPackAt.getTime() + GOD_PACK_COOLDOWN_MS)
    : null;
  const counted = await opens.getList(1, 1, {
    filter: since
      ? pb.filter("server_id = {:server_id} && created >= {:since}", {
          server_id: serverId,
          since,
        })
      : pb.filter("server_id = {:server_id}", { server_id: serverId }),
    fields: "id",
    requestKey: null,
  });

  return { lastGodPackAt, packsSinceCooldown: counted.totalItems };
};

/** Notes a pack opened on a server, and whether it was a god pack. */
export const recordPackOpen = async (input: {
  serverId: string;
  userId: string;
  godPack: boolean;
}): Promise<void> => {
  await pb.collection<V2PackOpenRecord>(V2_PACK_OPEN).create(
    {
      server_id: input.serverId,
      user_id: input.userId,
      god_pack: input.godPack,
    },
    { requestKey: null },
  );
};
