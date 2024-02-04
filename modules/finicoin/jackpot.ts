import type { Message, PartialMessage } from "discord.js";
import { addCoin, removeCoin, getUserBalance } from "./finicoin";
import { randomNumber } from "../../utilities/randomNumber";
import { createLog } from "../logger";

export const rollJackpot = async (
  message: Message | PartialMessage,
  fromReaction: boolean = false
) => {
  // Emoji to react for jackpot (currently pika thumbs up)
  const JACKPOT_EMOJI = "1088849190861410314";
  // The value to be under to win the jackpot (out of 100)
  const JACKPOT_CEILING = fromReaction ? 0.02 : 0.05;

  // Message data
  const authorId = message.author?.id || "";
  const guildId = message.guildId || "";

  // Roll the dice
  const jackPotRandom = randomNumber(
    Date.now() * message.createdTimestamp,
    0,
    100
  );

  // Check if user has won
  if (jackPotRandom < JACKPOT_CEILING) {
    // Get fini's balance (aka the jackpot)
    const finiBalance =
      (await getUserBalance("Fini", message.guildId || "")) ?? 0;

    // react the message as an indicator
    await message.react(JACKPOT_EMOJI);

    // reset fini balance
    await removeCoin("Fini", message.guildId || "", finiBalance);

    // reward jackpot to user
    await addCoin(authorId, guildId, finiBalance);

    // Log the jackpot win
    createLog({
      command: "jackpot",
      input: message.content || "Content not found",
      output: `Jackpot award: ${finiBalance} finicoin`,
      server_id: guildId,
      user_id: authorId,
    });
  }
};
