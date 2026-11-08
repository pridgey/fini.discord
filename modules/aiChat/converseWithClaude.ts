import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { Beta, Model } from "@anthropic-ai/sdk/resources";
import { determineAnthropicFileType } from "./determineAnthropicFileType";
import { determinePersonality } from "./determinePersonality";
import { formatHistoryForChat } from "./formatHistoryForChat";
import { getChatHistory } from "./getChatHistory";
import { saveChatMessage } from "./saveChatMessage";
import { ChatRecord } from "../../types/PocketbaseTables";
import { getCapabilityDigest } from "../help/capabilityDigest";
import { AIConverseProps } from "./types";
import { buildSystemPrompt } from "./systemPrompt";
import { formatReplyContext } from "./formatReplyContext";
import { CHAT_TYPE_ANTHROPIC } from "./chatTypes";

/**
 * Sonnet 5.5 thinks before it answers, and that thinking is billed against
 * this same limit. At the old 2000 the thinking left a few hundred tokens for
 * the reply, and answers stopped mid-sentence. 16000 is the most a
 * non-streaming request can ask for without risking an HTTP timeout.
 */
const MAX_CHAT_TOKENS = 16000;
const CURRENT_MODEL: Model = "claude-sonnet-5-5";

/**
 * How hard the model thinks. The default ("high") is tuned for coding and
 * agent work; chat with the odd web search reads just as well at "medium" and
 * spends far less of the budget before it starts answering.
 */
const CHAT_EFFORT = "medium";

/**
 * A web search can run long enough that the API hands the turn back with
 * `pause_turn` before the answer is written. Resending lets it finish; this
 * caps how many times we do that.
 */
const MAX_CONTINUATIONS = 3;

/** Sent when the model's safety checks decline to answer. */
const REFUSAL_REPLY =
  "I can't help with that one. Try rephrasing, or ask me something else.";

/** Tacked onto an answer that ran out of room, so it doesn't just stop. */
const TRUNCATED_NOTE =
  '\n\n(I ran out of room there. Say "hey fini continue" and I\'ll pick up where I left off.)';

export const converseWithClaude = async ({
  userID,
  message,
  server,
  attachment,
  reply,
  options = {},
}: AIConverseProps) => {
  try {
    console.group("Run converseWithClaude()");
    console.log("Initializing Chat", {
      userID,
      message,
      server,
      attachment,
      reply,
      options,
    });

    // Initialize the AI agent
    const anthropic = new Anthropic();

    // Retrieve the user chat history
    let userHistory: ChatRecord[] = [];
    if (!options.skipHistory) {
      userHistory = await getChatHistory(userID, server, CHAT_TYPE_ANTHROPIC);
      console.log("Retrieved User History of length:", userHistory.length);
    }

    // Format history for the AI
    type BetaMessageParam = Beta.Messages.BetaMessageParam;
    let formattedHistory: BetaMessageParam[] = [];
    if (!options.skipHistory) {
      formattedHistory = await formatHistoryForChat(userHistory, anthropic);
      console.log("Formatted History for AI length:", formattedHistory.length);
    }

    // Upload any attachment URL to Anthropic storage
    let anthropicFileID = "";
    if (attachment) {
      // Download the file from discord
      const response = await fetch(attachment.url);
      const blob = await response.blob();

      const actualMimeType =
        response.headers.get("content-type") ||
        attachment.contentType ||
        blob.type;

      // Upload to anthropic
      const uploadResponse = await anthropic.beta.files.upload({
        file: await toFile(blob, attachment.name || "attachment", {
          type: actualMimeType || undefined,
        }),
      });
      anthropicFileID = uploadResponse.id;
      console.log("Uploaded Attachment to Anthropic:", uploadResponse);
    }

    let finalMessage = message;

    // Adding the message being replied to, if it exists, as context for the AI
    const replyContext = formatReplyContext(reply);
    if (replyContext) {
      finalMessage = `${replyContext} ${finalMessage}`;
    }

    // Append the current message to the history
    if (anthropicFileID) {
      // Determine the file type for the attachment and build message param
      const fileType = determineAnthropicFileType(
        attachment?.contentType || "",
      );

      formattedHistory.push({
        role: "user",
        content: [
          {
            type: "text",
            text: finalMessage,
          },
          {
            type: fileType,
            source: {
              type: "file",
              file_id: anthropicFileID,
            },
          } as Beta.Messages.BetaContentBlockParam,
        ],
      });
    } else {
      // No attachment, simple message
      formattedHistory.push({
        role: "user",
        content: finalMessage,
      });
    }

    /*
     * Identity and grounding go in the `system` parameter, matching the llama
     * path. This used to be unshifted onto the history as an `assistant` turn -
     * i.e. the model was shown its own instructions as something it had already
     * said, which is both weaker steering and an odd shape (a conversation
     * opening with the assistant). The personality used to ride on the front of
     * the user's message for the same reason; both belong here.
     */
    const systemPrompt: string[] = [];

    if (!options.skipPersonality) {
      systemPrompt.push(await determinePersonality(userID, server));
    }

    /*
     * The command list rides in the system prompt here rather than behind a
     * tool the way the llama path does it. This call is a single
     * `messages.create` with no agent loop, so a client-side tool would mean
     * building one - and at roughly 600 tokens the digest is not worth that
     * against Claude's prompt pricing. The local model's arithmetic is very
     * different; see `llamaTools.ts`.
     */
    if (!options.skipHistory) {
      systemPrompt.push(
        buildSystemPrompt(new Date(), await getCapabilityDigest()),
      );
    }

    console.log("Submitting to Anthropic for response", { finalMessage });

    const request: Omit<
      Beta.Messages.MessageCreateParamsNonStreaming,
      "messages"
    > = {
      model: CURRENT_MODEL,
      max_tokens: MAX_CHAT_TOKENS,
      ...(systemPrompt.length ? { system: systemPrompt.join("\n\n") } : {}),
      output_config: { effort: CHAT_EFFORT },
      betas: ["files-api-2025-04-14"],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        },
      ],
    };

    let anthropicMessageResponse = await anthropic.beta.messages.create({
      ...request,
      messages: formattedHistory,
    });

    // The text so far is kept across continuations: a paused turn may already
    // have written part of the answer before it searched again.
    const textParts: string[] = [];
    const collectText = (response: Beta.BetaMessage) =>
      textParts.push(
        ...response.content
          .filter((block): block is Beta.BetaTextBlock => block.type === "text")
          .map((block) => block.text),
      );
    collectText(anthropicMessageResponse);

    // A paused turn is resumed by sending its content back as the assistant
    // turn, unchanged - thinking and search blocks included.
    const continued: BetaMessageParam[] = [...formattedHistory];
    for (
      let attempt = 0;
      anthropicMessageResponse.stop_reason === "pause_turn" &&
      attempt < MAX_CONTINUATIONS;
      attempt++
    ) {
      continued.push({
        role: "assistant",
        content: anthropicMessageResponse.content,
      });
      anthropicMessageResponse = await anthropic.beta.messages.create({
        ...request,
        messages: continued,
      });
      collectText(anthropicMessageResponse);
    }

    const stopReason = anthropicMessageResponse.stop_reason;
    console.log("Anthropic finished", {
      stopReason,
      usage: anthropicMessageResponse.usage,
    });

    if (stopReason === "refusal") {
      // Nothing is saved: a refused exchange in history makes the next
      // message more likely to be refused too.
      console.groupEnd();
      return REFUSAL_REPLY;
    }

    let anthropicResponseText = textParts.join("").trim();

    if (!anthropicResponseText) {
      throw new Error(`Claude returned no text (stop_reason: ${stopReason})`);
    }

    // The note goes to discord only; history keeps the answer as written so
    // "continue" picks up from its real last word.
    const replyText =
      stopReason === "max_tokens" || stopReason === "pause_turn"
        ? anthropicResponseText + TRUNCATED_NOTE
        : anthropicResponseText;

    // Save the user message to history
    if (!options.skipSave) {
      await saveChatMessage(
        {
          author: "user",
          chatType: CHAT_TYPE_ANTHROPIC,
          message: message,
          server_id: server,
          user_id: userID,
          attachment: anthropicFileID,
        },
        anthropic,
      );

      // Save the bot response to history
      await saveChatMessage(
        {
          author: "bot",
          chatType: CHAT_TYPE_ANTHROPIC,
          message: anthropicResponseText,
          server_id: server,
          user_id: userID,
        },
        anthropic,
      );
    }

    console.log("Completed converseWithClaude()");
    console.groupEnd();
    return replyText;
  } catch (err) {
    console.error("Error in converseWithClaude:", err);
    console.groupEnd();
    return "I'm sorry, I encountered an error while trying to respond.";
  }
};
