import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import type { V2DeckRecord } from "../../../types/PocketbaseTablesV2";
import { DECK_SIZE } from "../decks";
import { NEUTRAL_ACCENT } from "./theme";

/**
 * A player's decks, each with buttons to view it or make it the active one -
 * the deck a battle, practice or dungeon run brings when none is named.
 *
 * A deck is its line and a row of two buttons, four components, and Discord
 * takes forty in a message. Ten decks, the most a player can have, would need
 * forty-three, so past nine the View buttons give way and `deck show` stands in.
 */

export const DECK_SHOW_BUTTON = "v2_deck_show";
export const DECK_ACTIVE_BUTTON = "v2_deck_active";

/** The most decks that each get a View button as well. */
const WITH_VIEW = 9;

export const deckListMessage = (decks: V2DeckRecord[], userId: string) => {
  const withView = decks.length <= WITH_VIEW;
  const container = new ContainerBuilder()
    .setAccentColor(NEUTRAL_ACCENT)
    .addTextDisplayComponents((text) => text.setContent("### Your decks"));

  for (const deck of decks) {
    const size = (deck.cards ?? []).length;
    container.addTextDisplayComponents((text) =>
      text.setContent(
        `${deck.active ? "⭐ " : ""}**${deck.name}** — ${size} cards${
          deck.active ? " · active" : ""
        }${size < DECK_SIZE ? `\n-# ⚠️ too small to play (needs ${DECK_SIZE})` : ""}`,
      ),
    );
    const buttons = [
      ...(withView
        ? [
            new ButtonBuilder()
              .setCustomId(`${DECK_SHOW_BUTTON}:${deck.id}:${userId}`)
              .setLabel("View")
              .setStyle(ButtonStyle.Secondary),
          ]
        : []),
      deck.active
        ? new ButtonBuilder()
            .setCustomId(`${DECK_ACTIVE_BUTTON}:${deck.id}:${userId}`)
            .setLabel("Active")
            .setEmoji("⭐")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true)
        : new ButtonBuilder()
            .setCustomId(`${DECK_ACTIVE_BUTTON}:${deck.id}:${userId}`)
            .setLabel("Set active")
            .setStyle(ButtonStyle.Primary),
    ];
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(buttons),
    );
  }

  const active = decks.find((deck) => deck.active);
  container.addTextDisplayComponents((text) =>
    text.setContent(
      [
        active
          ? `-# Battles and dungeons bring **${active.name}** unless you name another with \`deck:\`.`
          : "-# Set a deck active and battles and dungeons bring it without you naming it.",
        ...(withView
          ? []
          : ["-# See a deck's cards with `/finicard deck show`."]),
      ].join("\n"),
    ),
  );

  return {
    components: [container],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
};
