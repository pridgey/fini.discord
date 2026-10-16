import { ChatInputCommandInteraction } from "discord.js";
import { openPack, PACK_SIZE } from "../../modules/finicards/packs";
import { isAdmin } from "../../utilities/discord/isAdmin";
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

  const { pulls, shortfall } = await openPack({
    userId: target.id,
    serverId,
    identifier: `${target.username}-${serverName}`,
    size: count,
  });

  await interaction.editReply(
    `Granted ${pulls.length} card(s) to ${target.displayName}.${
      shortfall > 0 ? ` (${shortfall} couldn't be granted - pool is dry.)` : ""
    }`,
  );
  return;
};
