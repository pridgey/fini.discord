import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { PersonalitiesRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("set-personality")
  .setDescription("Sets Fini to a created personality.")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the personality you want Fini to have.")
      .setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const personalityName =
    interaction.options.get("name")?.value?.toString() || "";

  if (!personalityName.length) {
    // Input invalid
    await interaction.reply({
      content: "A Bot needs a name.",
    });
    logCommand();
  } else {
    // Input is validated!
    try {
      // Get all the users personalities
      const allPersonalities = await pb
        .collection<PersonalitiesRecord>("personalities")
        .getFullList({
          filter: `user_id = "${interaction.user.id}"`,
        });

      // The found personality
      const foundPersonality = allPersonalities.find(
        (ap) => ap.personality_name === personalityName
      );

      if (
        allPersonalities.length > 0 &&
        (!!foundPersonality || personalityName === "Default")
      ) {
        // Set everything to inactive
        for (let i = 0; i < allPersonalities.length; i++) {
          await pb
            .collection("personalities")
            .update(allPersonalities[i].id || "", {
              ...allPersonalities[i],
              active: false,
            });
        }

        if (personalityName !== "Default") {
          // Found it, set it active
          await pb
            .collection<PersonalitiesRecord>("personalities")
            .update(foundPersonality?.id || "", {
              ...foundPersonality,
              active: true,
            });
        }

        await interaction.reply(
          `Active personality set to ${personalityName}.`
        );

        logCommand();
      } else {
        // Personality not found
        await interaction.reply(
          `Cannot find a personality with the name ${personalityName}.`
        );

        logCommand();
      }
    } catch (err) {
      const error: Error = err as Error;
      const errorMessage = `Error during /set-personality command: ${error.message}`;
      console.error(errorMessage);
      await interaction.reply({
        content: errorMessage,
      });
      logCommand();
    }
  }
};
