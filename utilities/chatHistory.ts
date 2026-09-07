import { Anthropic } from "@anthropic-ai/sdk/client";
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
  chatType: string,
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
    chatRecord.chatType,
  );

  // Keep history length under specified number, beginning from the top
  if (userHistory.length > MAX_HISTORY) {
    const recordsToDelete = userHistory.slice(
      0,
      userHistory.length - MAX_HISTORY,
    );

    for (const record of recordsToDelete) {
      if (!!record.id) {
        await pb.collection<ChatRecord>("chat").delete(record.id ?? "");
      }
    }
  }
};

/**
 * How many records are deleted at once.
 *
 * Deleting serially cost a round trip per record - and a record with an
 * attachment costs a second one to Anthropic's files API, roughly 300ms each -
 * so a long history blew straight past Discord's three second window for
 * answering an interaction. Batching collapses that to about one round trip
 * per batch. Bounded rather than unbounded so a thousand record history cannot
 * open a thousand sockets at once.
 */
const DELETE_CONCURRENCY = 20;

/**
 * Utility function to clear the chat history for a specific user, guild and chat type
 *
 * Attachment deletions are best effort. Anthropic 404s a file that is already
 * gone, and that used to abort the loop mid-history: every record after the
 * bad one survived a clear that had already reported success. A record's own
 * deletion failing is still worth reporting, but only after the rest of the
 * history has been cleared - so those are collected and thrown at the end
 * rather than abandoning the records still in flight.
 * @param userID The user's ID
 * @param guildID The server ID
 * @param chatType Determines which AI history to clear
 */
export const clearHistory = async (
  userID: string,
  guildID: string,
  chatType: string,
) => {
  // Get all records
  const userHistory = await getHistory(userID, guildID, chatType);

  if (!userHistory.length) {
    return;
  }

  // Only built if a record actually has an attachment to delete
  let anthropic: Anthropic | undefined;

  const deleteRecord = async (record: (typeof userHistory)[number]) => {
    if (!!record.id) {
      await pb.collection<ChatRecord>("chat").delete(record.id ?? "");
    }

    if (record.attachment) {
      anthropic ??= new Anthropic();

      try {
        await anthropic.beta.files.delete(record.attachment);
      } catch (err) {
        console.error(
          `Error deleting attachment ${record.attachment}:`,
          err,
        );
      }
    }
  };

  const failures: unknown[] = [];

  // Delete all of them, a bounded batch at a time
  for (let i = 0; i < userHistory.length; i += DELETE_CONCURRENCY) {
    const batch = userHistory.slice(i, i + DELETE_CONCURRENCY);

    const results = await Promise.allSettled(batch.map(deleteRecord));

    for (const result of results) {
      if (result.status === "rejected") {
        failures.push(result.reason);
      }
    }
  }

  if (failures.length) {
    console.error(`Failed to delete ${failures.length} ${chatType} records`, {
      failures,
    });

    throw new Error(
      `Failed to delete ${failures.length} of ${userHistory.length} ${chatType} chat records`,
    );
  }
};
