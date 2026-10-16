import { SlashCommandBuilder } from "@discordjs/builders";
import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { generateNpc } from "../modules/npc/generateNpc";

export const data = new SlashCommandBuilder()
  .setName("generate-npc")
  .setDescription("Creates the markdown for a new D&D npc")
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("information about the character that will be generated")
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option
      .setName("ephemeral")
      .setDescription("Sends the result to you ephemerally")
      .setRequired(false),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const knownInfo = interaction.options.get("prompt")?.value?.toString() || "";
  const isEphemeral = interaction.options.get("ephemeral")?.value === true;

  await interaction.deferReply(
    isEphemeral ? { flags: [MessageFlags.Ephemeral] } : undefined,
  );

  try {
    const markdown = await generateNpc(knownInfo);

    if (markdown.length > 0) {
      await interaction.editReply({
        files: [
          new AttachmentBuilder(Buffer.from(markdown, "utf-8"), {
            name: "character-markdown.txt",
          }),
        ],
      });
    } else {
      await interaction.editReply("Error during npc generation.");
    }
  } catch (err) {
    console.error("Error during /generate-npc", err);
    await interaction
      .editReply("Error during /generate-npc")
      .catch((replyErr) => console.error("Error reporting /generate-npc failure:", replyErr));
  } finally {
    logCommand();
  }
};
