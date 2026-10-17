import type { ChatInputCommandInteraction } from "discord.js";
import { findDeckByName, getDecks } from "../../modules/finicards/decks";
import type { V2DeckRecord } from "../../types/PocketbaseTablesV2";

/** "**Main**, **Aggro**" - a player's decks, to say which they could have meant. */
export const deckNames = (decks: V2DeckRecord[]) =>
  decks.map((d) => `**${d.name}**`).join(", ");

/**
 * The deck a battle, practice or dungeon run is played with: the one named, or
 * the only one when the player has just one. Otherwise it answers the player -
 * no decks, no deck by that name, or which of several - and gives back null.
 * @param noDecks What to say to a player with no decks at all
 */
export const pickDeck = async (
  interaction: ChatInputCommandInteraction,
  serverId: string,
  deckName: string | null,
  noDecks: string,
): Promise<{ deck: V2DeckRecord; decks: V2DeckRecord[] } | null> => {
  const decks = await getDecks(interaction.user.id, serverId);

  if (decks.length === 0) {
    await interaction.editReply(noDecks);
    return null;
  }

  const deck = deckName
    ? await findDeckByName(interaction.user.id, serverId, deckName)
    : decks.length === 1
      ? decks[0]
      : null;

  if (!deck) {
    await interaction.editReply(
      deckName
        ? `You have no deck called **${deckName}**. Yours: ${deckNames(decks)}.`
        : `You have several decks - say which one: ${deckNames(decks)}.`,
    );
    return null;
  }

  return { deck, decks };
};
