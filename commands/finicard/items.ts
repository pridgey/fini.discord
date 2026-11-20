import type { ChatInputCommandInteraction } from "discord.js";
import {
  getItems,
  pieceHolders,
  summonedHolders,
} from "../../modules/finicards/itemStore";
import { buildItemsMessage } from "../../modules/finicards/ui/itemsMessage";
import { useOptions } from "../../modules/finicards/useItem";
import type { FinicardContext } from "./context";

/** A player's satchel as it stands, at `page`: drawn for the command and redrawn by its buttons. */
export const satchelFor = async (
  user: { id: string; displayName: string },
  serverId: string,
  page = 0,
) => {
  const [items, holders, pieces] = await Promise.all([
    getItems(user.id, serverId),
    summonedHolders(serverId),
    pieceHolders(serverId),
  ]);
  return buildItemsMessage({
    playerName: user.displayName,
    held: items.map((item) => item.item),
    holders,
    pieceHolders: pieces,
    userId: user.id,
    active: items.filter((item) => item.active).map((item) => item.item),
    options: useOptions(items, holders),
    page,
  });
};

/** `/finicard items` - the player's satchel of dungeon items, and where they're used. */
export const showItems = async (
  interaction: ChatInputCommandInteraction,
  { serverId }: FinicardContext,
): Promise<void> => {
  await interaction.editReply(await satchelFor(interaction.user, serverId));
};
