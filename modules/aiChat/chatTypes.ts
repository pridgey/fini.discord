/**
 * The `chatType` keys used to partition the `chat` collection.
 *
 * History is stored per backend so switching models with /chat-config starts a
 * fresh conversation rather than feeding one model a transcript of another's
 * answers. That means anything walking every conversation a user has - /clear
 * being the one that matters - has to know the full set, and forgetting to add
 * a new one leaves history the user thinks they deleted.
 */
export const CHAT_TYPE_OPENAI = "openai";
export const CHAT_TYPE_ANTHROPIC = "anthropic";
export const CHAT_TYPE_OLLAMA = "ollama";
export const CHAT_TYPE_LLAMA = "llama";

/** Every chatType ever written, including retired backends' leftovers. */
export const ALL_CHAT_TYPES = [
  CHAT_TYPE_OPENAI,
  CHAT_TYPE_ANTHROPIC,
  CHAT_TYPE_OLLAMA,
  CHAT_TYPE_LLAMA,
] as const;
