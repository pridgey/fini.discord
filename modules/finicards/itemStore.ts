import type {
  V2CardDefinitionRecord,
  V2ItemRecord,
  V2UserCardRecord,
} from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
import { V2_CARD_DEFINITION, V2_USER_CARD } from "./cardStore";
import { COLLECTIONS, itemByKey, type CollectionKey } from "./items";

/**
 * Dungeon items in Pocketbase: `v2_item`, one row per item a player holds.
 * See `pb_migrations/1793300000_created_v2_item.js`.
 */

export const V2_ITEM = "v2_item";

/** Everything a player holds on a server, oldest first. */
export const getItems = (
  userId: string,
  serverId: string,
): Promise<V2ItemRecord[]> =>
  pb.collection<V2ItemRecord>(V2_ITEM).getFullList({
    filter: pb.filter("user_id = {:userId} && server_id = {:serverId}", {
      userId,
      serverId,
    }),
    sort: "created,id",
  });

/**
 * Who on a server holds each collection piece, by piece key. Each piece exists
 * once per server, so these are the ones that can't drop or be granted now.
 */
export const pieceHolders = async (
  serverId: string,
): Promise<Map<string, string>> => {
  const rows = await pb.collection<V2ItemRecord>(V2_ITEM).getFullList({
    filter: pb.filter('server_id = {:serverId} && kind = "piece"', {
      serverId,
    }),
    fields: "item,user_id",
  });
  return new Map(rows.map((row) => [row.item, row.user_id]));
};

/**
 * Gives a player items, one row each. A collection piece someone on the
 * server already holds is skipped - there's only one of each - and reported
 * back, so the caller can say so or give something else.
 */
export const grantItems = async (
  userId: string,
  serverId: string,
  keys: string[],
  from: { source: string; run?: string },
): Promise<{ granted: V2ItemRecord[]; taken: string[] }> => {
  const granted: V2ItemRecord[] = [];
  const taken: string[] = [];
  const held = new Set((await pieceHolders(serverId)).keys());
  for (const item of keys) {
    const definition = itemByKey(item);
    if (!definition) continue;
    if (definition.kind === "piece" && held.has(item)) {
      taken.push(item);
      continue;
    }
    try {
      granted.push(
        await pb.collection<V2ItemRecord>(V2_ITEM).create({
          user_id: userId,
          server_id: serverId,
          item,
          kind: definition.kind,
          source: from.source,
          run: from.run ?? "",
          active: false,
        }),
      );
      if (definition.kind === "piece") held.add(item);
    } catch (error) {
      // The unique index: someone else's grant got there first.
      if (definition.kind !== "piece") throw error;
      taken.push(item);
    }
  }
  return { granted, taken };
};

/** Who on a server holds each set's Summoned card, if anyone does yet. */
export const summonedHolders = async (
  serverId: string,
): Promise<Partial<Record<CollectionKey, string>>> => {
  const definitions = await pb
    .collection<V2CardDefinitionRecord>(V2_CARD_DEFINITION)
    .getFullList({ filter: 'rarity = "summoned"', fields: "id,card_name" });

  const holders: Partial<Record<CollectionKey, string>> = {};
  for (const set of Object.values(COLLECTIONS)) {
    const definition = definitions.find((d) => d.card_name === set.summons);
    if (!definition?.id) continue;
    const copy = await pb
      .collection<V2UserCardRecord>(V2_USER_CARD)
      .getFirstListItem(
        pb.filter("server_id = {:serverId} && card = {:card}", {
          serverId,
          card: definition.id,
        }),
      )
      .catch(() => null);
    if (copy) holders[set.key] = copy.user_id;
  }
  return holders;
};
