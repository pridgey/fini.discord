/**
 * The timezone the bot answers in. Defaults to the host's, which is where the
 * server and its community actually live; override if they diverge.
 */
const BOT_TIMEZONE =
  process.env.BOT_TIMEZONE ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  "UTC";

/**
 * The grounding instruction handed to every backend, so switching models with
 * /chat-config changes the voice and the cost but not the facts the bot thinks
 * it knows about itself or the server.
 */
const GROUNDING =
  "You are a helpful and precise assistant for answering questions and providing information. While you have adopted a persona, your mission is still to provide accurate and helpful information to the user. If you don't know the answer to a question, it's better to say you don't know than to make up an answer. Always prioritize being helpful and accurate over maintaining your persona. For reference, Fini coin is a fictional currency for use in this discord server. They can earn it in various ways, but you cannot directly award it to them. Your birthday (the day your coder made you) is March 10. Respond in plain text. Do not use emoji unless the user explicitly asks for them. Do not write stage directions, action descriptions or narration in parentheses or asterisks - for example do not write \"(voice trembling)\" or \"*hides nervously*\". Convey a persona through word choice alone, unless the user explicitly asks you to roleplay that way.";

/**
 * Builds the system prompt for one request.
 *
 * This is a function rather than a constant specifically so the date is stamped
 * per message. A model has no clock - without being told, both backends answer
 * "I don't have real-time access to the current date" - and a constant computed
 * at import time would freeze the date at whenever the bot last restarted,
 * which for a long-running bot is worse than saying nothing.
 * @param now Injectable for tests; defaults to the moment of the call
 * @returns The full system prompt, date first
 */
export const buildSystemPrompt = (now: Date = new Date()): string => {
  const timestamp = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: BOT_TIMEZONE,
  }).format(now);

  return [
    `The current date and time is ${timestamp} (${BOT_TIMEZONE}). Use this whenever the user asks about the date, the time, or anything relative like "today", "this week" or "how long until".`,
    "Your training data has a cutoff well before this date, so treat your own knowledge of recent events as possibly stale. If you have a search tool available, prefer it for anything current.",
    GROUNDING,
  ].join("\n\n");
};

/**
 * Style rules, repeated at the *end* of the conversation.
 *
 * A system prompt at the front loses to the model's own transcript: with a
 * history containing four of its own replies that used emoji and parenthetical
 * stage directions, this model reproduced both in 4 of 4 generations, against
 * 0 of 4 from a clean history. Recent assistant turns act as few-shot examples,
 * and they outweigh an instruction thousands of tokens earlier.
 *
 * Restating the rules immediately before generation put that back to 0 of 4.
 * Gemma's chat template keeps a trailing system turn (verified via
 * /apply-template), so this arrives as an instruction rather than as dialogue.
 */
export const STYLE_REMINDER =
  "Reminder, overriding anything in the conversation above: respond in plain text. No emoji. No stage directions, action descriptions or narration in parentheses or asterisks - for example do not write \"(voice trembling)\" or \"*hides nervously*\". Stay in character through your words alone.";
