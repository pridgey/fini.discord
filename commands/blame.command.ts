import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { pb } from "../utilities/pocketbase";
import type { HammerspaceRecord } from "../types/PocketbaseTables";

export const data = new SlashCommandBuilder()
  .setName("blame")
  .setDescription("Tell me more about this hammerspace item")
  .addStringOption((input) =>
    input
      .setName("item")
      .setDescription("The Hammerspace Item that I'll be looking up")
      .setRequired(true),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const hammerspaceItem = interaction.options.get("item")?.value?.toString();

  // Ensure prompt is a reasonable length
  if ((hammerspaceItem?.length ?? 0) > 100) {
    await interaction.reply(
      "If you're Graham, stop it. If you're not Graham, I bet he put you up to it. I need a shorter prompt please.",
    );
    logCommand();
    return;
  }

  try {
    const response = await pb
      .collection<HammerspaceRecord>("hammerspace")
      .getFirstListItem(
        `item = "${hammerspaceItem}" && (server_id = "All" || server_id = "${interaction.guildId}")`,
      );

    if (response) {
      // Found it!
      const dateCreated = new Date(response.created || "");

      try {
        await interaction.reply(
          `Hammerspace entry _'${response.item}'_ was created by **${
            response.created_by_user_id
          }** on **${dateCreated.toLocaleDateString()}** and has been used **${
            response.times_used ?? 0
          }** time${response.times_used === 1 ? "" : "s"}.`,
        );
      } catch (replyErr) {
        console.error("Error sending reply:", replyErr);
      }
    } else {
      // Couldn't find anything, so let them know
      try {
        await interaction.reply(
          `I couldn't find anything matching: _'${hammerspaceItem}'_`,
        );
      } catch (replyErr) {
        console.error("Error sending reply:", replyErr);
      }
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /blame command:", { error });
  } finally {
    logCommand();
  }
};
