import { ChatRecord } from "../types/PocketbaseTables";
import { pb } from "./pocketbase";

const MAX_HISTORY = 50;

/**
 * Pulls the history of the user to feed into the current ai chat
 * @param userID The user's ID
 * @param guildID The server ID
 * @param chatType Determines which ai the user is chatting with
 * @returns Array of chat records
 */
export const getHistory = async (
  userID: string,
  guildID: string,
  chatType: string
) => {
  // Grab the user history
  const userHistory = await pb.collection<ChatRecord>("chat").getFullList({
    filter: `user_id = "${userID}" && server_id = "${guildID}" && chatType = "${chatType}"`,
    sort: "created",
  });

  return userHistory;
};

/**
 * Adds a new record to the user's chat history
 * @param chatRecord All encompassing record
 */
export const addHistory = async (chatRecord: ChatRecord) => {
  // Add the new record
  await pb.collection<ChatRecord>("chat").create({ ...chatRecord });

  // Grab all records to ensure we're under max history
  const userHistory = await getHistory(
    chatRecord.user_id,
    chatRecord.server_id,
    chatRecord.chatType
  );

  // Keep history length under specified number, beginning from the top
  if (userHistory.length > MAX_HISTORY) {
    const recordsToDelete = userHistory.slice(
      0,
      userHistory.length - MAX_HISTORY
    );

    for (const record of recordsToDelete) {
      if (!!record.id) {
        await pb.collection<ChatRecord>("chat").delete(record.id ?? "");
      }
    }
  }
};

/**
 * Utility function to clear the chat history for a specific user, guild and chat type
 * @param userID The user's ID
 * @param guildID The server ID
 * @param chatType Determines which AI history to clear
 */
export const clearHistory = async (
  userID: string,
  guildID: string,
  chatType: string
) => {
  // Get all records
  const userHistory = await getHistory(userID, guildID, chatType);

  // Delete all of them
  for (const record of userHistory) {
    if (!!record.id) {
      await pb.collection<ChatRecord>("chat").delete(record.id ?? "");
    }
  }
};
