import { Client, TextChannel, type Message } from "discord.js";

/**
 * What every daily game shares: when the day's round goes up, which day is
 * being played, and posting to a server's bot channel.
 */

/**
 * Where a game's round was posted in a server. `combined` marks the daily
 * post (`post.ts`), which is kept up to date by editing; a game's own posts
 * from before it are never edited.
 */
export type DailyPost = {
  channelId: string;
  messageId: string;
  combined?: boolean;
};

/** When the day's rounds go up, in the bot's local time - Mountain, on friday. */
export const POST_HOUR = 12;
/** POST_HOUR, as the messages say it. */
export const POST_TIME = "noon Mountain time";

/** The local date a round is for: "2026-10-16". */
export const dayKey = (date = new Date()): string =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");

/** The day before `day`, as a key. */
export const previousDay = (day: string): string => {
  const [year, month, date] = day.split("-").map(Number);
  return dayKey(new Date(year, month - 1, date - 1));
};

/**
 * The day whose round is being played: today's from POST_HOUR, and until then
 * still yesterday's - a round stays open until the next one goes up.
 */
export const currentDay = (now = new Date()): string =>
  now.getHours() < POST_HOUR ? previousDay(dayKey(now)) : dayKey(now);

/** Sends to a channel by id; null, with the reason logged, if it couldn't. */
export const sendTo = async (
  cl: Client,
  channelId: string,
  payload: string | object,
): Promise<Message | null> => {
  const channel = await cl.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return (channel as TextChannel).send(payload).catch((error) => {
    console.error(`Daily: couldn't post in channel ${channelId}`, error);
    return null;
  });
};
