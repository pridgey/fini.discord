import { Client, DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import { type ReminderRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";
import { syncAllSeasons } from "../finistocks/stockData";
import { checkMonitoredServices } from "./monitoring";
import { expireStaleV2Battles } from "../finicards/expireBattles";
import { expireSharedFiles } from "../fileShare";
import { runGeoDaily } from "../dailies/geo/daily";
import { runWeaveDaily } from "../dailies/weave/daily";

/**
 * Runs a poll task without letting it fail the poll. Every task is started
 * without being awaited, so a rejection nobody catches would end the process -
 * and with it Pocketbase and llama, which `bun start` stops alongside the bot.
 */
const runSafely = (name: string, task: () => Promise<unknown>): void => {
  task().catch((err) => console.error(`Poll task "${name}" failed:`, err));
};

export const runPollTasks = (cl: Client) => {
  runSafely("reminders", () => checkReminders(cl));
  runSafely("anime sync", syncAndUpdateAnimeRecords);
  runSafely("service monitoring", () => checkMonitoredServices(cl));
  runSafely("battle expiry", () => expireStaleV2Battles(cl));
  runSafely("share expiry", reapExpiredShares);
  runSafely("dailies", () => runGeoDaily(cl).then(() => runWeaveDaily(cl)));
};

/**
 * Delete share links whose time is up, and the files behind them.
 *
 * Expiry is enforced on read as well, so this is about reclaiming disk rather
 * than about access - a link is dead the moment it expires either way.
 */
const reapExpiredShares = async () => {
  const removed = await expireSharedFiles();
  if (removed) console.log(`Expired ${removed} shared file(s)`);
};

// #region Polling Jobs

// Ping the anime API to update stock data
const syncAndUpdateAnimeRecords = async () => {
  // Current time to check
  const now = new Date();
  // Check at midnight and noon every day
  if (
    (now.getHours() === 0 || now.getHours() === 12) &&
    now.getMinutes() === 0
  ) {
    await syncAllSeasons();
  }
};

/** Discord's answers meaning a reminder's channel can't be posted in again. */
const CHANNEL_GONE = new Set<number | string>([
  RESTJSONErrorCodes.UnknownChannel,
  RESTJSONErrorCodes.MissingAccess,
  RESTJSONErrorCodes.MissingPermissions,
]);

/**
 * Sends the reminders that are due, one at a time, deleting each once sent.
 *
 * One failing doesn't stop the rest. A reminder whose channel is gone, or that
 * Fini can no longer post in, is deleted too - it would only fail again every
 * minute. Any other failure leaves it for the next poll to try again.
 */
export const checkReminders = async (cl: Client) => {
  const due = await pb.collection<ReminderRecord>("reminder").getFullList({
    filter: "time < @now",
  });

  for (const reminder of due) {
    try {
      const channel = await cl.channels.fetch(reminder.channel_id);
      if (!channel?.isSendable()) {
        console.error(`Reminder ${reminder.id}'s channel can't be posted in; dropping it`);
        await pb.collection("reminder").delete(reminder.id!);
        continue;
      }
      await channel.send(
        `${reminder.original_message}\n<@${reminder.user_id}>, here is your reminder: ${reminder.reminder_text}`,
      );
      await pb.collection("reminder").delete(reminder.id!);
    } catch (err) {
      const gone = err instanceof DiscordAPIError && CHANNEL_GONE.has(err.code);
      console.error(`Couldn't send reminder ${reminder.id}${gone ? "; dropping it" : ""}:`, err);
      if (gone) await pb.collection("reminder").delete(reminder.id!).catch(() => undefined);
    }
  }
};

// #endregion
