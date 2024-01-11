import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { LogHammerspaceItem } from "../utilities/logHammerspaceItem";
import { pb } from "../utilities/pocketbase";
import type { HammerspaceRecord } from "../types/PocketbaseTables";
import { logHammerspaceUsage } from "../utilities/hammerspace";

export const data = new SlashCommandBuilder()
  .setName("slap")
  .setDescription(
    "Feel a slight disdain for something or other? Why not have me slap it into orbit?"
  )
  .addStringOption((option) =>
    option
      .setName("target")
      .setDescription("what you are slapping")
      .setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  // Determine target from the args, or use the author if empty
  const slapTarget =
    interaction.options.get("target")?.value?.toString() ||
    interaction.user.username;

  // This the template for the slap
  let slapMessage = "**Fini slaps {0}{1} with {2}**";

  // Random change to slap the shit out of the target
  slapMessage = slapMessage.replace(
    "{0}",
    Math.random() > 0.15 ? "" : "the shit out of "
  );

  // Add the target of the slap
  slapMessage = slapMessage.replace("{1}", slapTarget.trim());

  try {
    // Grab the item from the hammerspace
    const randomItem = await pb
      .collection<HammerspaceRecord>("hammerspace")
      .getList(1, 1, {
        sort: "@random",
        filter: `type = "item"`,
      });

    // Add the item to the sentence
    slapMessage = slapMessage.replace("{2}", randomItem.items[0].item);

    // Update the HammerspaceItem stats
    await logHammerspaceUsage(randomItem.items[0]);

    await interaction.reply({
      content: slapMessage,
    });
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error during /slap command:", error);
  } finally {
    logCommand();
  }
};
