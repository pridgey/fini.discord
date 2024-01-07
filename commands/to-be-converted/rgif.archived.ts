// import { SlashCommandBuilder } from "@discordjs/builders";
// import {
//   CommandInteraction,
//   MessageEmbed,
//   MessageActionRow,
//   MessageButton,
// } from "discord.js";
// import { grabGif } from "../../utilities";
// import { RawMessagePayloadData } from "discord.js/typings/rawDataTypes";

// export const data = new SlashCommandBuilder()
//   .setName("rgif")
//   .setDescription("React with a random gif, but R Rated")
//   .addStringOption((option) =>
//     option
//       .setName("query")
//       .setDescription("what gif should I look for?")
//       .setRequired(true)
//   );

// export const execute = async (interaction: CommandInteraction) => {
//   const query = interaction?.options?.getString("query")?.trim() || "";
//   grabGif(query, "giphy", "r").then((gifList) => {
//     if (gifList) {
//       const previousButton = new MessageButton()
//         .setLabel("Previous")
//         .setStyle("PRIMARY")
//         .setCustomId("previous");
//       const selectButton = new MessageButton()
//         .setLabel("This One")
//         .setStyle("SUCCESS")
//         .setCustomId("select");
//       const nextButton = new MessageButton()
//         .setLabel("Next")
//         .setStyle("PRIMARY")
//         .setCustomId("next");
//       const actionRow = new MessageActionRow().setComponents([
//         previousButton,
//         selectButton,
//         nextButton,
//       ]);

//       let gifIndex = 0;

//       const embed = new MessageEmbed()
//         .setImage(gifList[gifIndex] ?? "")
//         .setFooter({
//           text: query ?? "Random",
//         });

//       // Test
//       const collector = interaction?.channel?.createMessageComponentCollector();
//       collector?.on("collect", async (i) => {
//         if (i.customId === "next") {
//           if (gifIndex === gifList.length - 1) {
//             // We've reached the end
//             gifIndex = 0;
//           } else {
//             gifIndex++;
//           }
//           // Update embed to show the next gif
//           embed.setImage(gifList[gifIndex]);
//           await i.update({ embeds: [embed] });
//         }
//         if (i.customId === "previous") {
//           if (gifIndex === 0) {
//             gifIndex = gifList.length - 1;
//           } else {
//             gifIndex--;
//           }
//           // Update embed to show the next gif
//           embed.setImage(gifList[gifIndex]);
//           await i.update({ embeds: [embed] });
//         }
//         if (i.customId === "select") {
//           i.update({
//             embeds: [],
//             content: "You did it!",
//             components: [],
//           });
//           i?.channel?.send({
//             embeds: [embed],
//           });
//         }
//       });

//       // Send user ephermeral selector
//       interaction.reply({
//         ephemeral: true,
//         embeds: [embed],
//         components: [actionRow],
//         data: {
//           type: 1,
//           content: "test",
//         } as RawMessagePayloadData,
//       });
//     } else {
//       interaction.reply(`Couldn't find a gif for ${query}`);
//     }
//   });
// };
