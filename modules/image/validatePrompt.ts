import { MAX_PROMPT_LENGTH } from "./types";

/**
 * Validates the prompt length
 * Returns an error message if invalid, undefined if valid
 */
export const validatePrompt = (prompt: string): string | undefined => {
  if (!prompt?.length) {
    return "You need to give me something to work with.";
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return "If you're Graham, stop it. If you're not Graham, I bet he put you up to it. I need a shorter prompt please.";
  }

  return undefined;
};
