import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, AttachmentBuilder } from "discord.js";
import OpenAI from "openai";
import type { OpenAIError } from "openai/error";
import { createLog } from "../modules/logger";

export const data = new SlashCommandBuilder()
  .setName("image")
  .setDescription("Create an image with Dall-E")
  .addStringOption((option) =>
    option.setName("prompt").setDescription("Waddya want?").setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const prompt = interaction.options.get("prompt")?.value?.toString() || "";

  if (!!prompt?.length) {
    // Instantiate openai
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "no_key_found",
    });

    await interaction.deferReply();

    try {
      const respond = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
      });
      const imageAttachment = new AttachmentBuilder(respond.data[0].url || "", {
        name: "image.jpg",
      });

      await interaction.editReply({
        content: `**Prompt:** ${prompt}`,
        files: [imageAttachment],
      });

      logCommand();
    } catch (err: unknown) {
      await interaction.editReply(
        `I couldn't do it.\nPrompt:${prompt}\nError: ${
          (err as OpenAIError).message
        }`
      );
      logCommand();
    }
  } else {
    await interaction.reply("You need to give me something to work with.");
    logCommand();
  }
};
