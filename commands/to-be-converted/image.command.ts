// import { SlashCommandBuilder } from "@discordjs/builders";
// import { CommandInteraction, MessageAttachment } from "discord.js";
// import OpenAI from "openai";
// import type { OpenAIError } from "openai/error";

// export const data = new SlashCommandBuilder()
//   .setName("image")
//   .setDescription("Create an image with Dall-E")
//   .addStringOption((option) =>
//     option.setName("prompt").setDescription("Waddya want?").setRequired(true)
//   );

// export const execute = async (interaction: CommandInteraction) => {
//   const prompt = interaction.options.getString("prompt");

//   if (!!prompt?.length) {
//     // Instantiate openai
//     const openai = new OpenAI({
//       apiKey: process.env.OPENAI_API_KEY || "no_key_found",
//     });

//     await interaction.deferReply();

//     try {
//       const respond = await openai.images.generate({
//         model: "dall-e-3",
//         prompt,
//         n: 1,
//         size: "1024x1024",
//       });

//       const imageAttachment = new MessageAttachment(
//         respond.data[0].url ?? "",
//         "image.png"
//       );

//       interaction.editReply({
//         content: `**Prompt:** ${prompt}`,
//         files: [imageAttachment],
//       });
//     } catch (err: unknown) {
//       interaction.editReply(
//         `I couldn't do it.\nPrompt:${prompt}\nError: ${
//           (err as OpenAIError).message
//         }`
//       );
//     }
//   } else {
//     await interaction.reply("You need to give me something to work with.");
//   }
// };
