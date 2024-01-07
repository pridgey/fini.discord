// import { SlashCommandBuilder } from "@discordjs/builders";
// import { CommandInteraction } from "discord.js";
// import { db } from "../../utilities";
// import { HammerspaceItem } from "../../types";

// export const data = new SlashCommandBuilder()
//   .setName("blame")
//   .setDescription("Tell me more about this hammerspace item")
//   .addStringOption((input) =>
//     input
//       .setName("item")
//       .setDescription("The Hammerspace Item that I'll be looking up")
//       .setRequired(true)
//   );

// export const execute = async (interaction: CommandInteraction) => {
//   const hammerspaceItem = interaction.options.getString("item");

//   db()
//     .select<HammerspaceItem>(
//       "Hammerspace",
//       {
//         Field: "Item",
//         Value: hammerspaceItem || "",
//       },
//       interaction?.guildId || ""
//     )
//     .then((results) => {
//       if (results[0]) {
//         // We found it
//         const foundItem = results[0];
//         // Pull out the Date Created so we can look at it
//         const dateCreated = new Date(Number(foundItem.DateCreated));
//         // Form the info and return it
//         interaction.reply(
//           `Hammerspace entry _'${foundItem.Item}'_ was created by **${
//             foundItem.User
//           }** on **${dateCreated.toLocaleDateString()}** and has been used **${
//             foundItem.TimesUsed ?? 0
//           }** time${foundItem.TimesUsed === 1 ? "" : "s"}`
//         );
//       } else {
//         // Let them know we couldn't find anything
//         interaction.reply(
//           `I couldn't find anything matching _'${hammerspaceItem}'_`
//         );
//       }
//     })
//     .catch((err) => {
//       interaction.reply(`I fucked up: ${err} D=`);
//     });
// };
