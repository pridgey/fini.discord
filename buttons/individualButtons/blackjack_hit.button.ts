import { ButtonInteraction, MessageFlags } from "discord.js";

import {
  calculateHandScore,
  generateBlackjackMessage,
  getRandomCard,
  getStateFromText,
} from "../../modules/games/blackjack/blackjackUtilities";
import { addCoin } from "../../modules/finicoin";
import { Card } from "../../types/games/blackjack.types";

export const namespace = "blackjack_hit";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [userId, hidden] = args;

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const handState = getStateFromText(interaction.message.content);
    const dealerHand = [handState.dealerCards.at(0), hidden];
    const playerHand = handState.playerCards;
    const wager = handState.wager;

    // Give user a new card
    playerHand.push(getRandomCard());

    // Calculate the user's current total
    const userCurrentScore = calculateHandScore(playerHand);

    if (userCurrentScore > 21) {
      // User has busted, they lose
      // Award wager to jackpot (we already gave the user's money to the Reserve account)
      await addCoin(
        "Jackpot",
        interaction.guildId ?? "unknown guild id",
        wager,
        "Jackpot",
        interaction.guild?.name ?? "unknown guild name",
        "Reserve",
      );

      // Inform user they lost
      const lossMessage = await generateBlackjackMessage({
        dealerHand: dealerHand as Card[],
        playerHand,
        wager,
        showBalance: true,
        showDealerHand: true,
        additionalMessage: "You have busted. Better luck next time.",
        interaction,
      });

      await interaction.update({
        content: lossMessage,
        components: [],
      });

      return;
    } else {
      // The game still be going
      const currentState = await generateBlackjackMessage({
        dealerHand: dealerHand as Card[],
        playerHand,
        wager,
        showBalance: false,
        showDealerHand: false,
        interaction,
      });

      await interaction.update({
        content: currentState,
        components: [interaction.message.components[0]],
      });

      return;
    }
  } catch (error) {
    console.error("Error handling blackjack_hit:", error);
    await interaction.reply({
      content: "❌ Failed to run blackjack 'hit' button",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
