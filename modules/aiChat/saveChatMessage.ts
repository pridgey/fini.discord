import Anthropic from "@anthropic-ai/sdk";
import { ChatRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";
import { getChatHistory } from "./getChatHistory";
import { splitBigString } from "../../utilities/splitBigString";

const MAX_CHAT_HISTORY = 200;

/**
 * Adds a new record to the user's chat history
 * @param chatRecord All encompassing record
 * @param anthropic Only needed for backends that upload attachments to
 * Anthropic's file store, so trimmed history can delete them too. The local
 * llama.cpp backend inlines attachments per-request and passes nothing.
 */
export const saveChatMessage = async (
  chatRecord: ChatRecord,
  anthropic?: Anthropic,
) => {
  // Add the new record(s)
  const bigStrings = splitBigString(chatRecord.message, 4000);
  for (const msg of bigStrings) {
    const newRecord = { ...chatRecord, message: msg };
    await pb
      .collection<ChatRecord>("chat")
      .create({ ...newRecord }, { requestKey: Math.random().toString() });
  }

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
        await pb
          .collection<ChatRecord>("chat")
          .delete(record.id ?? "", { requestKey: record.id.toString() });
      }
      if (record.attachment && anthropic) {
        await anthropic.beta.files.delete(record.attachment);
      }
    }
  }
};
