import {
  ChatConfigRecord,
  ChatModel,
} from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

/** Every model a user is allowed to pick, in the order /chat-config lists them. */
export const CHAT_MODELS: ChatModel[] = ["llama-gemma", "claude"];

/**
 * What a user gets when they have never touched /chat-config. Local llama.cpp
 * is the default so the common case costs nothing.
 */
export const DEFAULT_CHAT_MODEL: ChatModel = "llama-gemma";

/** Human-readable blurbs, used by /chat-config for its option descriptions. */
export const CHAT_MODEL_LABELS: Record<ChatModel, string> = {
  "llama-gemma": "Gemma running locally",
  claude: "Anthropic's Claude",
};

const isChatModel = (value: unknown): value is ChatModel =>
  CHAT_MODELS.includes(value as ChatModel);

/**
 * Reads the model a user has chosen for a server.
 *
 * Never throws - a lookup failure or an unrecognised stored value both fall
 * back to the default, because failing to reach pocketbase shouldn't stop
 * someone talking to the bot.
 * @param userID The user's ID
 * @param serverID The server ID
 * @returns The user's chosen model, or the default
 */
export const getUserChatModel = async (
  userID: string,
  serverID: string,
): Promise<ChatModel> => {
  const record = await pb
    .collection<ChatConfigRecord>("chat_config")
    .getFirstListItem(`user_id = "${userID}" && server_id = "${serverID}"`)
    .catch(() => null);

  return isChatModel(record?.model) ? record.model : DEFAULT_CHAT_MODEL;
};

/**
 * Stores the model a user wants to chat with, creating the record if this is
 * the first time they've set one.
 * @param userID The user's ID
 * @param serverID The server ID
 * @param model The model to route their "hey fini" messages to
 * @param identifier Human-readable "username-servername" for browsing the table
 */
export const setUserChatModel = async (
  userID: string,
  serverID: string,
  model: ChatModel,
  identifier: string,
) => {
  const existingRecord = await pb
    .collection<ChatConfigRecord>("chat_config")
    .getFirstListItem(`user_id = "${userID}" && server_id = "${serverID}"`)
    .catch(() => null);

  if (existingRecord?.id) {
    await pb
      .collection<ChatConfigRecord>("chat_config")
      .update(existingRecord.id, { model, identifier });
  } else {
    await pb.collection<ChatConfigRecord>("chat_config").create({
      user_id: userID,
      server_id: serverID,
      model,
      identifier,
    });
  }
};
