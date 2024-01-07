// import { SlashCommandBuilder } from "@discordjs/builders";
// import { CommandInteraction, TextChannel } from "discord.js";
// import { SettingsRecord } from "types";
// import { db } from "../../utilities";

// export const HEALTH_KEY = "Health-Channel";

// export const data = new SlashCommandBuilder()
//   .setName("health")
//   .setDescription("Manage routine health notificatios to a particular channel")
//   .addSubcommand((sub) =>
//     sub
//       .setName("subscribe")
//       .setDescription("Subscribe this channel to routine health notifications")
//   )
//   .addSubcommand((sub) =>
//     sub
//       .setName("unsubscribe")
//       .setDescription("Remove this channel from routine health notifications")
//   );

// export const execute = async (interaction: CommandInteraction) => {
//   const subcommand = interaction.options.getSubcommand();

//   const subcommandDict = {
//     subscribe,
//     unsubscribe,
//   };

//   // Run the subcommand function
//   subcommandDict[subcommand](interaction);
// };

// // Adds the channel to the health reminders
// const subscribe = async (interaction: CommandInteraction) => {
//   // Check if this is a text channel
//   if (!interaction.channel?.isText()) {
//     // Not a text based channel, cannot continue
//     interaction.reply(
//       "This is not a text channel and I cannot send reminders to it."
//     );
//     return;
//   }

//   // Check if there is already a record for this
//   const selectRecords = await db().select<SettingsRecord>(
//     "Settings",
//     "All",
//     interaction.guildId || ""
//   );

//   const filteredRecords = selectRecords.filter(
//     (record) => record.Key === HEALTH_KEY
//   );

//   if (filteredRecords.length > 0) {
//     // Already there
//     interaction.reply(
//       "This channel has already been subscribed to Health Notifications."
//     );
//     return;
//   }

//   // We should be good from here
//   await db().insert<SettingsRecord>("Settings", {
//     Key: HEALTH_KEY,
//     Value: interaction.channelId,
//     Server: interaction.guildId || "",
//   });

//   interaction.reply(
//     `Added channel: **#${
//       (interaction.channel as TextChannel).name
//     }** to Health reminders!`
//   );
// };

// const unsubscribe = async (interaction: CommandInteraction) => {
//   // Check if this is a text channel
//   if (!interaction.channel?.isText()) {
//     interaction.reply("This is not a text channel and I cannot deal with that");
//     return;
//   }

//   // Grab channel record
//   const allRecords = await db().select<SettingsRecord>(
//     "Settings",
//     "All",
//     interaction.guildId || ""
//   );
//   const subscribedRecord = allRecords
//     .filter(
//       (record) =>
//         record.Key === HEALTH_KEY && record.Value === interaction.channelId
//     )
//     .at(0);

//   if (!subscribedRecord) {
//     interaction.reply(
//       `Cannot find a health subscription for channel: **#${
//         (interaction.channel as TextChannel).name
//       }**.`
//     );
//   }

//   // Remove it
//   await db().remove<SettingsRecord>("Settings", {
//     Field: "ID",
//     Value: subscribedRecord?.ID || 0,
//   });

//   interaction.reply(
//     `Removed channel: **#${
//       (interaction.channel as TextChannel).name
//     }** from Health reminders!`
//   );
// };
