import { pb } from "../../utilities/pocketbase";
import type { LogRecord } from "../../types/PocketbaseTables";

export const createLog = async (newRecord: LogRecord) => {
  await pb.collection("log").create(newRecord);
};
