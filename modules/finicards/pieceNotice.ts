import { ContainerBuilder, MessageFlags, type Client } from "discord.js";
import { sendTo } from "../dailies/shared";
import { getBotChannelForServer } from "../../utilities/config/configUtils";
import { pieceHolders } from "./itemStore";
import { COLLECTIONS, itemByKey, piecesOf } from "./items";

/**
 * A collection piece found, told to the server (issue #8). There's one of
 * each per server, so a find is news: it says who has it now, and how much of
 * the set the server has turned up - which is who to trade with.
 */

const ACCENT = 0xb18cff;

/** "🟠 <@aya> found the **4-Star Dragon Ball** · 3 of 7 Dragon Balls found on this server" */
export const pieceFoundLine = (
  userId: string,
  key: string,
  found: number,
): string | null => {
  const item = itemByKey(key);
  if (!item?.set) return null;
  const set = COLLECTIONS[item.set];
  const total = piecesOf(item.set).length;
  return `${item.emoji} <@${userId}> found the **${item.name}** · ${found} of ${total} ${set.name} found on this server`;
};

/**
 * Tells the bot channel about the pieces a player just got, if any. Never
 * throws: the player has their pieces either way.
 */
export const announcePiecesFound = async (
  client: Client,
  serverId: string,
  userId: string,
  keys: string[],
): Promise<void> => {
  try {
    const pieces = keys.filter((key) => itemByKey(key)?.kind === "piece");
    if (pieces.length === 0) return;
    const channelId = await getBotChannelForServer(serverId);
    if (!channelId) return;
    const holders = await pieceHolders(serverId);
    const lines = pieces.flatMap((key) => {
      const set = itemByKey(key)!.set!;
      const found = piecesOf(set).filter((piece) => holders.has(piece.key))
        .length;
      const line = pieceFoundLine(userId, key, found);
      return line ? [line] : [];
    });
    if (lines.length === 0) return;
    await sendTo(client, channelId, {
      components: [
        new ContainerBuilder()
          .setAccentColor(ACCENT)
          .addTextDisplayComponents((text) => text.setContent(lines.join("\n"))),
      ],
      flags: [MessageFlags.IsComponentsV2],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Couldn't announce a piece found:", error);
  }
};
