import type { Message } from "discord.js";
import { createLog } from "../logger/logger";
import { splitBigString } from "../../utilities/splitBigString";
import { converseWithAI } from "./aiChat";
import type { ReplyContext } from "./formatReplyContext";

/** What starts a chat with Fini, matched without regard to case. */
export const HEY_FINI = "hey fini";

/** Discord's typing indicator lasts about 10 seconds, so it's renewed just after. */
const TYPING_RENEW_MS = 11_000;

/** Whether a message is talking to Fini. */
export const isHeyFini = (text: string) => text.toLowerCase().startsWith(HEY_FINI);

/**
 * Answers a "hey fini" message: shows Fini typing, asks the model the user
 * picked with /chat-config, and replies in as many messages as it takes.
 */
export const answerHeyFini = async (message: Message): Promise<void> => {
  const channel = message.channel;
  if (!channel.isSendable()) return;

  const typingLoop = setInterval(() => {
    channel.sendTyping().catch(() => undefined);
  }, TYPING_RENEW_MS);

  try {
    await channel.sendTyping();

    let messageReply;
    if (message.reference?.messageId) {
      try {
        messageReply = await message.fetchReference();
      } catch (err) {
        console.error("Error fetching message reference:", err);
      }
    }
    const replyText = messageReply?.content?.replaceAll(HEY_FINI, "").trim();

    // Who wrote the quoted message changes what the user is asking for, so
    // pass the attribution along rather than just the text. Prefer the server
    // nickname - that's the name the rest of the channel is using for them.
    const reply: ReplyContext | undefined =
      messageReply && replyText?.length
        ? {
            text: replyText,
            authorName:
              messageReply.member?.displayName ||
              messageReply.author.displayName ||
              messageReply.author.username,
            authorIsUser: messageReply.author.id === message.author.id,
            authorIsSelf: messageReply.author.id === message.client.user.id,
            authorIsBot: messageReply.author.bot,
          }
        : undefined;

    // converseWithAI reads the user's /chat-config preference and routes to
    // local llama.cpp (default) or Claude.
    const response = await converseWithAI({
      userID: message.author.id,
      message: message.content.slice(HEY_FINI.length),
      reply,
      server: message.guildId ?? "unknown",
      attachment: message.attachments.at(0),
    });

    await createLog({
      user_id: message.author.id,
      server_id: message.guild?.id || "unknown",
      command: HEY_FINI,
      input: message.content,
      output: response,
    });

    clearInterval(typingLoop);

    // One at a time, so a long answer arrives in order.
    for (const part of splitBigString(response)) {
      await message.reply(part);
    }
  } finally {
    clearInterval(typingLoop);
  }
};
