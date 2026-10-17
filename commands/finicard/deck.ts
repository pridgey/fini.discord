import {
  ButtonStyle,
  ChatInputCommandInteraction,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { compositionString, NEUTRAL_ACCENT } from "../../modules/finicards/ui";
import { buildDeckPages } from "../../modules/finicards/cardPages";
import {
  DECK_SIZE,
  autoBuildDeck,
  deleteDeck,
  findDeckByName,
  getDecks,
  loadDeck,
  updateDeckCards,
} from "../../modules/finicards/decks";
import { HAND_SIZE } from "../../modules/finicards/draw";
import { resolveLineup } from "../../modules/finicards/cardStore";
import { RARITY_LABEL, TYPE_EMOJI } from "../../modules/finicards/rules";
import type {
  CardRarity,
  CardType,
  V2DeckRecord,
} from "../../types/PocketbaseTablesV2";
import type { FinicardContext } from "./context";

/* -------------------------------------------------------------------------- */
/* Decks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The `deck` subcommand group.
 *
 * `build` is the path that matters: it assembles a deck from the collection with
 * optional filters, so a player never has to type a card id to get playing. The
 * manual `add` / `remove` are there for tuning afterwards.
 */
export const handleDeckSubcommand = async (
  interaction: ChatInputCommandInteraction,
  context: FinicardContext,
) => {
  const { serverId, identifier } = context;
  const userId = interaction.user.id;

  const describeDeck = async (deck: V2DeckRecord) => {
    const contents = await loadDeck(deck, serverId);
    const composition = { power: 0, wit: 0, heart: 0 };
    for (const card of contents.cards) composition[card.type] += 1;

    return [
      `### ${deck.name} — ${contents.cards.length} cards ${compositionString(composition)}`,
      contents.missing.length > 0
        ? `_${contents.missing.length} card(s) in this deck are no longer in your collection._`
        : "",
      contents.cards
        .map(
          (card) =>
            `${TYPE_EMOJI[card.type]} **${card.name}**${card.foil ? " ✨" : ""} \`${card.stats.power}/${card.stats.wit}/${card.stats.heart}\` · ${RARITY_LABEL[card.rarity]} · \`${card.instanceId}\``,
        )
        .join("\n"),
    ]
      .filter(Boolean)
      .join("\n");
  };

  switch (interaction.options.getSubcommand()) {
    case "list": {
      const decks = await getDecks(userId, serverId);

      if (decks.length === 0) {
        await interaction.editReply(
          `You have no decks. Build one with \`/finicard deck build name:Main\` — a battle deals ${HAND_SIZE} cards from it.`,
        );
        return;
      }

      // One row per deck, each with a button onto the same pages as
      // `deck show`.
      const container = new ContainerBuilder()
        .setAccentColor(NEUTRAL_ACCENT)
        .addTextDisplayComponents((text) => text.setContent("### Your decks"));

      for (const deck of decks) {
        const size = (deck.cards ?? []).length;
        container.addSectionComponents((section) =>
          section
            .addTextDisplayComponents((text) =>
              text.setContent(
                `**${deck.name}** — ${size} cards${
                  size < DECK_SIZE
                    ? `\n-# ⚠️ too small to play (needs ${DECK_SIZE})`
                    : ""
                }`,
              ),
            )
            .setButtonAccessory((button) =>
              button
                .setCustomId(`v2_deck_show:${deck.id}:${userId}`)
                .setLabel("View")
                .setStyle(ButtonStyle.Secondary),
            ),
        );
      }

      container.addTextDisplayComponents((text) =>
        text.setContent("-# Bring one with `/finicard battle deck:<name>`."),
      );

      await interaction.editReply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    case "build": {
      const name = interaction.options.getString("name", true);
      const type = interaction.options.getString("type") as CardType | null;
      const rarity = interaction.options.getString(
        "rarity",
      ) as CardRarity | null;
      const tag = interaction.options.getString("tag") ?? undefined;

      const result = await autoBuildDeck({
        userId,
        serverId,
        identifier,
        name,
        filter: {
          tag,
          ...(type ? { type } : {}),
          ...(rarity ? { rarity } : {}),
        },
      });

      if (!result.ok) {
        await interaction.editReply(result.reason);
        return;
      }

      await interaction.editReply(
        `Built **${result.deck.name}** with ${result.taken} of your ${result.eligible} cards.\n\n${await describeDeck(result.deck)}`,
      );
      return;
    }

    case "show": {
      const deck = await findDeckByName(
        userId,
        serverId,
        interaction.options.getString("name", true),
      );

      if (!deck) {
        await interaction.editReply("You have no deck by that name.");
        return;
      }

      const pages = await buildDeckPages(deck, {
        viewerId: userId,
        binder: interaction.options.getString("view") === "binder",
      });
      await interaction.editReply(
        pages ??
          `**${deck.name}** has no cards left in your collection. Add some with \`/finicard deck add\`.`,
      );
      return;
    }

    case "add":
    case "remove": {
      const isAdd = interaction.options.getSubcommand() === "add";
      const deck = await findDeckByName(
        userId,
        serverId,
        interaction.options.getString("name", true),
      );

      if (!deck) {
        await interaction.editReply("You have no deck by that name.");
        return;
      }

      const rawCard = interaction.options.getString("card", true);
      const { cards, errors } = await resolveLineup(
        userId,
        serverId,
        [rawCard],
        1,
      );

      if (cards.length === 0) {
        await interaction.editReply(
          errors.join("\n") || `No card of yours matches \`${rawCard}\`.`,
        );
        return;
      }

      const card = cards[0];
      const updated = await updateDeckCards(
        deck,
        isAdd ? { add: [card.instanceId] } : { remove: [card.instanceId] },
      );

      if (!updated.ok) {
        await interaction.editReply(updated.reason);
        return;
      }

      await interaction.editReply(
        `${isAdd ? "Added" : "Removed"} **${card.name}** ${isAdd ? "to" : "from"} **${deck.name}** (${(updated.deck.cards ?? []).length} of ${DECK_SIZE} cards${
          (updated.deck.cards ?? []).length < DECK_SIZE
            ? " - add another before you play it"
            : ""
        }).`,
      );
      return;
    }

    case "delete": {
      const deck = await findDeckByName(
        userId,
        serverId,
        interaction.options.getString("name", true),
      );

      if (!deck) {
        await interaction.editReply("You have no deck by that name.");
        return;
      }

      await deleteDeck(deck.id!);
      await interaction.editReply(`Deleted **${deck.name}**.`);
      return;
    }

    default:
      await interaction.editReply("Unknown deck subcommand.");
  }
};
