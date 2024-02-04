import { pb } from "../../utilities/pocketbase";
import type { LogRecord } from "../../types/PocketbaseTables";

/**
 * Utility function to add a log record to the database
 * @param newRecord The new log record
 */
export const createLog = async (newRecord: LogRecord) => {
  await pb.collection("log").create(newRecord);
};
