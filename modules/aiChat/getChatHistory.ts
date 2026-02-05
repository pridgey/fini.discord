import { ChatRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

/**
 * Pulls the history of the user to feed into the current ai chat
 * @param userID The user's ID
 * @param guildID The server ID
 * @param chatType Determines which ai the user is chatting with
 * @returns Array of chat records
 */
export const getChatHistory = async (
  userID: string,
  guildID: string,
  chatType: string,
) => {
  // Grab the user history
  const userHistory = await pb.collection<ChatRecord>("chat").getFullList({
    filter: `user_id = "${userID}" && server_id = "${guildID}" && chatType = "${chatType}"`,
    sort: "created",
  });

  return userHistory;
};
