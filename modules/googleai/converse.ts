import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";

// Length of conversation history array
const historyMax = 10;

// Type for Chat messages
type ChatMessageProps = {
  role: "user" | "model";
  parts: string;
};

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY || "");

// Object containing everyone's conversation history
// Stored in memory (for now)
const conversationHistory: { [key: string]: ChatMessageProps[] } = {};

// Function that runs when "hey fini ..." is spoken in chat
export const chatWithUser_Google = async (user: string, msg: string) => {
  console.log("Run Google chatWithUser()", { user, msg });
  // Instantiate openai
  const model = genAI.getGenerativeModel({
    model: "gemini-pro",
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
  });

  // clean up user message
  const cleanMsg = msg.toLowerCase().replace("hey fini -g", "").trim();

  // Craft the opening message
  const startingMessages: ChatMessageProps[] = [
    {
      role: "user",
      parts: `Hello`,
    },
    {
      role: "model",
      parts: `Hi I'm a helpful discord chatbot named Fini`,
    },
  ];

  // Create user's chat history if it doesn't exist
  if (!conversationHistory[user]) {
    conversationHistory[user] = [];
  }

  // This will represent the chat history for the user
  const userHistory: ChatMessageProps[] = [
    ...startingMessages,
    ...conversationHistory[user],
  ];

  try {
    // Create the chat from the model
    const chat = model.startChat({
      history: userHistory,
      generationConfig: {
        maxOutputTokens: 900,
      },
    });

    console.log("User History:", userHistory);

    // Send new message to the chat object
    const result = await chat.sendMessage(cleanMsg);

    // Parse the response
    const response = await result.response;
    const responseText = response.text();

    // Add response to history
    conversationHistory[user].push(
      ...[
        {
          role: "user" as "user",
          parts: cleanMsg,
        },
        {
          role: "model" as "model",
          parts: responseText,
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
    console.error("Error running GoogleAI Chat:", err);
    return `Error with GoogleAI API D: (${err})`;
  }
};
