import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import type { ReminderRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { add } from "date-fns";
import {
  tryParseDate,
  isDateValid,
} from "../utilities/tryParseDate/tryParseDate";

export const data = new SlashCommandBuilder()
  .setName("remind")
  .setDescription("Reminds you of something")
  .addStringOption((option) =>
    option
      .setName("time")
      .setDescription("when to remind ('Aug 31 2000', or '5d')")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("reminder")
      .setDescription("what to be reminded of")
      .setRequired(true)
  );

// Time duration dictionary
const timeDictionary = {
  years: ["y", "year", "years", "yr"],
  months: ["month", "months", "monthes", "mon", "mth", "mths"],
  weeks: ["w", "weeks", "week", "wk", "wek", "wks"],
  days: ["d", "day", "days", "dy"],
  hours: ["h", "hour", "hours", "hr", "hrs"],
  minutes: ["m", "min", "minutes", "minute", "mnt"],
  seconds: ["s", "sec", "secs", "seconds", "second", "scnd"],
};

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const amountOfTime = interaction.options.get("time")?.value?.toString() || "";
  const reminderText =
    interaction.options.get("reminder")?.value?.toString() || "";

  if (amountOfTime && reminderText) {
    // Defer reply
    await interaction.deferReply();

    // Resulting date object
    let timeToRemind: Date;

    console.log("Test:", {
      tryPase: tryParseDate(amountOfTime),
    });

    // Try to parse date
    const parsedDate = new Date(amountOfTime);
    const isValidDate = !isNaN(parsedDate.getTime());

    if (isValidDate) {
      // They entered an actual date, go ahead and use it
      timeToRemind = parsedDate;
    } else {
      // The current time to add to
      const now = new Date();

      const timeObject = {
        years: 0,
        months: 0,
        weeks: 0,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      };

      // For each top-level duration look for the potential time pattern
      Object.keys(timeDictionary).forEach((unit) => {
        const patterns = timeDictionary[unit].join("|");
        const regex = new RegExp(`(\\d+)\\s*(${patterns})(?:\\b|\\s)`, "gi");
        let match;

        while ((match = regex.exec(amountOfTime))) {
          timeObject[unit] += parseInt(match[1], 10);
        }
      });

      // Add time to get reminder timestamp
      timeToRemind = add(now, timeObject);
    }

    // Add reminder to database
    await pb.collection<ReminderRecord>("reminder").create({
      channel_id: interaction.channelId,
      reminder_text: reminderText,
      server_id: interaction.guildId || "",
      time: timeToRemind.toISOString(),
      user_id: interaction.user.id,
    } as ReminderRecord);

    // Reply to user
    interaction.editReply(
      `OK ${
        interaction.user.username
      }, I will remind you: ${reminderText}, on ${timeToRemind.toLocaleString()}${
        isValidDate ? "" : ` (Today +${amountOfTime})`
      }`
    );

    logCommand();
  } else {
    interaction.reply(`I can't seem to parse your input. Please try again.`);
  }
};
