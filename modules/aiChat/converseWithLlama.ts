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
import { STYLE_REMINDER, buildSystemPrompt } from "./systemPrompt";
import { AIConverseProps } from "./types";

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

/** How long we'll wait to find out whether the server is up at all. */
const HEALTH_TIMEOUT_MS = 2_000;

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

/**
 * How many times the model may call tools before it has to answer.
 *
 * Each round is another full generation on CPU, so this trades worst-case
 * latency against the model's ability to refine a search. The final request is
 * always sent with no tools attached, which forces prose rather than letting a
 * confused model call search forever.
 */
const MAX_TOOL_ROUNDS = 3;

/**
 * Gemma ships as a reasoning model, and left alone it will spend the whole
 * token budget thinking and hand back an empty `content`. Both spellings are
 * sent because chat templates disagree on the name and ignore the one they
 * don't know.
 */
const DISABLE_THINKING = { thinking: false, enable_thinking: false };

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
 * Talks to the llama.cpp server running locally next to the bot, using its
 * OpenAI-compatible /v1/chat/completions endpoint.
 *
 * Deliberately narrower than the Claude path: no web search tool, and
 * attachments are inlined per-request rather than uploaded and referenced
 * later, since there's no file store to keep them in.
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

    const messages: LlamaMessage[] = [];

    /*
     * Identity and grounding go in the system turn.
     *
     * The Claude path prepends the personality to the user's message instead,
     * and Claude is strong enough to follow it there. Gemma is not: with the
     * persona in the user turn it answered "who are you?" with "I am a large
     * language model, trained by Google" 3 times out of 3, and with the same
     * text moved here it answered as Fini 3 times out of 3. An instruction
     * buried in the user's question reads as part of the question.
     */
    const systemPrompt: string[] = [];

    if (!options.skipPersonality) {
      systemPrompt.push(await determinePersonality(userID, server));
    }

    if (!options.skipHistory) {
      systemPrompt.push(buildSystemPrompt());
    }

    if (systemPrompt.length) {
      messages.push({ role: "system", content: systemPrompt.join("\n\n") });
    }

    // Retrieve and format the user's history with this backend
    if (!options.skipHistory) {
      const userHistory: ChatRecord[] = await getChatHistory(
        userID,
        server,
        CHAT_TYPE,
      );
      console.log("Retrieved User History of length:", userHistory.length);

      for (const record of userHistory) {
        messages.push({
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
      messages.push({
        role: "user",
        content: [
          { type: "text", text: finalMessage },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      });
    } else {
      messages.push({ role: "user", content: finalMessage });
    }

    /** One round trip to the model. */
    const requestCompletion = async (
      tools: LlamaToolDefinition[],
    ): Promise<LlamaChatChoice | undefined> => {
      const response = await fetch(`${LLAMA_API_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LLAMA_MODEL,
          /*
           * The style reminder is appended per request rather than stored, so
           * it stays the final turn even after the tool loop has appended tool
           * results - and never leaks into saved history.
           *
           * The model imitates its own recent turns far more strongly than it
           * follows the opening system prompt: with emoji and stage directions
           * in the history it reproduced them 4 times out of 4, against 0 of 4
           * from a clean history. Restating the rules here put that back to 0.
           */
          messages: options.skipHistory
            ? messages
            : [...messages, { role: "system", content: STYLE_REMINDER }],
          max_tokens: MAX_CHAT_TOKENS,
          stream: false,
          chat_template_kwargs: DISABLE_THINKING,
          ...SAMPLING,
          // Omitted entirely when empty - an empty array still switches the
          // chat template into tool mode, which wastes tokens on a tool
          // preamble the model can never use.
          ...(tools.length ? { tools } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

    /*
     * Tools come from whatever MCP servers llama.cpp was started with. An empty
     * list is normal - it's what you get without --mcp-servers-config - and
     * simply skips the loop below.
     *
     * skipHistory marks the one-shot generation commands (a poem, a death
     * battle). Those want one pass at a creative prompt, not an agent that may
     * wander off to search, so they opt out.
     */
    const availableTools = options.skipHistory ? [] : await getAvailableTools();

    console.log("Submitting to llama.cpp for response", {
      finalMessage,
      messageCount: messages.length,
      withImage: !!imageDataUrl,
      toolCount: availableTools.length,
    });

    /*
     * The agent loop.
     *
     * llama.cpp hands tool calls back rather than running them, so we execute
     * each one against `POST /tools` and continue the conversation with the
     * results. The last round deliberately offers no tools, so the model has to
     * produce prose instead of looping on search forever.
     */
    let choice: LlamaChatChoice | undefined;

    for (let round = 0; ; round++) {
      const toolsForRound = round < MAX_TOOL_ROUNDS ? availableTools : [];
      choice = await requestCompletion(toolsForRound);

      const toolCalls = choice?.message?.tool_calls ?? [];
      if (!toolCalls.length) break;

      console.log(
        `Tool round ${round + 1}:`,
        toolCalls.map((call) => call.function.name),
      );

      messages.push({
        role: "assistant",
        content: choice?.message?.content || "",
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: await executeToolCall(toolCall),
        });
      }
    }

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
