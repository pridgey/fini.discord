import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
} from "discord.js";
import { addCoin, getUserBalance } from "../modules/finicoin";
import {
  checkIfBlackjack,
  generateBlackjackMessage,
  getRandomCard,
} from "../modules/games/blackjack/blackjackUtilities";
import { Card } from "../types/games/blackjack.types";

type PlayerStats = {
  Cards: Card[];
  Status: "won" | "lost" | "playing" | "standing";
};

export const data = new SlashCommandBuilder()
  .setName("blackjack")
  .setDescription("Play Blackjack with Fini")
  .addNumberOption((opt) =>
    opt
      .setName("bet")
      .setDescription("How much are you betting?")
      .setRequired(true)
      .setMinValue(1),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  await interaction.deferReply();

  try {
    // Details
    const interactionUserId = interaction.user.id;
    const guildId = interaction.guildId ?? "unknown guild id";
    const interactionUsername = interaction.user.username;
    const guildName = interaction.guild?.name ?? "unknown guild name";
    const bet = Math.abs(
      parseFloat(interaction?.options?.get("bet")?.value?.toString() || "") ||
        0,
    );

    // Ensure bet is enough
    if (bet < 0.1) {
      await interaction.editReply(
        "You cannot place a bet less than 0.10 finicoin",
      );
      return;
    }

    // Ensure user can place bet
    const userBalance = await getUserBalance(interactionUserId, guildId);
    if (userBalance < bet) {
      await interaction.editReply(
        `You do not have enough finicoin to place this wager.\nYour wager: ${bet}. Your balance: ${userBalance}`,
      );
      return;
    }

    // The Dealer's hand
    const dealerHand: Card[] = [getRandomCard(), getRandomCard()];

    // All players hands in a dictionary indexed by their user id
    const players: Record<string, PlayerStats> = {};
    // Pick random cards for the interaction user
    players[interactionUserId] = {
      Cards: [getRandomCard(), getRandomCard()],
      Status: "playing",
    };

    // Take user's wager
    await addCoin(
      "Reserve",
      guildId,
      bet,
      "Reserve",
      guildName,
      interactionUserId,
    );

    // Check if dealer got blackjack immediately
    if (checkIfBlackjack(dealerHand)) {
      // Dealer got blackjack, check if interaction player has blackjack
      // We only check interaction player as this is prior to anyone being able to join the game
      if (checkIfBlackjack(players[interactionUserId].Cards)) {
        // Player got blackjack, we push
        // The player gets their bet back
        await addCoin(
          interactionUserId,
          guildId,
          bet,
          interactionUsername,
          guildName,
          "Reserve",
        );

        // Reply with push text
        const pushReply = await generateBlackjackMessage({
          dealerHand,
          playerHand: players[interactionUserId].Cards,
          wager: bet,
          showBalance: true,
          showDealerHand: true,
          additionalMessage:
            "Both you and the dealer got blackjack. It's a push!",
          interaction,
        });

        await interaction.editReply(pushReply);
        return;
      } else {
        // Player does not have blackjack, dealer wins
        // Award wager to jackpot (we already gave the user's money to Reserve)
        await addCoin("Jackpot", guildId, bet, "Jackpot", guildName, "Reserve");

        // Reply with dealer blackjack text
        const dealerBlackjack = await generateBlackjackMessage({
          dealerHand,
          playerHand: players[interactionUserId].Cards,
          wager: bet,
          showBalance: true,
          showDealerHand: true,
          additionalMessage: "Dealer Blackjack. Better luck next time!",
          interaction,
        });
        await interaction.editReply(dealerBlackjack);
        return;
      }
    }
    // Ensure the user doesn't auto win
    if (checkIfBlackjack(players[interactionUserId].Cards)) {
      // Player has blackjack and wins

      // Calculate natural jackpot win
      const reward = bet + bet * 1.5;

      await addCoin(
        interactionUserId,
        guildId,
        reward,
        interactionUsername,
        guildName,
        "Reserve",
      );

      // Reply with player Blackjack message
      const playerBlackjack = await generateBlackjackMessage({
        dealerHand,
        playerHand: players[interactionUserId].Cards,
        wager: bet,
        showBalance: true,
        showDealerHand: true,
        additionalMessage: `Natural Blackjack. Congratulations! You've gained: ${
          bet * 1.5
        } finicoin.`,
        interaction,
      });
      await interaction.editReply(playerBlackjack);
      return;
    }

    // Now the user can actually play...
    const hitButton = new ButtonBuilder()
      .setCustomId(`blackjack_hit:${interactionUserId}:${dealerHand.at(1)}`)
      .setLabel("Hit")
      .setStyle(ButtonStyle.Secondary);
    ``;
    const standButton = new ButtonBuilder()
      .setCustomId(`blackjack_stand:${interactionUserId}:${dealerHand.at(1)}`)
      .setLabel("Stand")
      .setStyle(ButtonStyle.Secondary);
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      hitButton,
      standButton,
    );

    // Initial (non-blackjack) response
    const initialMessage = await generateBlackjackMessage({
      dealerHand,
      playerHand: players[interactionUserId].Cards,
      wager: bet,
      showBalance: false,
      showDealerHand: false,
      interaction,
    });

    // Show the initial game state with buttons to hit or stand
    await interaction.editReply({
      content: initialMessage,
      components: [actionRow],
    });
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /blackjack command", { error });
    await interaction.editReply("An error has occurred.");
  } finally {
    logCommand();
  }
};
