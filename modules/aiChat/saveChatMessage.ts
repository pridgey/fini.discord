import Anthropic from "@anthropic-ai/sdk";
import { ChatRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";
import { getChatHistory } from "./getChatHistory";

const MAX_CHAT_HISTORY = 200;

/**
 * Adds a new record to the user's chat history
 * @param chatRecord All encompassing record
 */
export const saveChatMessage = async (
  chatRecord: ChatRecord,
  anthropic: Anthropic,
) => {
  // Add the new record
  const newChatRecord = await pb
    .collection<ChatRecord>("chat")
    .create({ ...chatRecord });

  // Grab all records to ensure we're under max history
  const userHistory = await getChatHistory(
    chatRecord.user_id,
    chatRecord.server_id,
    chatRecord.chatType,
  );

  // Keep history length under specified number, beginning from the top
  if (userHistory.length > MAX_CHAT_HISTORY) {
    const recordsToDelete = userHistory.slice(
      0,
      userHistory.length - MAX_CHAT_HISTORY,
    );

    for (const record of recordsToDelete) {
      if (!!record.id) {
        await pb.collection<ChatRecord>("chat").delete(record.id ?? "");
      }
      if (record.attachment) {
        await anthropic.beta.files.delete(record.attachment);
      }
    }
  }
};
