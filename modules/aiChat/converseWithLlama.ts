import { ChatRecord } from "../../types/PocketbaseTables";
import { CHAT_TYPE_LLAMA } from "./chatTypes";
import { LLAMA_API_URL, LLAMA_MODEL } from "./llamaConfig";
import {
  executeToolCall,
  getAvailableTools,
  type LlamaToolCall,
  type LlamaToolDefinition,
} from "./llamaTools";
import { determinePersonality } from "./determinePersonality";
import { getChatHistory } from "./getChatHistory";
import { saveChatMessage } from "./saveChatMessage";
import { formatReplyContext } from "./formatReplyContext";
import {
  NO_FURTHER_RETRIEVAL,
  RETRIEVAL_SKIP,
  STYLE_REMINDER,
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
 *   2. Answer - the user-visible generation, carrying the persona and the style
 *      rules, with any tool results already in context and no tools attached.
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
 * One round trip to the model.
 * @param request What to send and how long to wait for it
 * @returns The first choice, or undefined if the server returned none
 */
const requestCompletion = async ({
  messages,
  tools = [],
  toolChoice,
  maxTokens,
  timeoutMs,
}: CompletionRequest): Promise<LlamaChatChoice | undefined> => {
  const response = await fetch(`${LLAMA_API_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLAMA_MODEL,
      messages,
      max_tokens: maxTokens,
      stream: false,
      chat_template_kwargs: DISABLE_THINKING,
      ...SAMPLING,
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
 * @returns Assistant and tool turns to append before answering, possibly empty
 */
const runRetrieval = async (
  conversation: LlamaMessage[],
  tools: LlamaToolDefinition[],
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
    const availableTools = options.skipHistory ? [] : await getAvailableTools();

    console.log("Submitting to llama.cpp for response", {
      finalMessage,
      historyTurns: conversation.length - 1,
      withImage: !!imageDataUrl,
      toolCount: availableTools.length,
    });

    const retrievalStart = Date.now();
    const toolTurns = availableTools.length
      ? await runRetrieval(forRetrieval(conversation), availableTools)
      : [];

    if (availableTools.length) {
      console.log("Retrieval finished", {
        ms: Date.now() - retrievalStart,
        searched: toolTurns.length > 0,
      });
    }

    // Identity and grounding go in the system turn, and only on this pass.
    //
    // The Claude path prepends the personality to the user's message instead,
    // and Claude is strong enough to follow it there. Gemma is not: with the
    // persona in the user turn it answered "who are you?" with "I am a large
    // language model, trained by Google" 3 times out of 3, and with the same
    // text moved here it answered as Fini 3 times out of 3. An instruction
    // buried in the user's question reads as part of the question.
    const systemPrompt: string[] = [];

    if (!options.skipPersonality) {
      systemPrompt.push(await determinePersonality(userID, server));
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
    const choice = await requestCompletion({
      messages: answerMessages,
      maxTokens: MAX_CHAT_TOKENS,
      timeoutMs: REQUEST_TIMEOUT_MS,
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
    return responseText;
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
