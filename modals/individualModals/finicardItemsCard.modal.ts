import type { ModalHandler } from "../../types/handlers";
import { MessageFlags, ModalSubmitInteraction } from "discord.js";
import { ITEMS_CARD } from "../../modules/finicards/ui/itemsMessage";
import { satchelFor } from "../../commands/finicard/items";
import { sceneFor, useItem } from "../../commands/finicard/use";

export const namespace = ITEMS_CARD;

/** A card boon's form, back from the satchel: the boon used on the card it names. */
export const execute: ModalHandler["execute"] = async (
  interaction: ModalSubmitInteraction,
  args: string[],
) => {
  const [itemKey, page, userId] = args;
  if (userId && userId !== interaction.user.id) {
    await interaction.reply({
      content: "❌ This isn't your satchel.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  // Opened from the satchel's dropdown, so this answers on the satchel.
  if (!interaction.isFromMessage()) return;
  await interaction.deferUpdate();
  const serverId = interaction.guildId ?? "unknown guild id";
  const field = (id: string) => {
    try {
      return interaction.fields.getTextInputValue(id);
    } catch {
      return "";
    }
  };
  try {
    await useItem(sceneFor(interaction), itemKey ?? "", serverId, {
      card: field("card"),
      name: field("name"),
    });
  } finally {
    await interaction
      .editReply(await satchelFor(interaction.user, serverId, Number(page) || 0))
      .catch((error) => console.error("Couldn't redraw a satchel:", error));
  }
};
