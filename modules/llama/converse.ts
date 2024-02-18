import ollama from "ollama";
import type { Message } from "ollama";
import type { Attachment, Collection } from "discord.js";

// Length of conversation history array
const historyMax = 10;

// Object containing everyone's conversation history
// Stored in memory (for now)
const conversationHistory: { [key: string]: Message[] } = {};

// Utility function to convert discord.js attachment to base64
const attachmentToBase64 = async (attachment: Attachment) => {
  try {
    // Fetch the attachment via url
    const response = await fetch(attachment.url);

    const buffer = await response.arrayBuffer();

    const base64 = Buffer.from(buffer).toString("base64");

    return base64;
  } catch (err) {
    return "";
  }
};

// Function that runs when "hey fini ..." is spoken in chat
export const chatWithUser_Llama = async (
  user: string,
  msg: string,
  attachments?: Collection<string, Attachment>,
  code?: boolean
) => {
  console.log("Run Llama chatWithUser()", { user, msg });

  // clean up user message
  const cleanMsg = msg.toLowerCase().replace("hey fini -l", "").trim();

  // Create user's chat history if it doesn't exist
  if (!conversationHistory[user]) {
    conversationHistory[user] = [];
  }

  // This will represent the chat history for the user
  const userHistory: Message[] = [...conversationHistory[user]];

  const attachmentStrings: string[] = [];
  if (attachments) {
    for (const attachment of attachments) {
      const base64String = await attachmentToBase64(attachment[1]);
      attachmentStrings.push(base64String);
    }
  }

  // Construct new message
  const userMessage: Message = {
    content: cleanMsg,
    role: "user",
    images: attachmentStrings,
  };

  try {
    // Create the chat from the model
    const response = await ollama.chat({
      model: code
        ? "codellama:7b"
        : userMessage.images?.length
        ? "llava"
        : "llama2-uncensored",
      messages: [...userHistory, userMessage],
    });

    console.log("Llama chat", { response });

    const responseText = response.message.content;

    // Add response to history
    conversationHistory[user].push(
      ...[
        userMessage,
        {
          role: "system",
          content: responseText,
        },
      ]
    );

    // Remove messages beyond the max limit
    if (conversationHistory[user].length > historyMax) {
      conversationHistory[user] = conversationHistory[user].slice(historyMax);
    }

    // Return ai generated text
    return responseText || "";
  } catch (err) {
    console.error("Error running LlamaAI Chat:", err);
    return `Error with LlamaAI API D: (${err})`;
  }
};
