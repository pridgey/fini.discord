import { ButtonInteraction, MessageFlags } from "discord.js";
import { acceptAndReveal } from "../../modules/finicardsV2/battleFlow";
import { getBattle } from "../../modules/finicardsV2/battleStore";
import { getDeck } from "../../modules/finicardsV2/decks";

export const namespace = "v2_deck_pick";

/** The defender chose which deck to bring; deal both hands and reveal. */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [battleId, deckId] = args;

  const battle = await getBattle(battleId);

  if (!battle || battle.defender_id !== interaction.user.id) {
    await interaction.update({
      content: "❌ This challenge isn't yours to answer.",
      components: [],
    });
    return;
  }

  const deck = await getDeck(deckId);

  if (!deck || deck.user_id !== interaction.user.id) {
    await interaction.update({
      content: "❌ That deck isn't yours.",
      components: [],
    });
    return;
  }

  await interaction.update({
    content: `Bringing **${deck.name}**…`,
    components: [],
  });

  const result = await acceptAndReveal(interaction, battleId, deck);

  if (!result.ok) {
    await interaction.followUp({
      content: `❌ ${result.reason}`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.editReply({
    content: `Accepted with **${deck.name}**. Your hand is in the channel.`,
    components: [],
  });
}
