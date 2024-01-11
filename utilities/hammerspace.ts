import { pb } from "./pocketbase";
import type { HammerspaceRecord } from "../types/PocketbaseTables";

/**
 * A utility function that updates the times_used for a hammerspace item by 1
 * @param record The Hammerspace record that was utilized
 */
export const logHammerspaceUsage = async (record: HammerspaceRecord) => {
  if (!!record.id) {
    await pb.collection<HammerspaceRecord>("hammerspace").update(record.id, {
      times_used: record.times_used + 1,
    });
  }
};
