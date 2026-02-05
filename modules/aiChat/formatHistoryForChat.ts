import Anthropic from "@anthropic-ai/sdk";
import { ChatRecord } from "../../types/PocketbaseTables";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { Beta } from "@anthropic-ai/sdk/resources/beta/beta";
import { determineAnthropicFileType } from "./determineAnthropicFileType";

/**
 * Formats the database chat history into a format suitable for the AI chat API
 * @param userHistory
 * @param anthropic
 * @returns
 */
export const formatHistoryForChat = async (
  userHistory: ChatRecord[],
  anthropic: Anthropic,
): Promise<MessageParam[]> => {
  let formattedHistory: MessageParam[] = [];

  if (userHistory.length > 0) {
    formattedHistory = await Promise.all(
      userHistory.map(async (userHistoryChat) => {
        type BetaMessageParam = Beta.Messages.BetaMessageParam;
        const chatMessage: BetaMessageParam = {
          role: userHistoryChat.author === "bot" ? "assistant" : "user",
          content: "",
        };

        if (userHistoryChat.attachment) {
          const fileMetaData = await anthropic.beta.files.retrieveMetadata(
            userHistoryChat.attachment,
          );

          let fileType: "container_upload" | "image" | "document" =
            determineAnthropicFileType(fileMetaData.mime_type || "");

          // Build the content blocks with the attachment
          chatMessage["content"] = [
            {
              type: "text",
              text: userHistoryChat.message,
            },
            {
              type: fileType,
              source: {
                type: "file",
                file_id: userHistoryChat.attachment,
              },
            } as Beta.Messages.BetaContentBlockParam,
          ];
        } else {
          // No attachments means a much simpler content block
          chatMessage["content"] = userHistoryChat.message;
        }

        return chatMessage as MessageParam;
      }),
    );
  }

  return formattedHistory;
};
