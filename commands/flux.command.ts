import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, AttachmentBuilder } from "discord.js";
import { getUserBalance, removeCoin } from "../modules/finicoin";
import Replicate from "replicate";

const COMMAND_COST = 500;

export const data = new SlashCommandBuilder()
  .setName("flux")
  .setDescription(
    `Create an image with flux-schnell (${COMMAND_COST} fini coin per image)`
  )
  .addStringOption((option) =>
    option.setName("prompt").setDescription("Waddya want?").setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const currentUserBalance =
    (await getUserBalance(interaction.user.id, interaction.guildId || "")) || 0;

  if (currentUserBalance >= COMMAND_COST) {
    const prompt = interaction.options.get("prompt")?.value?.toString() || "";

    if (!!prompt?.length) {
      await interaction.deferReply();

      try {
        const replicate = new Replicate();

        const respond = await replicate.run("black-forest-labs/flux-schnell", {
          input: {
            prompt,
            disable_safety_checker: true,
          },
        });

        const imageAttachment = new AttachmentBuilder(respond[0] || "", {
          name: "image.jpg",
        });

        await interaction.editReply({
          content: `**Prompt:** ${prompt}`,
          files: [imageAttachment],
        });

        await removeCoin(
          interaction.user.id,
          interaction.guildId || "",
          COMMAND_COST
        );

        logCommand();
      } catch (err: unknown) {
        await interaction.editReply(
          `I couldn't do it.\nPrompt:${prompt}\nError: ${
            (err as Error).message
          }`
        );
        logCommand();
      }
    } else {
      await interaction.reply("You need to give me something to work with.");
      logCommand();
    }
  } else {
    await interaction.reply(
      "You don't have enough fini coin to run this command."
    );
    logCommand();
  }
};
