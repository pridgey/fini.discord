import type { ButtonHandler } from "../../types/handlers";
import { ButtonInteraction, MessageFlags } from "discord.js";
import { ITEMS_PAGE } from "../../modules/finicards/ui/itemsMessage";
import { satchelFor } from "../../commands/finicard/items";

export const namespace = ITEMS_PAGE;

/** Turns a satchel's page, drawn afresh from what the player holds now. */
export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [page, userId] = args;
  if (userId && userId !== interaction.user.id) {
    await interaction.reply({
      content: "❌ This isn't your satchel - open your own with `/finicard items`.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  await interaction.deferUpdate();
  await interaction.editReply(
    await satchelFor(
      interaction.user,
      interaction.guildId ?? "unknown guild id",
      Number(page) || 0,
    ),
  );
};
