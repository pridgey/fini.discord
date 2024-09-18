import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionSystemMessageParam,
} from "openai/resources/index";
import type { OpenAIError } from "openai/error";
import { addHistory, getHistory } from "../../utilities/chatHistory";
import { pb } from "../../utilities/pocketbase";
import { PersonalitiesRecord } from "../../types/PocketbaseTables";

// Length of conversation history array
const historyMax = 10;

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
export const chatWithUser_OpenAI = async (
  user: string,
  msg: string,
  server: string,
  attachmentURL?: string
) => {
  console.log("Run chatWithUser()", { user, msg });
  // Instantiate openai
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "no_key_found",
  });

  // Chat variables
  let chat = msg.replace(new RegExp("hey fini", "i"), "").trim();

  // Find any personality the user would like us to use
  try {
    const foundPersonalities = await pb
      .collection<PersonalitiesRecord>("personalities")
      .getFullList({
        filter: `user_id = "${user}" && active = true`,
      });

    const foundPersonality =
      foundPersonalities.length > 0 ? foundPersonalities[0] : undefined;

    chat = !!foundPersonality
      ? `You are ${
          foundPersonality!.personality_name
        } with the personality of ${foundPersonality!.prompt} ${chat}`
      : chat;

    // // Craft the opening message
    // const startingMessage: ChatCompletionSystemMessageParam = {
    //   role: "system",
    //   content: personality,
    // };

    // Get history from logs and transform to proper type
    const chatLogs = await getHistory(user, server, "openai");
    const userHistory: ChatCompletionMessageParam[] = chatLogs.map(
      (record) => ({
        content: record.message,
        role: record.author === "bot" ? "assistant" : "user",
      })
    );

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
    const openaiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
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

      // Add user's original message to history
      await addHistory({
        author: "user",
        chatType: "openai",
        message: chat,
        server_id: server,
        user_id: user,
      });

      await addHistory({
        author: "bot",
        chatType: "openai",
        message: randomChoice?.message.content ?? "",
        server_id: server,
        user_id: user,
      });

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
