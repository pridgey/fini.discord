import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("wizard")
  .setDescription("Testing")
  .addStringOption((option) =>
    option.setName("text").setDescription("Testing").setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  try {
    const { LlamaModel, LlamaContext, LlamaChatSession } = await import(
      "node-llama-cpp"
    );

    const prompt = interaction.options.get("text")?.value?.toString() || "";

    const model = new LlamaModel({
      modelPath:
        "/home/pridgey/Documents/Code/fini.discord/modules/wizardUncensored/combined_model.bin",
    });
    const context = new LlamaContext({ model });
    const session = new LlamaChatSession({ context });

    interaction.deferReply();

    const response = await session.prompt(prompt);

    interaction.editReply(response);
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /wizard command", { error });
  } finally {
    logCommand();
  }
};
