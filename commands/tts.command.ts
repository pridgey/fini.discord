import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, MessageAttachment } from "discord.js";
import OpenAI from "openai";

export const data = new SlashCommandBuilder()
  .setName("tts")
  .setDescription("Text to speech")
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("The text you want me to speech")
      .setRequired(true)
  );

export const execute = async (interaction: CommandInteraction) => {
  const message = interaction.options.getString("message");

  if (!!message?.length) {
    // Instantiate openai
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "no_key_found",
    });

    const speech = await openai.audio.speech.create({
      model: "tts-1",
      voice: "fable",
      input: message || "I did not receive anything!",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    const attachment = new MessageAttachment(buffer, "fini.mp3");

    interaction.reply({
      files: [attachment],
    });
  }
};
