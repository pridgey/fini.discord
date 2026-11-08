import { ChatRecord } from "../../types/PocketbaseTables";
import { CHAT_TYPE_LLAMA } from "./chatTypes";
import {
  HEAVY_BACKEND,
  LIGHT_BACKEND,
  LLAMA_API_URL,
  type LlamaBackend,
} from "./llamaConfig";
import {
  isHeavyAvailable,
  rememberTier,
  routeMessage,
  type PreviousExchange,
} from "./routeModel";
import {
  executeToolCall,
  getAvailableTools,
  type LlamaToolCall,
  type LlamaToolDefinition,
} from "./llamaTools";
import {
  NEUTRAL_PERSONALITY,
  getActivePersonality,
} from "./determinePersonality";
import { PersonalitiesRecord } from "../../types/PocketbaseTables";
import { getChatHistory } from "./getChatHistory";
import { saveChatMessage } from "./saveChatMessage";
import { formatReplyContext } from "./formatReplyContext";
import {
  NO_FURTHER_RETRIEVAL,
  RETRIEVAL_SKIP,
  STYLE_REMINDER,
  buildPersonaRewritePrompt,
  buildRetrievalPrompt,
  buildSystemPrompt,
} from "./systemPrompt";
import { AIConverseProps } from "./types";

/**
 * Talks to the llama.cpp server running locally next to the bot, using its
 * OpenAI-compatible /v1/chat/completions endpoint.
 *
 * A reply is produced in two passes:
 *
 *   1. Retrieval - a short, persona-free pass whose only output is a tool call
 *      or {@link RETRIEVAL_SKIP}. Nothing it writes reaches the user.
 *   2. Answer - the generation that decides what to say, with the style rules
 *      and any tool results in context, no tools attached, and no persona.
 *   3. Persona - only when the user has a personality on: the finished answer
 *      is rewritten in that voice. See {@link rewriteInPersona}.
 *
 * Before any of that, the message is routed: everyday chat stays on Gemma and
 * questions that need real knowledge go to a bigger model, when it's free. All
 * three passes then run on the chosen model. See routeModel.ts.
 *
 * The split exists because the persona was changing what the bot *did*, not
 * just how it sounded. See {@link buildRetrievalPrompt} for the measurements.
 * It costs one extra short generation per message; the retrieval pass is capped
 * at {@link RETRIEVAL_MAX_TOKENS} so that stays small.
 *
 * Deliberately narrower than the Claude path: attachments are inlined
 * per-request rather than uploaded and referenced later, since there's no file
 * store to keep them in.
 */

const MAX_CHAT_TOKENS = 2000;

/**
 * Chat history is keyed by backend, so a user flipping between models with
 * /chat-config keeps two separate conversations rather than feeding Gemma a
 * transcript full of Claude's answers.
 */
const CHAT_TYPE = CHAT_TYPE_LLAMA;

/**
 * Sampling overrides. llama.cpp ships with `repeat_penalty` at 1.0 - i.e. off -
 * which makes token loops *absorbing*: once the model starts stuttering
 * ("I-I-I-I-...") nothing pulls it out, and it emits the full token budget of
 * one repeated character. Measured on this model, a seeded loop escaped 0 times
 * out of 3 with the defaults and 8 out of 8 with the settings below.
 *
 * DRY does the real work - it penalises repeated *sequences* rather than
 * individual tokens, so it breaks loops without flattening ordinary repetition
 * like a character's verbal tic. The small repeat_penalty is a backstop.
 */
const SAMPLING = {
  dry_multiplier: 0.8,
  dry_base: 1.75,
  dry_allowed_length: 2,
  repeat_penalty: 1.05,
  repeat_last_n: 256,
};

/**
 * Sampling for each backend. The settings above exist to pull Gemma out of
 * stutter loops; the bigger model doesn't fall into them, and a penalty on
 * repeated sequences is a poor fit for answers that must repeat a term
 * exactly ("Eb7 ... Eb7"). It gets ordinary settings instead.
 */
const SAMPLING_FOR: Record<LlamaBackend["name"], Record<string, number>> = {
  light: SAMPLING,
  heavy: { temperature: 0.7, top_p: 0.8, top_k: 20 },
};

/**
 * The local model is small and generating on CPU is not fast, so this is
 * deliberately generous. It only has to be shorter than the point at which
 * discord gives up on our typing indicator loop.
 */
const REQUEST_TIMEOUT_MS = 300_000;

/**
 * The retrieval pass emits a tool call or one word, so it has no legitimate
 * reason to run long. Failing fast here degrades to "answer without searching"
 * rather than holding the whole reply hostage to a stuck decision.
 */
const RETRIEVAL_TIMEOUT_MS = 60_000;

/**
 * Enough headroom for a tool call with a real query, and little enough that a
 * model which ignores the protocol and starts writing an essay is cut off early
 * rather than spending the full budget on text nobody will read.
 *
 * Not lower: a truncated response cuts the call off mid-JSON, and a query
 * argument that stops at `{"query":"chatplats.com overview` parses to nothing.
 * In practice a well-formed decision costs a handful of tokens, because the
 * prompt below asks for a bare tool call or one word.
 */
const RETRIEVAL_MAX_TOKENS = 300;

/**
 * How many trailing conversation turns the retrieval pass is shown.
 *
 * It only has to answer "does this need looking up, and for what", which needs
 * enough context to resolve a follow-up like "tell me more about it" and no
 * more. Everything beyond that is prompt processing paid twice per message, on
 * a CPU that charges about 12ms per token for it. Verified equivalent: the same
 * question decided identically on the full history, on a six-turn tail, and on
 * no history at all.
 */
const RETRIEVAL_HISTORY_TURNS = 8;

/**
 * How much of each older turn the retrieval pass is shown.
 *
 * Prompt processing, not generation, is what the retrieval pass costs: on this
 * CPU it runs about 12ms per token, so a decision that generates one word still
 * took 15.6 seconds against 1296 tokens of context. The bot's own replies are
 * the bulk of that - several hundred tokens each - and none of it is needed to
 * tell that "tell me more about it" refers to the thing just discussed. The
 * newest turn is exempt, because that one is the actual question.
 */
const RETRIEVAL_TURN_CHARS = 300;

/**
 * How much of a tool result the retrieval pass re-reads on later rounds.
 *
 * After a search succeeds the loop runs once more, to let the model refine or
 * follow up - and that round would otherwise re-process the entire result, at
 * the same 12ms per token. Deciding "is this enough, or do I need another
 * search" only needs to see what came back, not read it: trimming here took a
 * searching turn's retrieval phase from 49 seconds down, while the answering
 * pass still receives the untrimmed text.
 */
const RETRIEVAL_TOOL_RESULT_CHARS = 600;

/** How long we'll wait to find out whether the server is up at all. */
const HEALTH_TIMEOUT_MS = 2_000;

/**
 * How many times the retrieval pass may call tools before it has to stop.
 *
 * Each round is another generation plus another tool round trip, so this trades
 * worst-case latency against the model's ability to refine a search.
 */
const MAX_TOOL_ROUNDS = 3;

/**
 * Gemma ships as a reasoning model, and left alone it will spend the whole
 * token budget thinking and hand back an empty `content`. Both spellings are
 * sent because chat templates disagree on the name and ignore the one they
 * don't know.
 */
const DISABLE_THINKING = { thinking: false, enable_thinking: false };

type LlamaTextContent = { type: "text"; text: string };
type LlamaImageContent = { type: "image_url"; image_url: { url: string } };
type LlamaContent = string | (LlamaTextContent | LlamaImageContent)[];

type LlamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: LlamaContent;
  /** Present on an assistant turn that asked for tools. */
  tool_calls?: LlamaToolCall[];
  /** Present on a tool turn, matching the call it answers. */
  tool_call_id?: string;
};

type LlamaChatChoice = {
  finish_reason?: string;
  message?: {
    content?: string;
    reasoning_content?: string;
    tool_calls?: LlamaToolCall[];
  };
};

type LlamaChatResponse = {
  choices?: LlamaChatChoice[];
  error?: { message?: string };
};

type CompletionRequest = {
  /** Which server answers. */
  backend: LlamaBackend;
  messages: LlamaMessage[];
  /** Omitted from the body when empty; an empty array still switches the chat
   * template into tool mode, wasting tokens on a preamble the model can't use. */
  tools?: LlamaToolDefinition[];
  /** "required" makes the model call something rather than answering in prose. */
  toolChoice?: "required";
  maxTokens: number;
  timeoutMs: number;
};

/**
 * Cheap liveness probe. The model can take a while to load after the process
 * starts, and "the server isn't up yet" deserves a better reply than a raw
 * fetch error.
 * @returns Whether the llama.cpp server is accepting requests
 */
export const isLlamaAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${LLAMA_API_URL}/v1/models`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Turns a discord attachment into the data URL llama.cpp's OpenAI-compatible
 * endpoint expects. Only images are supported - the multimodal projector can't
 * do anything with a pdf or a zip.
 * @param url The discord CDN url
 * @returns A `data:` url, or "" if the download failed
 */
const attachmentToDataUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const mimeType = response.headers.get("content-type") || "image/png";
    const base64 = Buffer.from(await response.arrayBuffer()).toString("base64");

    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error("Error downloading attachment for llama:", err);
    return "";
  }
};

/**
 * Moves system turns that come after the conversation into the opening system
 * message, for models whose chat template can't place them there. See
 * `trailingSystemTurns` on {@link LlamaBackend}.
 *
 * Exported for testing.
 * @param messages The request as Fini builds it
 * @returns The same request with every system turn at the front
 */
export const foldSystemTurns = (messages: LlamaMessage[]): LlamaMessage[] => {
  const textOf = (turn: LlamaMessage) =>
    typeof turn.content === "string"
      ? turn.content
      : turn.content
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("");

  const leading = messages[0]?.role === "system" ? [textOf(messages[0])] : [];
  const rest = leading.length ? messages.slice(1) : messages;
  const later = rest.filter((turn) => turn.role === "system").map(textOf);

  if (!later.length) return messages;

  return [
    { role: "system", content: [...leading, ...later].join("\n\n") },
    ...rest.filter((turn) => turn.role !== "system"),
  ];
};

/**
 * One round trip to the model.
 * @param request What to send and how long to wait for it
 * @returns The first choice, or undefined if the server returned none
 */
const requestCompletion = async ({
  backend,
  messages,
  tools = [],
  toolChoice,
  maxTokens,
  timeoutMs,
}: CompletionRequest): Promise<LlamaChatChoice | undefined> => {
  const response = await fetch(`${backend.url}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: backend.model,
      messages: backend.trailingSystemTurns
        ? messages
        : foldSystemTurns(messages),
      max_tokens: maxTokens,
      stream: false,
      chat_template_kwargs: DISABLE_THINKING,
      ...SAMPLING_FOR[backend.name],
      ...(tools.length ? { tools } : {}),
      ...(tools.length && toolChoice ? { tool_choice: toolChoice } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `llama.cpp responded ${response.status} ${response.statusText}: ${body}`,
    );
  }

  const result: LlamaChatResponse = await response.json();

  if (result.error?.message) {
    throw new Error(`llama.cpp error: ${result.error.message}`);
  }

  return result.choices?.[0];
};

/**
 * Reduces the conversation to the cheapest form that still decides correctly.
 *
 * Older turns are trimmed to a topic-sized excerpt and any inline image is
 * dropped: running the multimodal projector twice per message is a real cost,
 * and a question that needs both an image and a web search is rare enough to
 * be worth answering without the search.
 *
 * Exported for testing.
 * @param conversation History plus the current user message
 * @returns A shortened copy safe to send to the retrieval pass
 */
export const forRetrieval = (conversation: LlamaMessage[]): LlamaMessage[] => {
  const recent = conversation.slice(-RETRIEVAL_HISTORY_TURNS);

  return recent.map((turn, index) => {
    const text =
      typeof turn.content === "string"
        ? turn.content
        : turn.content
            .map((part) => (part.type === "text" ? part.text : ""))
            .join(" ")
            .trim();

    const isNewest = index === recent.length - 1;

    return {
      ...turn,
      content:
        isNewest || text.length <= RETRIEVAL_TURN_CHARS
          ? text
          : `${text.slice(0, RETRIEVAL_TURN_CHARS)}...`,
    };
  });
};

/**
 * Whether the retrieval pass declined to search.
 *
 * Lenient about the sentinel on purpose. A 2B model asked for one exact word
 * will sometimes produce "SKIP." or "skip - no search needed", and treating
 * those as a refusal to follow the protocol would force a pointless search on
 * every piece of small talk.
 *
 * Exported for testing.
 * @param content Whatever the retrieval pass wrote instead of calling a tool
 * @returns Whether this should be read as "nothing to look up"
 */
export const isSkip = (content: string): boolean =>
  !content.trim() || content.toUpperCase().includes(RETRIEVAL_SKIP);

/**
 * Shortens a tool turn for re-reading, leaving every other turn alone.
 * @param turn One of the turns retrieval has accumulated so far
 * @returns The turn, with a long tool result cut down to an excerpt
 */
const trimToolResult = (turn: LlamaMessage): LlamaMessage => {
  if (turn.role !== "tool" || typeof turn.content !== "string") return turn;
  if (turn.content.length <= RETRIEVAL_TOOL_RESULT_CHARS) return turn;

  return {
    ...turn,
    content: `${turn.content.slice(0, RETRIEVAL_TOOL_RESULT_CHARS)}\n[...trimmed for the retrieval decision; the full result is used to answer]`,
  };
};

/**
 * Runs the retrieval pass and returns the turns it produced.
 *
 * llama.cpp hands tool calls back rather than running them, so each one is
 * executed against `POST /tools` and the result appended for the next round.
 * The turns come back as OpenAI-shaped assistant/tool pairs, ready to splice
 * into the answering conversation.
 *
 * Never throws: retrieval is an enhancement, and a search that fails must
 * degrade to an unsourced answer rather than losing the reply entirely.
 * @param conversation History plus the current user message, with no persona
 * @param tools The tools llama.cpp is currently exposing
 * @param backend Which model makes the decision
 * @returns Assistant and tool turns to append before answering, possibly empty
 */
const runRetrieval = async (
  conversation: LlamaMessage[],
  tools: LlamaToolDefinition[],
  backend: LlamaBackend,
): Promise<LlamaMessage[]> => {
  const turns: LlamaMessage[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      /*
       * The instruction goes *after* the conversation, not before it.
       *
       * As a leading system turn it loses to the transcript: asked "what is
       * chatplats.com?" over a history that already discussed the site, the
       * model ignored the protocol and wrote an answer instead of deciding.
       * Moved to the end, the same request produced a clean tool call and empty
       * content - and did so with a full history, a truncated one, and no
       * history at all. This matches the behaviour STYLE_REMINDER relies on:
       * for this model the last instruction before generation is the one that
       * holds.
       */
      const messages = [
        ...conversation,
        ...turns.map(trimToolResult),
        { role: "system" as const, content: buildRetrievalPrompt() },
      ];

      const decision = await requestCompletion({
        backend,
        messages,
        tools,
        maxTokens: RETRIEVAL_MAX_TOKENS,
        timeoutMs: RETRIEVAL_TIMEOUT_MS,
      });

      // Only the tool calls survive this pass; whatever prose came with them is
      // reasoning for a step the user never sees.
      let toolCalls = decision?.message?.tool_calls ?? [];

      /*
       * Neither a tool call nor a skip means the model ignored the protocol and
       * started composing an answer - historically "I'll check the waters for
       * the latest intel", which the user then never receives. Taking the
       * choice away recovers the search: on a transcript where that had already
       * happened twice, an ordinary request searched 0 times out of 3 and a
       * forced one 3 out of 3.
       *
       * Only ever done on the first round. A model that ignores a forced tool
       * call and then narrates again will not be talked round by a third try.
       */
      if (
        !toolCalls.length &&
        !isSkip(decision?.message?.content ?? "") &&
        round === 0
      ) {
        console.log(
          "Retrieval wrote prose instead of deciding; forcing a tool call",
        );
        const forced = await requestCompletion({
          backend,
          messages,
          tools,
          toolChoice: "required",
          maxTokens: RETRIEVAL_MAX_TOKENS,
          timeoutMs: RETRIEVAL_TIMEOUT_MS,
        });

        toolCalls = forced?.message?.tool_calls ?? [];
      }

      if (!toolCalls.length) break;

      console.log(
        `Retrieval round ${round + 1}:`,
        toolCalls.map((call) => call.function.name),
      );

      /*
       * The assistant turn is kept for its tool_calls but stripped of prose.
       * Anything it wrote was reasoning for a step the user never sees, and
       * leaving it in would put a persona-free sentence into the answering
       * context as a fresh example of how to sound.
       */
      turns.push({ role: "assistant", content: "", tool_calls: toolCalls });

      for (const toolCall of toolCalls) {
        turns.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: await executeToolCall(toolCall),
        });
      }
    }
  } catch (err) {
    console.error("Error during retrieval, answering without it:", err);

    // A half-finished round would leave an assistant turn asking for tools with
    // no tool turn answering it, which some chat templates reject outright.
    return turns.at(-1)?.role === "assistant" ? turns.slice(0, -1) : turns;
  }

  return turns;
};

/**
 * Rewrites a finished answer in the user's chosen personality.
 *
 * The answer pass runs with no persona so the voice can't change what Fini
 * says - only how it says it. This pass sees only the user's message and the
 * answer, not the history: it is restyling, not answering, and the shorter
 * prompt keeps the extra time down.
 *
 * Never throws. If the rewrite fails or comes back empty, the plain answer is
 * still a good reply.
 * @param personality The user's active personality
 * @param userMessage What the user asked, so the voice can address it
 * @param answer The finished plain answer
 * @param backend Which model does the rewrite - the one that wrote the answer
 * @returns The answer in the persona's voice, or the plain answer on failure
 */
const rewriteInPersona = async (
  personality: PersonalitiesRecord,
  userMessage: string,
  answer: string,
  backend: LlamaBackend,
): Promise<string> => {
  try {
    const choice = await requestCompletion({
      backend,
      messages: [
        // Only the bare persona here. The fuller prompt used elsewhere ends
        // with "provide helpful and accurate information", which on this pass
        // nudges the model towards copying the answer out unchanged.
        {
          role: "system",
          content: `You are ${personality.personality_name} with the personality of ${personality.prompt}.`,
        },
        { role: "user", content: userMessage },
        {
          role: "system",
          content: buildPersonaRewritePrompt(
            personality.personality_name,
            personality.prompt,
            answer,
          ),
        },
      ],
      maxTokens: MAX_CHAT_TOKENS,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    const rewritten = choice?.message?.content?.trim();
    if (rewritten) return rewritten;

    console.warn("Persona rewrite came back empty, sending the plain answer");
  } catch (err) {
    console.error("Persona rewrite failed, sending the plain answer:", err);
  }

  return answer;
};

/**
 * Picks the server for this message: the router's choice, unless that's the
 * big model and it's busy or down, in which case Gemma answers.
 * @param message What the user just said
 * @param conversationKey Identifies the conversation, for the follow-up check
 * @param previous The last exchange, so a follow-up stays with its topic
 * @param hasImage Whether an image is attached
 */
const chooseBackend = async (
  message: string,
  conversationKey: string,
  previous: PreviousExchange | undefined,
  hasImage: boolean,
): Promise<LlamaBackend> => {
  const started = Date.now();
  const decision = await routeMessage(
    message,
    conversationKey,
    previous,
    hasImage,
  );

  let backend = LIGHT_BACKEND;
  let note = decision.reason;

  if (decision.tier === "heavy") {
    if (await isHeavyAvailable()) {
      backend = HEAVY_BACKEND;
    } else {
      note = `${decision.reason}, but it is busy or down`;
    }
  }

  console.log("Routed message", {
    backend: backend.name,
    reason: note,
    pHeavy: decision.pHeavy?.toFixed(2),
    pFollowUp: decision.pFollowUp?.toFixed(2),
    ms: Date.now() - started,
  });

  return backend;
};

/**
 * Holds a conversation with the local model and returns its reply.
 * @param props The user, server, message, and any attachment or reply context
 * @returns The text to send back to discord
 */
export const converseWithLlama = async ({
  userID,
  message,
  server,
  attachment,
  reply,
  options = {},
}: AIConverseProps) => {
  try {
    console.group("Run converseWithLlama()");
    console.log("Initializing Chat", {
      userID,
      message,
      server,
      attachment,
      reply,
      options,
      url: LLAMA_API_URL,
    });

    /*
     * The turns both passes share: history plus what the user just said. The
     * system turn is *not* in here, because that is the whole point of the
     * split - retrieval gets a neutral one, the answer gets the persona.
     */
    const conversation: LlamaMessage[] = [];
    let previous: PreviousExchange | undefined;
    const conversationKey = `${server}:${userID}`;

    if (!options.skipHistory) {
      const userHistory: ChatRecord[] = await getChatHistory(
        userID,
        server,
        CHAT_TYPE,
      );
      console.log("Retrieved User History of length:", userHistory.length);

      for (const record of userHistory) {
        conversation.push({
          role: record.author === "bot" ? "assistant" : "user",
          content: record.message,
        });
      }

      // History is saved in user/bot pairs, so the last two are the last exchange.
      const [asked, answered] = userHistory.slice(-2);
      if (asked?.author === "user" && answered?.author === "bot") {
        previous = { asked: asked.message, answered: answered.message };
      }
    }

    let finalMessage = message;

    // Adding the message being replied to, if it exists, as context for the AI
    const replyContext = formatReplyContext(reply);
    if (replyContext) {
      finalMessage = `${replyContext} ${finalMessage}`;
    }

    // Inline any image attachment for the multimodal projector to look at
    const imageDataUrl = attachment?.contentType?.startsWith("image/")
      ? await attachmentToDataUrl(attachment.url)
      : "";

    if (imageDataUrl) {
      conversation.push({
        role: "user",
        content: [
          { type: "text", text: finalMessage },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      });
    } else {
      conversation.push({ role: "user", content: finalMessage });
    }

    /*
     * Tools come from whatever MCP servers llama.cpp was started with. An empty
     * list is normal - it's what you get without --mcp-servers-config - and
     * skips the retrieval pass entirely rather than spending a generation on a
     * decision with no way to act on it.
     *
     * skipHistory marks the one-shot generation commands (a poem, a death
     * battle). Those want one pass at a creative prompt, not an agent that may
     * wander off to search, so they opt out.
     */
    const [availableTools, backend] = await Promise.all([
      options.skipHistory ? [] : getAvailableTools(),
      chooseBackend(finalMessage, conversationKey, previous, !!imageDataUrl),
    ]);

    console.log("Submitting to llama.cpp for response", {
      finalMessage,
      historyTurns: conversation.length - 1,
      withImage: !!imageDataUrl,
      toolCount: availableTools.length,
    });

    const retrievalStart = Date.now();
    const toolTurns = availableTools.length
      ? // Always on the light model. Deciding whether to search is a short
        // job Gemma got right 5 times out of 5 in testing, in 4-7 seconds;
        // on the bigger model the same step took 7-16.
        await runRetrieval(
          forRetrieval(conversation),
          availableTools,
          LIGHT_BACKEND,
        )
      : [];

    if (availableTools.length) {
      console.log("Retrieval finished", {
        ms: Date.now() - retrievalStart,
        searched: toolTurns.length > 0,
      });
    }

    // Identity and grounding go in the system turn. Without an identity here
    // Gemma answered "who are you?" with "I am a large language model, trained
    // by Google" 3 times out of 3; with one, it answered as Fini.
    //
    // The identity is always plain Fini, even when the user has a personality
    // on. The personality is applied afterwards by rewriteInPersona, so it
    // changes how the answer sounds without changing what it says.
    const systemPrompt: string[] = [];

    const personality = options.skipPersonality
      ? undefined
      : await getActivePersonality(userID, server).catch((err) => {
          console.error(
            "Could not look up personality, answering plainly:",
            err,
          );
          return undefined;
        });

    if (!options.skipPersonality) {
      systemPrompt.push(NEUTRAL_PERSONALITY);
    }

    if (!options.skipHistory) {
      systemPrompt.push(buildSystemPrompt());
    }

    const answerMessages: LlamaMessage[] = [];

    if (systemPrompt.length) {
      answerMessages.push({
        role: "system",
        content: systemPrompt.join("\n\n"),
      });
    }

    answerMessages.push(...conversation, ...toolTurns);

    /*
     * The style rules are appended per request rather than stored, so they stay
     * the final turn and never leak into saved history.
     *
     * The model imitates its own recent turns far more strongly than it follows
     * the opening system prompt: with emoji and stage directions in the history
     * it reproduced them 4 times out of 4, against 0 of 4 from a clean history.
     * Restating the rules here put that back to 0.
     */
    if (!options.skipHistory) {
      answerMessages.push({
        role: "system",
        content: [STYLE_REMINDER, NO_FURTHER_RETRIEVAL].join(" "),
      });
    }

    // No tools on this pass. Retrieval is over, and attaching them here would
    // both invite another search the user never sees and break the style rules
    // above - see the invariant on STYLE_REMINDER.
    let answeredBy = backend;
    const answer = (with_: LlamaBackend) =>
      requestCompletion({
        backend: with_,
        messages: answerMessages,
        maxTokens: MAX_CHAT_TOKENS,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });

    const answerStart = Date.now();
    let choice: LlamaChatChoice | undefined;
    try {
      choice = await answer(backend);
    } catch (err) {
      // The big model is a shared server that can go away mid-request. Gemma
      // can still give an answer, which beats an error message.
      if (backend === LIGHT_BACKEND) throw err;
      console.error(
        "The heavy model failed, answering with the light one:",
        err,
      );
      answeredBy = LIGHT_BACKEND;
      choice = await answer(LIGHT_BACKEND);
    }

    console.log("Answered", {
      backend: answeredBy.name,
      ms: Date.now() - answerStart,
    });

    let responseText = choice?.message?.content?.trim() || "";

    // If a chat template ignores DISABLE_THINKING we can still end up with the
    // answer buried in the reasoning trace. Better to show that than nothing.
    if (!responseText && choice?.message?.reasoning_content?.trim()) {
      console.warn("llama.cpp returned only reasoning content, falling back");
      responseText = choice.message.reasoning_content.trim();
    }

    if (!responseText) {
      throw new Error(
        `llama.cpp returned an empty response (finish_reason: ${choice?.finish_reason})`,
      );
    }

    /*
     * History keeps the plain answer, not the persona's version. The answer
     * pass imitates its own past turns far more than it follows instructions,
     * so storing the persona's wording would feed the voice straight back into
     * the step that is meant to be free of it.
     */
    const rewriteStart = Date.now();
    const replyText = personality
      ? await rewriteInPersona(
          personality,
          finalMessage,
          responseText,
          answeredBy,
        )
      : responseText;

    if (personality) {
      console.log("Rewrote in persona", { ms: Date.now() - rewriteStart });
    }

    rememberTier(conversationKey, answeredBy.name);

    // Save both sides of the exchange. No anthropic client is passed because
    // this backend never uploads files, so there's nothing remote to clean up.
    if (!options.skipSave) {
      await saveChatMessage({
        author: "user",
        chatType: CHAT_TYPE,
        message,
        server_id: server,
        user_id: userID,
      });

      await saveChatMessage({
        author: "bot",
        chatType: CHAT_TYPE,
        message: responseText,
        server_id: server,
        user_id: userID,
      });
    }

    console.log("Completed converseWithLlama()");
    console.groupEnd();
    return replyText;
  } catch (err) {
    console.error("Error in converseWithLlama:", err);
    console.groupEnd();

    // Distinguish "the server never came up" from a genuine failure - the
    // first is the one that actually happens, right after a restart while the
    // model is still loading.
    if (!(await isLlamaAvailable())) {
      return "My local brain (llama.cpp) isn't answering right now. It may still be loading - try again in a minute, or run `/chat-config model:claude` to switch.";
    }

    return "I'm sorry, I encountered an error while trying to respond.";
  }
};
