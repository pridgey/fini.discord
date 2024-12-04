import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { WeatherRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("weather")
  .setDescription(
    "Pings you in the mornings with a weather report. (Running command again removes weather ping)"
  )
  .addStringOption((option) =>
    option
      .setName("city")
      .setDescription("Your city for weather reports")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("any additional prompt for the AI")
      .setRequired(false)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const city =
    interaction.options.get("city")?.value?.toString().replaceAll(",", "") ||
    "";
  const additionalPrompt =
    interaction.options.get("prompt")?.value?.toString() || "";

  if (city) {
    // Defer reply
    await interaction.deferReply();

    // Get any existing weather records
    const weatherRecord = await pb
      .collection<WeatherRecord>("weather")
      .getFullList({
        filter: `user_id = '${interaction.user.id}'`,
      });

    if (!!weatherRecord.length) {
      // Weather record exists, remove it
      await pb
        .collection<WeatherRecord>("weather")
        .delete(weatherRecord[0].id ?? "-1");

      await interaction.editReply(
        "Your daily weather report has been removed. You will no longer be pinged."
      );
    } else {
      // Weather record doesn't exist, add it
      await pb.collection<WeatherRecord>("weather").create({
        server_id: interaction.guildId,
        user_id: interaction.user.id,
        city,
        additionalPrompt: additionalPrompt || "",
      });

      await interaction.editReply(
        "Your daily weather report has been created. You will be pinged each morning."
      );
    }

    logCommand();
  } else {
    await interaction.reply(
      `City is required for a weather update ya big dummy.`
    );
  }
};
