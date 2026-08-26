import { ChatModel } from "../../types/PocketbaseTables";
import { getUserChatModel } from "./chatModel";
import { converseWithClaude } from "./converseWithClaude";
import { converseWithLlama } from "./converseWithLlama";
import { AIConverseProps } from "./types";

export type { AIConverseOptions, AIConverseProps } from "./types";

/**
 * Entry point for every AI conversation.
 *
 * Picks a backend and hands off. Callers that care which model answers pass
 * `options.model`; callers that don't - "hey fini" being the one that matters -
 * leave it off and get whatever the user chose with /chat-config.
 */
export const converseWithAI = async (props: AIConverseProps) => {
  const { userID, server, options = {} } = props;

  const model: ChatModel =
    options.model ?? (await getUserChatModel(userID, server));

  console.log("Routing conversation to model:", { model, userID, server });

  switch (model) {
    case "claude":
      return converseWithClaude(props);
    case "llama-gemma":
      return converseWithLlama(props);
  }
};
