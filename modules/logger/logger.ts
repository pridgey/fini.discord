import { pb } from "../../utilities/pocketbase";
import type { LogRecord } from "../../types/PocketbaseTables";

/**
 * Utility function to add a log record to the database
 * @param newRecord The new log record
 */
export const createLog = async (newRecord: LogRecord) => {
  if (newRecord.input.length > 5000) {
    newRecord.input = newRecord.input.slice(0, 5000);
  }
  if (newRecord.output.length > 5000) {
    newRecord.output = newRecord.output.slice(0, 5000);
  }

  await pb.collection("log").create(newRecord);
};
