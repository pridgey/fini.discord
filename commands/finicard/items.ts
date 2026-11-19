import type { ChatInputCommandInteraction } from "discord.js";
import {
  getItems,
  pieceHolders,
  summonedHolders,
} from "../../modules/finicards/itemStore";
import { buildItemsMessage } from "../../modules/finicards/ui/itemsMessage";
import type { FinicardContext } from "./context";

/** `/finicard items` - the player's satchel of dungeon items. */
export const showItems = async (
  interaction: ChatInputCommandInteraction,
  { serverId }: FinicardContext,
): Promise<void> => {
  const [items, holders, pieces] = await Promise.all([
    getItems(interaction.user.id, serverId),
    summonedHolders(serverId),
    pieceHolders(serverId),
  ]);
  await interaction.editReply(
    buildItemsMessage({
      playerName: interaction.user.displayName,
      held: items.map((item) => item.item),
      holders,
      pieceHolders: pieces,
      userId: interaction.user.id,
      active: items.filter((item) => item.active).map((item) => item.item),
    }),
  );
};
