// import { SlashCommandBuilder } from "@discordjs/builders";
// import { CommandInteraction } from "discord.js";
// import { db } from "../../utilities";
// import { ReminderRecord } from "../../types";
// import { RelativeTimeFormatUnit } from "intl";

// export const data = new SlashCommandBuilder()
//   .setName("remind")
//   .setDescription("Reminds you of something")
//   .addNumberOption((option) =>
//     option
//       .setName("time")
//       .setDescription("reminder length")
//       .setRequired(true)
//       .setMinValue(1)
//   )
//   .addStringOption((option) =>
//     option
//       .setName("unit")
//       .setDescription("unit of time")
//       .setRequired(true)
//       .setChoices([
//         ["minute", "minute"],
//         ["hour", "hour"],
//         ["day", "day"],
//       ])
//   )
//   .addStringOption((option) =>
//     option
//       .setName("reminder")
//       .setDescription("what to be reminded of")
//       .setRequired(true)
//   );

// export const execute = async (interaction: CommandInteraction) => {
//   const amountOfTime = interaction.options.getNumber("time");
//   const unitOfTime = interaction.options.getString("unit");
//   const reminderText = interaction.options.getString("reminder");

//   if (amountOfTime && unitOfTime && reminderText) {
//     // various periods of time in milliseconds
//     const timeConversions = {
//       day: 86_400_000,
//       hour: 3_600_000,
//       minute: 60_000,
//       second: 1_000,
//     };

//     const now = new Date().getTime();

//     const reminderDate = new Date(
//       now + amountOfTime * timeConversions[unitOfTime]
//     );

//     const relativeDate = new Intl.RelativeTimeFormat("en");
//     const relativeString = relativeDate.format(
//       amountOfTime,
//       unitOfTime as RelativeTimeFormatUnit
//     );

//     return db()
//       .insert<ReminderRecord>("Reminder", {
//         Time: reminderDate.getTime(),
//         Reminder: reminderText,
//         Server: interaction.guildId || "",
//         User: interaction.user.id,
//         Channel: interaction.channelId,
//       })
//       .then(() => {
//         interaction.reply({
//           content: `OK ${
//             interaction.user.username
//           }, you will be reminded to "_${reminderText}_" ${relativeString} (${reminderDate.toLocaleString()})`,
//         });
//       })
//       .catch((err) => `I fucked up: ${err}`);
//   } else {
//     interaction.reply({
//       content: "Something about this seems really wrong...",
//     });
//   }
// };
