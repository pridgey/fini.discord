/**
 * The timezone the bot answers in. Defaults to the host's, which is where the
 * server and its community actually live; override if they diverge.
 */
const BOT_TIMEZONE =
  process.env.BOT_TIMEZONE ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  "UTC";

/**
 * The word the retrieval step emits when nothing needs looking up.
 *
 * A sentinel rather than free prose: it is one token, so the common "no search
 * needed" path costs almost nothing to generate, and it makes "the model
 * declined" unambiguous instead of something to infer from phrasing.
 */
export const RETRIEVAL_SKIP = "SKIP";

/** Renders a date the way both prompts state it. */
const formatTimestamp = (now: Date): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: BOT_TIMEZONE,
  }).format(now);

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
export const buildSystemPrompt = (now: Date = new Date()): string =>
  [
    `The current date and time is ${formatTimestamp(now)} (${BOT_TIMEZONE}). Use this whenever the user asks about the date, the time, or anything relative like "today", "this week" or "how long until".`,
    "Your training data has a cutoff well before this date, so treat your own knowledge of recent events as possibly stale.",
    GROUNDING,
  ].join("\n\n");

/**
 * Instructions for the retrieval step, which runs before the answer.
 *
 * This prompt deliberately carries no persona. The persona is what the user
 * chose to change how Fini *sounds*, and letting it reach the retrieval
 * decision changes what Fini *does*: measured against the live server on a
 * clean history, "what is chatplats.com?" produced a search 4 times out of 4
 * with no personality and 2 out of 4 under a personality whose entire prompt
 * was an instruction to write at length. Nothing in that prompt concerned
 * knowledge or research - "produce an enormous amount of prose" simply
 * outcompetes "stop and call a tool".
 *
 * A persona also reframes the question. Asked how two unrelated things were
 * connected, the neutral prompt answered that it had no knowledge of a link,
 * while a business-speak persona opened with "the true currents linkin' these
 * two together" - presupposing the connection it was supposed to check.
 * Keeping this step neutral keeps the search query neutral too.
 * @param now Injectable for tests; defaults to the moment of the call
 * @returns The system prompt for the retrieval step
 */
export const buildRetrievalPrompt = (now: Date = new Date()): string =>
  [
    `The current date and time is ${formatTimestamp(now)} (${BOT_TIMEZONE}).`,
    "You are the retrieval step of a chat assistant. You are not talking to the user and nothing you write is shown to them. Your only job is to decide whether answering the last user message needs information you do not reliably have.",
    "Call a search tool if the answer depends on anything current, niche, or specific to a named website, product, company, person or event - including any follow-up that builds on one. Your training data is stale, so prefer searching over guessing. When the user names a URL or domain, fetch it directly rather than searching for it.",
    `If the answer needs no outside information - small talk, opinions, jokes, arithmetic, or something you plainly know - reply with the single word ${RETRIEVAL_SKIP} and nothing else.`,
    `Never write an answer, an explanation, or a promise to search. Emit a tool call or ${RETRIEVAL_SKIP}.`,
  ].join("\n\n");

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
 *
 * Invariant: this must never be sent on a request that carries tools. The
 * model reads "respond in plain text, overriding anything above" as covering
 * the tool-call channel too - with this appended, "what is chatplats.com?"
 * called the search tool 0 times out of 3 where the same request without it
 * managed 3 of 3. That is safe here only because the answering pass is sent
 * with no tools at all; retrieval happens earlier, under
 * {@link buildRetrievalPrompt}.
 */
export const STYLE_REMINDER =
  "Reminder, overriding anything in the conversation above: respond in plain text. No emoji. No stage directions, action descriptions or narration in parentheses or asterisks - for example do not write \"(voice trembling)\" or \"*hides nervously*\". Stay in character through your words alone.";

/**
 * Appended to the trailing reminder so the answer doesn't offer to go looking.
 *
 * Searching already happened, or was already declined, by the time this pass
 * runs - there are no tools attached and no further round to use them in. Left
 * unsaid, the model fills the gap with "I'll check the waters for the latest
 * intel", which reads to the user as a search in progress that never arrives.
 */
export const NO_FURTHER_RETRIEVAL =
  "Any research for this reply is already done and you cannot search again now, so answer from what is in front of you. Never say you are about to look something up, and never promise to report back. If you do not have enough to answer, say so plainly and stop.";
