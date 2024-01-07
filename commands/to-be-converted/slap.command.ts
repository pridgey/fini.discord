// import { SlashCommandBuilder } from "@discordjs/builders";
// import { CommandInteraction } from "discord.js";
// import { LogHammerspaceItem } from "../../utilities/logHammerspaceItem";
// import { db } from "../../utilities/db";
// import { HammerspaceItem } from "../../types";

// export const data = new SlashCommandBuilder()
//   .setName("slap")
//   .setDescription(
//     "Feel a slight disdain for something or other? Why not have me slap it into orbit?"
//   )
//   .addStringOption((option) =>
//     option
//       .setName("target")
//       .setDescription("what you are slapping")
//       .setRequired(true)
//   );

// export const execute = async (interaction: CommandInteraction) => {
//   // Determine target from the args, or use the author if empty
//   const slapTarget =
//     interaction.options.getString("target") || interaction.user.username;

//   // This the template for the slap
//   let slapMessage = "**Fini slaps {0}{1} with {2}**";

//   // Random change to slap the shit out of the target
//   slapMessage = slapMessage.replace(
//     "{0}",
//     Math.random() > 0.15 ? "" : "the shit out of "
//   );

//   // Add the target of the slap
//   slapMessage = slapMessage.replace("{1}", slapTarget.trim());

//   // Grab the item from the hammerspace
//   return db()
//     .select<HammerspaceItem>(
//       "Hammerspace",
//       "Random",
//       interaction?.guildId || ""
//     )
//     .then((results) => {
//       // Add the item to the sentence
//       slapMessage = slapMessage.replace("{2}", results[0].Item);
//       // Update the database with this hammerspace usage
//       LogHammerspaceItem(
//         results[0]?.ID || 0,
//         results[0].TimesUsed + 1,
//         interaction?.guildId || ""
//       );

//       return interaction.reply({
//         content: slapMessage,
//       });
//     })
//     .catch((err) => {
//       return `I fucked up... ${err}`;
//     });
// };
