import type { ButtonHandler } from "../../types/handlers";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { getOwnedCard, toBattleCard } from "../../modules/finicards/cardStore";
import { buybackPrice } from "../../modules/finicards/market";
import { renderCardFace } from "../../modules/finicards/renderBattle";
import { buildCardMessage } from "../../modules/finicards/ui";
import { NEUTRAL_ACCENT } from "../../modules/finicards/ui/theme";

export const namespace = "v2_card_view";

/**
 * Swaps a collection page out for one card, in place.
 *
 * Replacing the message rather than posting the card is what makes browsing a
 * collection feel like browsing: no new message per click, and the pagination
 * row you were using doesn't scroll away. The context id rides along in the
 * custom id so the Back button can put the exact page you left back.
 */
export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  try {
    const [contextId, cardId, userId] = args;

    // The message is shared, so the check is against whoever opened the
    // collection - not against whoever owns the card. Viewing someone else's
    // collection is allowed; hijacking their message is not.
    if (userId && userId !== interaction.user.id) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // Acknowledged before any work: a press has three seconds to be answered,
    // and a slow lookup or upload must not show as "interaction failed".
    await interaction.deferUpdate();

    const owned = await getOwnedCard(cardId);

    if (!owned) {
      await interaction.followUp({
        content: "❌ That card no longer exists.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const card = toBattleCard(owned);

    const backRow = new ActionRowBuilder<ButtonBuilder>().setComponents([
      new ButtonBuilder()
        .setCustomId(`v2_card_back:${contextId}:${userId}`)
        .setLabel("◀ Back")
        .setStyle(ButtonStyle.Secondary),
      // Only on your own card: this is the quick way to sell it back to Fini.
      // Selling to another player is `/finicard sell`.
      ...(owned.user_id === interaction.user.id
        ? [
            new ButtonBuilder()
              .setCustomId(`v2_card_sell:${contextId}:${cardId}:${userId}:ask`)
              .setLabel(`Sell to Fini · ${buybackPrice(card)} fc`)
              .setStyle(ButtonStyle.Secondary),
          ]
        : []),
    ]);

    const message = await buildCardMessage(card);

    /*
     * The text face is the fallback for a failed render, but it has to stay
     * inside a container: this message was created with IsComponentsV2 and a
     * V2 message can never be edited back into a plain `content` one.
     */
    if (!message) {
      await interaction.editReply({
        components: [
          new ContainerBuilder()
            .setAccentColor(NEUTRAL_ACCENT)
            .addTextDisplayComponents((text) =>
              text.setContent(renderCardFace(card)),
            ),
          backRow,
        ],
        files: [],
        attachments: [],
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    await interaction.editReply({
      components: [...message.components, backRow],
      files: message.files,
      attachments: [],
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (error) {
    console.error("Error viewing v2 card:", error, { args });
    const failed = {
      content: "❌ Failed to load that card",
      flags: [MessageFlags.Ephemeral] as [MessageFlags.Ephemeral],
    };
    if (interaction.replied || interaction.deferred)
      await interaction.followUp(failed).catch(() => undefined);
    else await interaction.reply(failed).catch(() => undefined);
  }
};
