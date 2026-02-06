import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { Beta, Model } from "@anthropic-ai/sdk/resources";
import { Attachment } from "discord.js";
import { determineAnthropicFileType } from "./determineAnthropicFileType";
import { determinePersonality } from "./determinePersonality";
import { formatHistoryForChat } from "./formatHistoryForChat";
import { getChatHistory } from "./getChatHistory";
import { saveChatMessage } from "./saveChatMessage";

const MAX_CHAT_TOKENS = 2000;
const CURRENT_MODEL: Model = "claude-sonnet-4-5-20250929";

type AIConverseProps = {
  userID: string;
  message: string;
  server: string;
  attachment?: Attachment;
};

export const converseWithAI = async ({
  userID,
  message,
  server,
  attachment,
}: AIConverseProps) => {
  try {
    console.group("Run chatWithUser()");
    console.log("Initializing Chat", { userID, message, server, attachment });

    // Initialize the AI agent
    const anthropic = new Anthropic();

    // Retrieve the user chat history
    const userHistory = await getChatHistory(userID, server, "anthropic");
    console.log("Retrieved User History of length:", userHistory.length);

    // Format history for the AI
    type BetaMessageParam = Beta.Messages.BetaMessageParam;
    let formattedHistory: BetaMessageParam[] = await formatHistoryForChat(
      userHistory,
      anthropic,
    );
    console.log("Formatted History for AI length:", formattedHistory.length);

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

    // Find any personality the user would like us to use
    const personalityPrompt = await determinePersonality(userID, server);

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
            text: `${personalityPrompt} ${message}`,
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
        content: `${personalityPrompt} ${message}`,
      });
    }

    console.log("Submitting to Anthropic for response");
    const anthropicMessageResponse = await anthropic.beta.messages.create({
      model: CURRENT_MODEL,
      max_tokens: MAX_CHAT_TOKENS,
      messages: formattedHistory,
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
    await saveChatMessage(
      {
        author: "user",
        chatType: "anthropic",
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
        chatType: "anthropic",
        message: anthropicResponseText,
        server_id: server,
        user_id: userID,
      },
      anthropic,
    );

    console.log("Completed converseWithAI()");
    console.groupEnd();
    return anthropicResponseText;
  } catch (err) {
    console.error("Error in converseWithAI:", err);
    console.groupEnd();
    return "I'm sorry, I encountered an error while trying to respond.";
  }
};
