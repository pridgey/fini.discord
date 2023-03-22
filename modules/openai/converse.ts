import { Configuration, OpenAIApi, ChatCompletionRequestMessage } from "openai";
import type { CreateChatCompletionResponse } from "openai";
import type { AxiosResponse } from "axios";

type HistoryProps = {
  role: "user" | "assistant";
  content: string;
};

const conversationHistory: { [key: string]: HistoryProps[] } = {};

const historyMax = 10;

export const chatWithUser = async (user: string, msg: string) => {
  // Createopenai configuration object
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Instanstiate openai api
  const openai = new OpenAIApi(configuration);

  // Placeholders
  let personality;
  let chat = msg;

  // Easier to work with
  const convertedMsg = msg.toLowerCase().trim();

  // Check if we're including a personality for this
  if (convertedMsg.startsWith("as") && convertedMsg.includes(":")) {
    const msgParts = convertedMsg.split(":");
    personality = msgParts[0].replace("as", "").trim();
    chat = msgParts[1].trim();
  }

  const prompt = chat.replace("hey fini", "");

  // Setup message object for the personality
  const startingMessage: ChatCompletionRequestMessage = {
    content: personality
      ? `You are ${personality}`
      : "You are a helpful assistant",
    role: "system",
  };

  // Add conversation parts to history
  if (!conversationHistory[user]) {
    conversationHistory[user] = [];
  }
  conversationHistory[user].push({
    role: "user",
    content: prompt,
  });

  // Transforms message history into chat message objects
  const conversationMessages: ChatCompletionRequestMessage[] =
    conversationHistory[user]?.map((context) => ({
      content: context.content,
      role: context.role,
    })) || [];

  // Hit the api
  // try {
  // Combine the personality, conversation history, and latest prompt into one array
  const combinedMessages = [startingMessage, ...conversationMessages];

  try {
    // Call api and wait for response
    const gpt4response = await getChatResponse(
      combinedMessages,
      openai,
      "gpt-4"
    );

    return parseChatResponse(user, gpt4response);
  } catch (err) {
    console.log("gpt-4 api call failure:", { err });
    // Try 3.5 instead
    try {
      const gpt35response = await getChatResponse(
        combinedMessages,
        openai,
        "gpt-3.5"
      );

      return parseChatResponse(user, gpt35response);
    } catch (err) {
      console.log("gpt-3.5 api call failure:", { err });
      return "Error calling api. D:";
    }
  }
};

// helper function to call the api
const getChatResponse = async (
  messages: ChatCompletionRequestMessage[],
  openai: OpenAIApi,
  model: "gpt-4" | "gpt-3.5"
) => {
  console.log("Calling OpenAI Chat Completion with:", { messages, model });
  const response = await openai.createChatCompletion({
    model,
    messages,
  });

  return response;
};

// helper function to parse response from api
const parseChatResponse = (
  user: string,
  response: AxiosResponse<CreateChatCompletionResponse, any>
) => {
  if (response.status === 200) {
    // Everything is good, let's grab a random response
    console.log("Response:", { response });
    const choices = response?.data?.choices;
    const rand = Math.round(Math.random() * (choices.length - 1));

    // Add response to history
    conversationHistory[user].push({
      role: "assistant",
      content: choices[rand].message?.content || "",
    });

    // Remove the first item if we are above 5
    if (conversationHistory[user].length > historyMax) {
      conversationHistory[user] = conversationHistory[user].slice(historyMax);
    }

    // Display message to user in chat
    return choices[rand].message?.content || "";
  } else {
    // Something went wrong
    return "Something fucked up D:";
  }
};
