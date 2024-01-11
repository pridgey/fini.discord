import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { pb } from "../utilities/pocketbase";
import type { HammerspaceRecord } from "../types/PocketbaseTables";

export const data = new SlashCommandBuilder()
  .setName("blame")
  .setDescription("Tell me more about this hammerspace item")
  .addStringOption((input) =>
    input
      .setName("item")
      .setDescription("The Hammerspace Item that I'll be looking up")
      .setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const hammerspaceItem = interaction.options.get("item")?.value?.toString();

  try {
    const response = await pb
      .collection<HammerspaceRecord>("hammerspace")
      .getFirstListItem(
        `item = "${hammerspaceItem}" && (server_id = "All" || server_id = "${interaction.guildId}")`
      );

    if (response) {
      // Found it!
      const dateCreated = new Date(response.created || "");

      await interaction.reply(
        `Hammerspace entry _'${response.item}'_ was created by **${
          response.created_by_user_id
        }** on **${dateCreated.toLocaleDateString()}** and has been used **${
          response.times_used ?? 0
        }** time${response.times_used === 1 ? "" : "s"}.`
      );
    } else {
      // Couldn't find anything, so let them know
      await interaction.reply(
        `I couldn't find anything matching: _'${hammerspaceItem}'_`
      );
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /blame command:", { error });
  } finally {
    logCommand();
  }
};
