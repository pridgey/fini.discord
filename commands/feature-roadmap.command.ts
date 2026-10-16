import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("feature-roadmap")
  .setDescription("The current feature roadmap for Fini.");

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    const features = [
      "~~Finicards v2: battles, dungeons, Legendaries and Secret Arts~~",
      "~~Finicard trading~~",
      "~~Where in the World: a daily location game~~",
      "~~Weave: a daily word puzzle~~",
      "One daily post for every daily game",
      "Item cards that unlock Exodia, Shenron and Super Sonic",
      "Sorting and filtering in /finicard collection",
      "More of Fini's AI running on local models",
    ];

    await interaction.reply(
      `# Current Feature Roadmap${features.map((f) => `\n- ${f}`).join("")}`,
    );
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /feature-roadmap command", { error });
  } finally {
    logCommand();
  }
};
