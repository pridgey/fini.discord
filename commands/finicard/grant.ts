import { ChatInputCommandInteraction } from "discord.js";
import { openPack, PACK_SIZE } from "../../modules/finicards/packs";
import { isAdmin } from "../../utilities/discord/isAdmin";
import { grantItems } from "../../modules/finicards/itemStore";
import {
  COLLECTIONS,
  itemByKey,
  piecesOf,
  type CollectionKey,
} from "../../modules/finicards/items";
import type { FinicardContext } from "./context";

/** `/finicard grant` - the bot admin hands a player cards from the pool. */
export const grantCards = async (
  interaction: ChatInputCommandInteraction,
  { serverId, serverName }: FinicardContext,
): Promise<void> => {
  // The bot admin alone, not server administrators: a granted card is
  // a free pull against the server's population limits.
  if (!isAdmin(interaction.user.id)) {
    await interaction.editReply("Only the bot admin can grant cards.");
    return;
  }

  const target = interaction.options.getUser("who", true);
  const count = interaction.options.getInteger("count") ?? PACK_SIZE;

  // An item, or a whole set's pieces, instead of cards: for trying items out.
  const item = interaction.options.getString("item")?.trim().toLowerCase();
  if (item) {
    const set = item.startsWith("set:") ? item.slice(4) : null;
    const keys = set
      ? set in COLLECTIONS
        ? piecesOf(set as CollectionKey).map((piece) => piece.key)
        : []
      : itemByKey(item)
        ? Array.from({ length: interaction.options.getInteger("count") ?? 1 }, () => item)
        : [];
    if (keys.length === 0) {
      await interaction.editReply(
        `No item or set called \`${item}\`. Keys are in \`modules/finicards/items.ts\`; sets are ${Object.keys(COLLECTIONS).map((key) => `\`set:${key}\``).join(", ")}.`,
      );
      return;
    }
    const { granted, taken } = await grantItems(target.id, serverId, keys, {
      source: "grant",
    });
    const names = (list: string[]) =>
      [...new Set(list)].map((key) => itemByKey(key)?.name).join(", ");
    await interaction.editReply(
      [
        granted.length
          ? `Granted ${granted.length} item(s) to ${target.displayName}: ${names(granted.map((row) => row.item))}.`
          : `Granted nothing to ${target.displayName}.`,
        taken.length
          ? `Someone on this server already holds ${names(taken)} - there's only one of each piece.`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  const { pulls, shortfall } = await openPack({
    userId: target.id,
    serverId,
    identifier: `${target.username}-${serverName}`,
    size: count,
    // A grant is cards handed out, not a pack opened.
    godPackChance: 0,
  });

  await interaction.editReply(
    `Granted ${pulls.length} card(s) to ${target.displayName}.${
      shortfall > 0 ? ` (${shortfall} couldn't be granted - pool is dry.)` : ""
    }`,
  );
  return;
};
