import { Client, TextChannel } from "discord.js";
import { type ReminderRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

export const runPollTasks = (cl: Client) => {
  checkReminders(cl);
  //checkHealthPings(cl);
};

/* Polling Functions to run */

// Look for any reminders that were set by users
const checkReminders = async (cl: Client) => {
  // Current time to check
  const now = new Date().toISOString();

  // Pull out reminder records
  const reminderRecords = await pb
    .collection<ReminderRecord>("reminder")
    .getFullList({
      filter: `time < @now`,
    });

  reminderRecords.forEach(async (reminder) => {
    // Pull channel from client
    const channel: TextChannel = (await cl.channels.fetch(
      reminder.channel_id
    )) as TextChannel;

    // Send the reminder
    await channel.send(
      `<@${reminder.user_id}>, here is your reminder: ${reminder.reminder_text}`
    );

    // Delete the reminder
    await pb.collection<ReminderRecord>("reminder").delete(reminder.id!);
  });
};

// Check for health reminders
//const checkHealthPings = async (cl: Client) => {
// const today = new Date();
// // Check at these times
// const hourToCheck = [10, 13, 16, 20];
// const minuteToCheck = 15;
// const currentHour = today.getHours();
// const currentMinute = today.getMinutes();
// if (currentMinute === minuteToCheck && hourToCheck.includes(currentHour)) {
//   console.log("===== Generate Health Message =====");
//   // Different prompts to use to help diversify the workout
//   const workoutPrompts = [
//     "Please provide a quick healthy activity I can do in my office in about a minute.",
//     "Please provide a short activity to get the blood pumping.",
//     "Please provide a short workout I can do in a small office space.",
//     "Please provide a helpful quick activity to improve posture, promote relaxation, etc.",
//     "Please provide a unique minute workout that one could perform in an office-like environment.",
//     "Please provide a short breathing exercise to help refresh me.",
//     "Please suggest a quick and easy stretch that can be done at my desk to relieve tension.",
//     "Please recommend a brief mental exercise to help reset and refocus during a busy day.",
//     "Please provide a simple office-friendly movement to engage core muscles and improve balance.",
//     "Please suggest a quick and calming technique for reducing stress in a busy work environment.",
//     "Please provide a short, creative exercise to boost energy and productivity in a limited space.",
//     "Please recommend a brief, office-friendly yoga pose to help improve flexibility and focus.",
//     "Please provide a quick self-massage technique to alleviate neck or shoulder tension.",
//     "Please suggest a short, dynamic exercise that can be done in a seated position to re-energize.",
//     "Please recommend a simple mindfulness activity to help regain clarity and calm during a hectic day.",
//     "Please provide a quick desk exercise to strengthen and tone lower body muscles in a limited space.",
//   ];
//   // get a random option
//   const rand = Math.round(Math.random() * (workoutPrompts.length - 1));
//   // combine to form final prompt
//   const prompt =
//     workoutPrompts[rand] +
//     " Please provide the activity in the form of a JSON object, with the keys being: 'activity_name', 'acitivity_description', 'acitivity_benefits'";
//   // Get the health message
//   const healthMessage = await chatWithUser("", prompt);
//   console.log({ healthMessage, JSONified: JSON.parse(healthMessage) });
//   try {
//     const activityJSON = JSON.parse(healthMessage);
//     // We have our health message
//     const channels = await db().select<SettingsRecord>("Settings", "All");
//     const filteredChannels = channels.filter((c) => c.Key === HEALTH_KEY);
//     filteredChannels.forEach(async (ch) => {
//       console.log("Looping through channels", { filteredChannels, ch });
//       const healthChannel = await cl.channels.fetch(ch?.Value);
//       (healthChannel as TextChannel).send(
//         `Friendly reminder to do something healthy!`
//       );
//       (healthChannel as TextChannel).send(
//         `**${activityJSON.activity_name}**`
//       );
//       (healthChannel as TextChannel).send(activityJSON.activity_description);
//     });
//   } catch (err) {
//     console.error("Error parsing openai response", {
//       err,
//       openaiResponse: healthMessage,
//     });
//   }
// }
//};
