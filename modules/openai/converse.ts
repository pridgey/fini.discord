import { Configuration, OpenAIApi, ChatCompletionRequestMessage } from "openai";

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

  const convertedMsg = msg.toLowerCase().trim();

  if (convertedMsg.startsWith("as") && convertedMsg.includes(":")) {
    const msgParts = convertedMsg.split(":");
    personality = msgParts[0].replace("as", "").trim();
    chat = msgParts[1].trim();
  }

  const prompt = chat.replace("hey fini", "");

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

  const conversationMessages: ChatCompletionRequestMessage[] =
    conversationHistory[user]?.map((context) => ({
      content: context.content,
      role: context.role,
    })) || [];

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [startingMessage, ...conversationMessages],
      user: user,
    });

    if (response.status === 200) {
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
      return "Something fucked up D:";
    }
  } catch (err) {
    return `Something fucked up D: (${err})`;
  }
};
