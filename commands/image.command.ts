import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, AttachmentBuilder } from "discord.js";
import { addCoin, getUserBalance } from "../modules/finicoin";
import { validatePrompt } from "../modules/image/validatePrompt";
import {
  DALLE_COST,
  generateDalleImage,
} from "../modules/image/generateDalleImage";
import {
  generateFluxImage,
  FLUX_COST,
} from "../modules/image/generateFluxImage";
import {
  generateRefactorImage,
  REFACTOR_COST,
} from "../modules/image/generateRefactorImage";
import {
  generateNanoBananaImage,
  NANO_BANANA_COST,
} from "../modules/image/generateNanoBananaImage";

export const data = new SlashCommandBuilder()
  .setName("image")
  .setDescription("Create an image with various AI models")
  .addStringOption((option) =>
    option
      .setName("model")
      .setDescription("Which image generation model to use")
      .setRequired(true)
      .addChoices(
        { name: `Flux-Schnell (${FLUX_COST} fini coin)`, value: "flux" },
        { name: `DALL-E 3 (${DALLE_COST} fini coin)`, value: "dalle" },
        {
          name: `Recraft V3 (${REFACTOR_COST} fini coin)`,
          value: "refactor",
        },
        {
          name: `Nano-Banana (${NANO_BANANA_COST} fini coin)`,
          value: "nano-banana",
        },
      ),
  )
  .addStringOption((option) =>
    option.setName("prompt").setDescription("Waddya want?").setRequired(true),
  )
  .addAttachmentOption((option) =>
    option
      .setName("image")
      .setDescription("Attach an image (only for Nano-Banana)")
      .setRequired(false),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const model = interaction.options.get("model")?.value?.toString() || "";
  const prompt = interaction.options.get("prompt")?.value?.toString() || "";
  const imageInput = interaction.options.get("image")?.attachment;

  // Validate prompt
  const validationError = validatePrompt(prompt);
  if (validationError) {
    await interaction.reply(validationError);
    logCommand();
    return;
  }

  // Get cost based on model
  let cost = 0;
  switch (model) {
    case "dalle":
      cost = DALLE_COST;
      break;
    case "flux":
      cost = FLUX_COST;
      break;
    case "refactor":
      cost = REFACTOR_COST;
      break;
    case "nano-banana":
      cost = NANO_BANANA_COST;
      break;
  }

  // Check balance if cost > 0
  if (cost > 0) {
    const currentUserBalance =
      (await getUserBalance(interaction.user.id, interaction.guildId || "")) ||
      0;

    if (currentUserBalance < cost) {
      await interaction.reply(
        "You don't have enough fini coin to run this command.",
      );
      logCommand();
      return;
    }
  }

  await interaction.deferReply();

  try {
    // Get image input URL if provided (only for nano-banana)
    let imageInputUrl = "";
    if (
      model === "nano-banana" &&
      imageInput &&
      imageInput.contentType?.includes("image")
    ) {
      imageInputUrl = imageInput.url;
    }

    // Generate image based on model
    let result;
    switch (model) {
      case "dalle":
        result = await generateDalleImage({ prompt });
        break;
      case "flux":
        result = await generateFluxImage({ prompt });
        break;
      case "refactor":
        result = await generateRefactorImage({ prompt });
        break;
      case "nano-banana":
        result = await generateNanoBananaImage({
          prompt,
          imageInput: imageInputUrl,
        });
        break;
      default:
        await interaction.editReply("Invalid model selected.");
        logCommand();
        return;
    }

    if (!result.success) {
      await interaction.editReply(
        `I couldn't do it.\nPrompt: ${prompt}\nError: ${result.error}`,
      );
      logCommand();
      return;
    }

    // Create attachment
    const imageAttachment = new AttachmentBuilder(result.imageUrl, {
      name: "image.jpg",
    });

    // Build files array (include input image if nano-banana)
    const files: AttachmentBuilder[] = [];
    if (imageInputUrl) {
      files.push(new AttachmentBuilder(imageInputUrl));
    }
    files.push(imageAttachment);

    await interaction.editReply({
      content: `**Prompt (${model}):** ${prompt}`,
      files,
    });

    // Deduct coins if needed
    if (cost > 0) {
      await addCoin(
        "Reserve",
        interaction.guildId ?? "unknown guild id",
        cost,
        "Reserve",
        interaction.guild?.name ?? "unknown guild name",
        interaction.user.id,
      );
    }

    logCommand();
  } catch (err: unknown) {
    await interaction.editReply(
      `I couldn't do it.\nPrompt: ${prompt}\nError: ${(err as Error).message}`,
    );
    logCommand();
  }
};
