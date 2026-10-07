import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { getOwnedCard, toBattleCard } from "../../modules/finicardsV2/cardStore";
import { renderCardFace } from "../../modules/finicardsV2/renderBattle";
import { buildCardMessage } from "../../modules/finicardsV2/ui";
import { NEUTRAL_ACCENT } from "../../modules/finicardsV2/ui/theme";

export const namespace = "v2_card_view";

/**
 * Swaps a collection page out for one card, in place.
 *
 * Replacing the message rather than posting the card is what makes browsing a
 * collection feel like browsing: no new message per click, and the pagination
 * row you were using doesn't scroll away. The context id rides along in the
 * custom id so the Back button can put the exact page you left back.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
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

    const owned = await getOwnedCard(cardId);

    if (!owned) {
      await interaction.reply({
        content: "❌ That card no longer exists.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const card = toBattleCard(owned);

    const backRow = new ActionRowBuilder<ButtonBuilder>().setComponents([
      new ButtonBuilder()
        .setCustomId(`v2_card_back:${contextId}:${userId}`)
        .setLabel("◀ Back to collection")
        .setStyle(ButtonStyle.Secondary),
    ]);

    const message = await buildCardMessage(card);

    /*
     * The text face is the fallback for a failed render, but it has to stay
     * inside a container: this message was created with IsComponentsV2 and a
     * V2 message can never be edited back into a plain `content` one.
     */
    if (!message) {
      await interaction.update({
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

    await interaction.update({
      components: [...message.components, backRow],
      files: message.files,
      attachments: [],
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (error) {
    console.error("Error viewing v2 card:", error, { args });
    await interaction.reply({
      content: "❌ Failed to load that card",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
