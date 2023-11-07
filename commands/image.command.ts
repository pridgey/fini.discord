import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, MessageAttachment } from "discord.js";
import OpenAI from "openai";

export const data = new SlashCommandBuilder()
  .setName("image")
  .setDescription("Create an image with Dall-E")
  .addStringOption((option) =>
    option.setName("prompt").setDescription("Waddya want?").setRequired(true)
  );

export const execute = async (interaction: CommandInteraction) => {
  const prompt = interaction.options.getString("prompt");

  if (!!prompt?.length) {
    // Instantiate openai
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "no_key_found",
    });

    await interaction.deferReply();

    const respond = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
    });

    interaction.editReply(
      `Promot: ${prompt}\n${respond.data[0].url ?? "I couldn't do it"}`
    );
  }
};
