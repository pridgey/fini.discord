import ollama from "ollama";
import type { Message } from "ollama";
import type { Attachment, Collection } from "discord.js";
import { addHistory, getHistory } from "../../utilities/chatHistory";

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
  server: string,
  attachments?: Collection<string, Attachment>,
  code?: boolean
) => {
  console.log("Run Llama chatWithUser()", { user, msg });

  // clean up user message
  const cleanMsg = msg.trim();

  // Grab chat logs from server and convert to proper type
  const chatLogs = await getHistory(user, server, "llama");
  const userHistory: Message[] = chatLogs.map((record) => ({
    content: record.message,
    role: record.author === "bot" ? "system" : "user",
  }));

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
        : "llama3",
      messages: [...userHistory, userMessage],
    });

    console.log("Llama chat", { response });

    const responseText = response.message.content;

    // Add user's new message
    await addHistory({
      author: "user",
      chatType: "llama",
      message: cleanMsg,
      server_id: server,
      user_id: user,
    });

    // Add chat response
    await addHistory({
      author: "bot",
      chatType: "llama",
      message: responseText,
      server_id: server,
      user_id: user,
    });

    // Return ai generated text
    return responseText || "";
  } catch (err) {
    console.error("Error running LlamaAI Chat:", err);
    return `Error with LlamaAI API D: (${err})`;
  }
};
