import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, AttachmentBuilder } from "discord.js";
import { addCoin, getUserBalance } from "../modules/finicoin";
import Replicate from "replicate";

// nano-banana is $0.039 / image
const COMMAND_COST = 100;

export const data = new SlashCommandBuilder()
  .setName("nano-banana")
  .setDescription(
    `Create an image with google's nano-banana. (${COMMAND_COST} fini coin per image)`,
  )
  .addStringOption((option) =>
    option.setName("prompt").setDescription("Waddya want?").setRequired(true),
  )
  .addAttachmentOption((option) =>
    option
      .setName("image")
      .setDescription("Attach an image to use as a reference.")
      .setRequired(false),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const currentUserBalance =
    (await getUserBalance(interaction.user.id, interaction.guildId || "")) || 0;

  if (currentUserBalance >= COMMAND_COST) {
    const prompt = interaction.options.get("prompt")?.value?.toString() || "";
    const imageInput = interaction.options.get("image")?.attachment;

    if (!!prompt?.length) {
      // Ensure prompt is a reasonable length
      if (prompt.length > 1000) {
        await interaction.reply(
          "If you're Graham, stop it. If you're not Graham, I bet he put you up to it. I need a shorter prompt please.",
        );
        logCommand();
        return;
      }

      await interaction.deferReply();

      try {
        const replicate = new Replicate();

        // Get any image attachments to send to the model
        let imagePrompt = "";

        if (imageInput && imageInput.contentType?.includes("image")) {
          imagePrompt = imageInput.url;
        }

        const respond: any = await replicate.run("google/nano-banana", {
          input: {
            prompt,
            image_input: imagePrompt ? [imagePrompt] : [],
          },
        });

        const imageAttachment = new AttachmentBuilder(respond || "", {
          name: "image.jpg",
        });

        await interaction.editReply({
          content: `**Prompt:** ${prompt}`,
          files: (imagePrompt
            ? [new AttachmentBuilder(imagePrompt)]
            : []
          ).concat([imageAttachment]),
        });

        await addCoin(
          "Reserve",
          interaction.guildId ?? "unknown guild id",
          COMMAND_COST,
          "Reserve",
          interaction.guild?.name ?? "unknown guild name",
          interaction.user.id,
        );

        logCommand();
      } catch (err: unknown) {
        await interaction.editReply(
          `I couldn't do it.\nPrompt:${prompt}\nError: ${
            (err as Error).message
          }`,
        );
        logCommand();
      }
    } else {
      await interaction.reply("You need to give me something to work with.");
      logCommand();
    }
  } else {
    await interaction.reply(
      "You don't have enough fini coin to run this command.",
    );
    logCommand();
  }
};
