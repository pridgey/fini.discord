import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, AttachmentBuilder } from "discord.js";
import { getUserBalance, removeCoin } from "../modules/finicoin";
import Replicate from "replicate";

// refactor is $0.04 / image
const COMMAND_COST = 2000;

export const data = new SlashCommandBuilder()
  .setName("refactor")
  .setDescription(
    `Create an image with refactor-v3 (${COMMAND_COST} fini coin per image)`
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
      // Ensure prompt is a reasonable length
      if (prompt.length > 1000) {
        await interaction.reply(
          "If you're Graham, stop it. If you're not Graham, I bet he put you up to it. I need a shorter prompt please."
        );
        logCommand();
        return;
      }

      await interaction.deferReply();

      try {
        const replicate = new Replicate();

        const respond: any = await replicate.run("recraft-ai/recraft-v3", {
          input: {
            size: "1365x1024",
            prompt,
            disable_safety_checker: true,
            safety_tolerance: 5,
          },
        });

        const imageAttachment = new AttachmentBuilder(respond || "", {
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
