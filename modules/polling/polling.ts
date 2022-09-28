import { db } from "./../../utilities";
import { ReminderRecord } from "./../../types";
import { Client, TextChannel } from "discord.js";

export const runPollTasks = (cl: Client) => {
  checkReminders(cl);
};

/* Polling Functions to run */

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
