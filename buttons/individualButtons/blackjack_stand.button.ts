import { ButtonInteraction, MessageFlags } from "discord.js";

import {
  calculateHandScore,
  generateBlackjackMessage,
  getRandomCard,
  getStateFromText,
} from "../../modules/games/blackjack/blackjackUtilities";
import { addCoin } from "../../modules/finicoin";
import { Card } from "../../types/games/blackjack.types";

export const namespace = "blackjack_stand";

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
    const dealerHand = [handState.dealerCards[0], hidden as Card];
    const playerHand = handState.playerCards;
    const playerTotal = calculateHandScore(playerHand);
    const wager = handState.wager;

    let dealerScore = calculateHandScore(dealerHand);

    // Dealer must hit until they reach 17
    while (dealerScore < 17) {
      dealerHand.push(getRandomCard());
      dealerScore = calculateHandScore(dealerHand);
    }

    // Check if dealer busted
    if (dealerScore > 21) {
      // Dealer busts, player wins
      const reward = wager + wager;

      await addCoin(
        interaction.user.id,
        interaction.guildId ?? "unknown guild id",
        reward,
        interaction.user.username,
        interaction.guild?.name ?? "unknown guild name",
        "Reserve",
      );

      const winMessage = await generateBlackjackMessage({
        dealerHand,
        playerHand,
        wager,
        showBalance: true,
        showDealerHand: true,
        additionalMessage: `Dealer busts. Congratulations, you've won ${reward} finicoin.`,
        interaction,
      });

      await interaction.update({
        content: winMessage,
        components: [],
      });
      return;
    }

    // Check for tie
    if (playerTotal === dealerScore) {
      // It's a tie, return player's bet
      await addCoin(
        interaction.user.id,
        interaction.guildId ?? "unknown guild id",
        wager,
        interaction.user.username,
        interaction.guild?.name ?? "unknown guild name",
        "Reserve",
      );

      const tieMessage = await generateBlackjackMessage({
        dealerHand,
        playerHand,
        wager,
        showBalance: true,
        showDealerHand: true,
        additionalMessage: `It's a tie! You get your bet back.`,
        interaction,
      });

      await interaction.update({
        content: tieMessage,
        components: [],
      });
      return;
    }

    if (playerTotal > dealerScore) {
      // Player wins, good job to the player
      const reward = wager + wager;

      await addCoin(
        interaction.user.id,
        interaction.guildId ?? "unknown guild id",
        reward,
        interaction.user.username,
        interaction.guild?.name ?? "unknown guild name",
        "Reserve",
      );

      const winMessage = await generateBlackjackMessage({
        dealerHand,
        playerHand,
        wager,
        showBalance: true,
        showDealerHand: true,
        additionalMessage: `Congratulations, you've beat the dealer and won ${reward} finicoin!`,
        interaction,
      });

      await interaction.update({
        content: winMessage,
        components: [],
      });
      return;
    } else {
      // Dealer wins, tough luck
      // Award wager to jackpot (we already gave the user's money to Reserve)
      await addCoin(
        "Jackpot",
        interaction.guildId ?? "unknown guild id",
        wager,
        "Jackpot",
        interaction.guild?.name ?? "unknown guild name",
        "Reserve",
      );

      const lossMessage = await generateBlackjackMessage({
        dealerHand,
        playerHand,
        wager,
        showBalance: true,
        showDealerHand: true,
        additionalMessage: "Dealer wins. Better luck next time.",
        interaction,
      });

      await interaction.update({
        content: lossMessage,
        components: [],
      });
    }
  } catch (error) {
    console.error("Error handling blackjack_stand:", error);
    await interaction.reply({
      content: "❌ Failed to run blackjack 'stand' button",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
