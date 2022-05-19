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

  const response = await openai.createCompletion("text-davinci-002", {
    prompt: `Respond to this discord message: ${msg}`,
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

  if (choices.some((c) => c.finish_reason === "stop")) {
    // We have a stop
    const fullReplies = choices.filter((c) => c.finish_reason === "stop");
    // Randomly pick a reply
    return randomlyPickReply(fullReplies).text;
  } else {
    // No full stops
    return `${randomlyPickReply(choices).text}... I could go on and on lol`;
  }
};
