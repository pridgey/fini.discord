import { ALL_CHAT_TYPES } from "../modules/aiChat/chatTypes";
import { clearHistory } from "./chatHistory";

/**
 * The `server_id` written for a conversation that happened outside a guild.
 *
 * index.ts stores history as `message.guildId ?? "unknown"`, so a deletion that
 * substitutes anything else - an empty string, say - filters on a server_id
 * that was never written and quietly removes nothing.
 */
const SERVER_ID_FALLBACK = "unknown";

/**
 * Clears every conversation a user has in one server, across all backends.
 *
 * This is the only function anything outside the history utilities should call
 * to wipe a user's chat. History is partitioned by `chatType`, so clearing
 * "the" history means walking the full set - and the personality commands each
 * walked a hand-written subset instead. /set-personality cleared openai and
 * anthropic but not llama, so switching personality with clear:true told the
 * user their history was gone while leaving the local model's transcript
 * intact; the model then went on answering from a conversation the user
 * believed no longer existed. Adding a backend must not require remembering
 * every place that deletes one.
 *
 * A failure on one backend is logged and skipped rather than thrown, so one
 * unreachable service cannot leave the remaining backends' history behind.
 *
 * Lives in its own module so it can be tested: the suite mocks
 * `utilities/chatHistory` wholesale, and bun's mock.module is process global,
 * so anything exported from there is unreachable in a full run.
 * @param userID The user's ID
 * @param guildID The server ID. Nullish becomes the same fallback the write
 *   path applies, so a DM's history is actually found. Matched to index.ts's
 *   `guildId ?? "unknown"` exactly - substituting on a different condition than
 *   the writer would filter on a server_id that was never stored
 * @param clear Injectable for tests; defaults to the real single-backend clear
 */
export const clearAllHistory = async (
  userID: string,
  guildID: string | null | undefined,
  clear: typeof clearHistory = clearHistory,
): Promise<void> => {
  const serverID = guildID ?? SERVER_ID_FALLBACK;

  for (const chatType of ALL_CHAT_TYPES) {
    try {
      await clear(userID, serverID, chatType);
    } catch (err) {
      console.error(`Error clearing ${chatType} history:`, err);
    }
  }
};
