import type { SelectHandler } from "../../types/handlers";
import { MessageFlags, StringSelectMenuInteraction } from "discord.js";
import {
  ITEMS_USE,
  cardBoonModal,
} from "../../modules/finicards/ui/itemsMessage";
import { itemByKey } from "../../modules/finicards/items";
import { satchelFor } from "../../commands/finicard/items";
import { sceneFor, useItem } from "../../commands/finicard/use";

export const namespace = ITEMS_USE;

/**
 * An item picked from a satchel's dropdown. A card boon first asks which card
 * in a form (`finicardItemsCard.modal.ts`); anything else is used at once,
 * said beneath the satchel, and the satchel redrawn to match.
 */
export const execute: SelectHandler["execute"] = async (
  interaction: StringSelectMenuInteraction,
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
  const picked = interaction.values[0] ?? "";
  const item = itemByKey(picked);
  // A form has to be the first answer, so it's decided from the pick alone;
  // whether the boon's still held is checked when the form comes back.
  if (item?.kind === "card_boon") {
    await interaction.showModal(
      cardBoonModal(item, Number(page) || 0, interaction.user.id),
    );
    return;
  }

  await interaction.deferUpdate();
  const serverId = interaction.guildId ?? "unknown guild id";
  try {
    await useItem(sceneFor(interaction), picked, serverId);
  } finally {
    await interaction
      .editReply(await satchelFor(interaction.user, serverId, Number(page) || 0))
      .catch((error) => console.error("Couldn't redraw a satchel:", error));
  }
};
