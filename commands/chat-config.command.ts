import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import {
  CHAT_MODELS,
  CHAT_MODEL_LABELS,
  DEFAULT_CHAT_MODEL,
  getUserChatModel,
  setUserChatModel,
} from "../modules/aiChat/chatModel";
import { ChatModel } from "../types/PocketbaseTables";

export const data = new SlashCommandBuilder()
  .setName("chat-config")
  .setDescription("Choose which AI model answers your 'hey fini' messages")
  .addStringOption((option) =>
    option
      .setName("model")
      .setDescription(
        `The model to chat with. (Default: ${DEFAULT_CHAT_MODEL})`,
      )
      .setRequired(false)
      .addChoices(
        ...CHAT_MODELS.map((model) => ({
          name: `${model} - ${CHAT_MODEL_LABELS[model]}`,
          value: model,
        })),
      ),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const selectedModel = interaction.options.get("model")?.value?.toString() as
    | ChatModel
    | undefined;

  const userID = interaction.user.id;
  const serverID = interaction.guildId ?? "unknown";

  try {
    await interaction.deferReply({ ephemeral: true });

    // No model given means the user is just asking what they're set to
    if (!selectedModel) {
      const currentModel = await getUserChatModel(userID, serverID);

      await interaction.editReply(
        `You're currently chatting with **${currentModel}** (${CHAT_MODEL_LABELS[currentModel]}).\nRun this command with the \`model\` option to change it.`,
      );

      logCommand();
      return;
    }

    await setUserChatModel(
      userID,
      serverID,
      selectedModel,
      `${interaction.user.username}-${interaction.guild?.name || "Unknown Server"}`,
    );

    await interaction.editReply(
      `Your chat model is now **${selectedModel}** (${CHAT_MODEL_LABELS[selectedModel]}).\nEach model keeps its own chat history, so this one may not remember what you told the other.`,
    );

    logCommand();
  } catch (err) {
    const error: Error = err as Error;
    const errorMessage = `Error during /chat-config command: ${error.message}`;
    console.error(errorMessage);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errorMessage);
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }

    logCommand();
  }
};
