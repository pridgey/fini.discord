import { Client, TextChannel, TextDisplayBuilder } from "discord.js";
import { getBotChannelForServer } from "../../../utilities/config/configUtils";
import { getOwnedCard, toBattleCard } from "../cardStore";
import { buildCardMessage } from "../ui";
import type { CardPoster } from "./requests";

/**
 * "See in Discord" from the Finicards site: the card posted in the server's
 * bot channel as the View button shows it, under a line saying whose it is.
 * The player is named but not pinged - they pressed the button.
 */
export const makeCardPoster =
  (cl: Client): CardPoster =>
  async (serverId, discordId, copyId) => {
    const channelId = await getBotChannelForServer(serverId);
    if (!channelId) return false;
    const channel = await cl.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return false;

    const owned = await getOwnedCard(copyId);
    if (!owned) return false;
    const message = await buildCardMessage(toBattleCard(owned));
    if (!message) return false;

    await (channel as TextChannel).send({
      ...message,
      components: [
        new TextDisplayBuilder().setContent(`🎴 <@${discordId}> is showing a card from the Finicards site`),
        ...message.components,
      ],
      allowedMentions: { parse: [] },
    });
    return true;
  };
