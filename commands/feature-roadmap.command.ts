import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("feature-roadmap")
  .setDescription("The current feature roadmap for Fini.");

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  try {
    const features = [
      "~~See other users card collection with the /card-collection command~~",
      "Legendary Cards (maybe part of set 2?)",
      "De-dupe /card-collection listings",
      "Add card fusion to Finicards",
      "Add game mechanic to Finicards",
      "Finicard trading",
      "Finicards Set 2",
      "Geoguessr style game to earn Finicoin",
      "Brainstorm other daily challenges",
      "Fix or remove the /weather command",
    ];

    await interaction.reply(
      `# Current Feature Roadmap.${features.map((f) => `\n- ${f}`)}`
    );
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /feature-roadmap command", { error });
  } finally {
    logCommand();
  }
};
