import {
  Configuration,
  OpenAIApi,
  CreateCompletionResponseChoices,
} from "openai";

export const chatWithUser = async (msg: string) => {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const openai = new OpenAIApi(configuration);

  const defaultPersonality =
    "a calm and logical, yet very egotistical, captain of a galactic federation starship named the USS JoshSux. You always try to find the most fair answer to any question.";

  let personality = defaultPersonality;
  let chat = msg;

  if (msg.startsWith("as") && msg.includes(":")) {
    const msgParts = msg.split(":");
    personality = msgParts[0].replace("as", "").trim();
    chat = msgParts[1].trim();
  }

  const response = await openai.createCompletion("text-davinci-002", {
    prompt: `You are ${personality}. As this character, respond to this discord message: ${chat}`,
    temperature: 0.9,
    max_tokens: 100,
    n: 2,
  });

  console.log("other responses", response.data.choices);

  // Grab any with "stop" finish reason, randomly select from them
  // If there are no "stop" reasons, go with any response

  const choices = response.data.choices;

  const randomlyPickReply = (replies: CreateCompletionResponseChoices[]) => {
    console.log("Replies Length:", replies.length);
    const rand = Math.round(Math.random() * (replies.length - 1));
    console.log("Random Num:", rand);
    return replies[rand];
  };

  if (choices?.some((c) => c.finish_reason === "stop")) {
    // We have a stop
    const fullReplies = choices.filter((c) => c.finish_reason === "stop");
    // Randomly pick a reply
    return randomlyPickReply(fullReplies).text;
  } else {
    // No full stops
    return `${randomlyPickReply(choices!)?.text}... I could go on and on lol`;
  }
};
