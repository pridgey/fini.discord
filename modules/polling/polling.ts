import { db } from "./../../utilities";
import { ReminderRecord, SettingsRecord } from "./../../types";
import { Client, TextChannel } from "discord.js";
import { run as runFeeds } from "./../../commands/feed.command";
import { chatWithUser } from "./../openai";
import { HEALTH_KEY } from "./../../commands/health.command";

export const runPollTasks = (cl: Client) => {
  checkReminders(cl);
  checkFeeds(cl);
  checkHealthPings(cl);
};

/* Polling Functions to run */

// Look for any reminders that were set by users
const checkReminders = (cl: Client) => {
  db()
    .select<ReminderRecord>("Reminder", "All")
    .then((reminders) => {
      const now = new Date().getTime();
      reminders
        .filter((r) => r.Time < now)
        .forEach((rem) => {
          // All reminders that need actioning
          cl.channels
            .fetch(rem.Channel)
            .then((channel) =>
              (channel as TextChannel).send(
                `<@${rem.User}>, here is your reminder to ${rem.Reminder}`
              )
            )
            .finally(() => {
              db().remove<ReminderRecord>("Reminder", {
                Field: "id",
                Value: rem?.id || 0,
              });
            });
        });
    });
};

// At the same time every day, generate RSS feeds
const checkFeeds = (cl: Client) => {
  const today = new Date();
  // Generate Feed at 10:00 am
  const hourToCheck = 10;
  const minuteToCheck = 0;

  // Run at the appropriate time
  if (
    today.getHours() === hourToCheck &&
    today.getMinutes() === minuteToCheck
  ) {
    runFeeds(undefined, cl);
  }
};

// Check for health reminders
const checkHealthPings = async (cl: Client) => {
  const today = new Date();

  // Check at these times
  const hourToCheck = [10, 13, 16, 20, 22];
  const minuteToCheck = 40;

  const currentHour = today.getHours();
  const currentMinute = today.getMinutes();

  if (currentMinute === minuteToCheck && hourToCheck.includes(currentHour)) {
    console.log("Running health poll");
    // Get the health message
    const healthMessage = await chatWithUser(
      "",
      "Please provide a quick healthy activity I can do in my office. Please keep the activity to about a minute in length. Please provide the activity in the form of a JSON object, with the keys being: 'activity_name', 'acitivity_description', 'acitivity_benefits'"
    );
    console.log({ healthMessage, JSONified: JSON.parse(healthMessage) });
    try {
      const activityJSON = JSON.parse(healthMessage);

      // We have our health message
      const channels = await db().select<SettingsRecord>("Settings", "All");
      const filteredChannels = channels.filter((c) => c.Key === HEALTH_KEY);

      filteredChannels.forEach(async (ch) => {
        console.log("Looping through channels", { filteredChannels, ch });
        const healthChannel = await cl.channels.fetch(ch?.Value);
        (healthChannel as TextChannel).send(
          `Friendly reminder to do something healthy!`
        );
        (healthChannel as TextChannel).send(
          `**${activityJSON.activity_name}**`
        );
        (healthChannel as TextChannel).send(activityJSON.activity_description);
      });
    } catch (err) {
      console.error("Error parsing openai response", {
        err,
        openaiResponse: healthMessage,
      });
    }
  }
};
