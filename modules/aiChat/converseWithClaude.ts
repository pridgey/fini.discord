import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { Beta, Model } from "@anthropic-ai/sdk/resources";
import { determineAnthropicFileType } from "./determineAnthropicFileType";
import { determinePersonality } from "./determinePersonality";
import { formatHistoryForChat } from "./formatHistoryForChat";
import { getChatHistory } from "./getChatHistory";
import { saveChatMessage } from "./saveChatMessage";
import { ChatRecord } from "../../types/PocketbaseTables";
import { AIConverseProps } from "./types";
import { buildSystemPrompt } from "./systemPrompt";
import { formatReplyContext } from "./formatReplyContext";
import { CHAT_TYPE_ANTHROPIC } from "./chatTypes";

const MAX_CHAT_TOKENS = 2000;
const CURRENT_MODEL: Model = "claude-sonnet-4-5-20250929";

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

    if (!options.skipHistory) {
      systemPrompt.push(buildSystemPrompt());
    }

    console.log("Submitting to Anthropic for response", { finalMessage });
    const anthropicMessageResponse = await anthropic.beta.messages.create({
      model: CURRENT_MODEL,
      max_tokens: MAX_CHAT_TOKENS,
      messages: formattedHistory,
      ...(systemPrompt.length
        ? { system: systemPrompt.join("\n\n") }
        : {}),
      betas: ["files-api-2025-04-14"],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        },
      ],
    });
    console.log("Anthropic Response:", anthropicMessageResponse);

    const anthropicResponseText =
      anthropicMessageResponse.content
        .filter((block) => block.type === "text")
        ?.map((block) => block.text)
        .join("") || "";

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
    return anthropicResponseText;
  } catch (err) {
    console.error("Error in converseWithClaude:", err);
    console.groupEnd();
    return "I'm sorry, I encountered an error while trying to respond.";
  }
};
