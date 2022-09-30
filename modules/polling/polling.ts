import { db } from "./../../utilities";
import { ReminderRecord } from "./../../types";
import { Client, TextChannel } from "discord.js";
import { run } from "./../../commands/feed.command";

export const runPollTasks = (cl: Client) => {
  checkReminders(cl);
  checkFeeds(cl);
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
    run(undefined, cl);
  }
};
