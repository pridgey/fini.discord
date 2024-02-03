import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionSystemMessageParam,
} from "openai/resources/index";
import type { OpenAIError } from "openai/error";

// Length of conversation history array
const historyMax = 10;

// Object containing everyone's conversation history
// Stored in memory (for now)
/*
export interface ChatCompletionUserMessageParam {
  content: string | Array<ChatCompletionContentPart> | null;
  role: 'user';
}
*/
const conversationHistory: { [key: string]: ChatCompletionMessageParam[] } = {};

// Function for determining if a personality is included in the message
const determinePersonality = (msg: string) => {
  let personality = "";
  let restOfMessage = msg;
  if (msg.startsWith("as") && msg.includes(":")) {
    const msgParts = msg.split(":");
    personality = msgParts[0].replace("as", "").trim();
    restOfMessage = msgParts[1].trim();
  }
  return { personality, restOfMessage };
};

// Function for determing if the message includes an image url
const determineImageUrl = (msg: string, attachmentURL?: string) => {
  if (attachmentURL) {
    return { imageUrl: attachmentURL, restOfMessage: msg };
  }

  const imageUrlPattern = /(http(s?):)([/|.|\w|\s|-])*\.(?:jpg|gif|png)/g;

  const foundImages = msg.match(imageUrlPattern);

  let imageUrl = "";
  let restOfMessage = msg;

  if (!!foundImages?.length) {
    imageUrl = foundImages[0];
    restOfMessage = msg.replace(imageUrl, "").trim();
  }

  return { imageUrl, restOfMessage };
};

// Function that runs when "hey fini ..." is spoken in chat
export const chatWithUser = async (
  user: string,
  msg: string,
  attachmentURL?: string
) => {
  console.log("Run chatWithUser()", { user, msg });
  // Instantiate openai
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "no_key_found",
  });

  // Chat variables
  let personality;
  let chat = msg;

  // clean up user message
  const cleanMsg = msg.toLowerCase().replace("hey fini", "").trim();

  // Find any personality the user would like us to use
  const personalityResult = determinePersonality(cleanMsg);
  personality = personalityResult.personality || "a helpful assistant";
  chat = personalityResult.restOfMessage;

  // Craft the opening message
  const startingMessage: ChatCompletionSystemMessageParam = {
    role: "system",
    content: `You are ${personality}`,
  };

  // Create user's chat history if it doesn't exist
  if (!conversationHistory[user]) {
    conversationHistory[user] = [];
  }

  // This will represent the chat history for the user
  const userHistory: ChatCompletionMessageParam[] = [
    startingMessage,
    ...conversationHistory[user],
  ];

  // Determine if this is an image request
  const imageResult = determineImageUrl(chat, attachmentURL);
  chat = imageResult.restOfMessage;

  // Craft the new message
  // If this is an image message, format the content differently
  const newMessage: ChatCompletionUserMessageParam = {
    role: "user",
    content: imageResult.imageUrl
      ? [
          {
            type: "text",
            text: chat,
          },
          {
            type: "image_url",
            image_url: { url: imageResult.imageUrl },
          },
        ]
      : chat,
  };

  // Call the api
  try {
    const openaiResponse = await openai.chat.completions.create({
      model:
        imageResult.imageUrl ||
        userHistory.some(
          (h) => Array.isArray(h.content) && h.content[1].type === "image_url"
        )
          ? "gpt-4-vision-preview"
          : "gpt-4-1106-preview",
      messages: [...userHistory, newMessage],
      max_tokens: 900,
    });

    if (!!openaiResponse.choices.length) {
      // Call succeeded

      // Grab a random choice
      const rand = Math.round(
        Math.random() * (openaiResponse.choices.length - 1)
      );
      const randomChoice = openaiResponse.choices.at(rand);
      console.log("gpt-4 api call success:", {
        choicesLen: openaiResponse.choices.length,
        selected: randomChoice,
      });

      // Add the user message, and response, to the user history
      const responseObject: ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: randomChoice?.message.content || "",
      };
      conversationHistory[user].push(newMessage, responseObject);

      // Remove messages beyond the max limit
      if (conversationHistory[user].length > historyMax) {
        conversationHistory[user] = conversationHistory[user].slice(historyMax);
      }

      return randomChoice?.message.content || "";
    } else {
      // Call failed
      console.log("gpt-4 api call returned no choices");
      return "I... don't know. D:";
    }
  } catch (err: unknown) {
    console.log("gpt-4 api call failure:", { err });
    return `Error calling the api D:${
      (err as OpenAIError)?.message ? `\n${(err as OpenAIError).message}` : ""
    }`;
  }
};

/*
export type ChatCompletionMessageParam =
  | ChatCompletionSystemMessageParam
  | ChatCompletionUserMessageParam
  | ChatCompletionAssistantMessageParam
  | ChatCompletionToolMessageParam
  | ChatCompletionFunctionMessageParam;
  
export interface ChatCompletionUserMessageParam {
  content: string | Array<ChatCompletionContentPart> | null;
  role: 'user';
}

export type ChatCompletionContentPart = ChatCompletionContentPartText | ChatCompletionContentPartImage;

export interface ChatCompletionContentPartText {
  text: string;
  type: 'text';
}

export interface ChatCompletionContentPartImage {
  image_url: ChatCompletionContentPartImage.ImageURL;
  type: 'image_url';
}

*/
