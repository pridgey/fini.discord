import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
} from "discord.js";
import { randomNumber } from "../utilities/randomNumber";
import { addCoin, getUserBalance } from "../modules/finicoin";

type Card =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";
const cardDeck: Card[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

type PlayerStats = {
  Cards: Card[];
  Status: "won" | "lost" | "playing" | "standing";
};

// Utility function to check if a card array has blackjack
const checkIfBlackjack = (cards: Card[]): boolean => {
  const handHasAce = cards.includes("A");
  const handHas10 = cards.some((c) => ["10", "J", "Q", "K"].includes(c));

  return handHas10 && handHasAce;
};

// Utility function to print a card hand to discord text
const printCardHand = (cards: Card[]): string => {
  return cards.map((dh) => `\`[ ${dh} ]\``).join(" ");
};

// Utility function to get a random card from the deck
const getRandomCard = () => {
  const randomIndex = randomNumber(0, cardDeck.length - 1, true);
  const card = cardDeck[randomIndex];
  return card;
};

// Utility function to determine the score of a hand of cards
const calculateHandScore = (cards: Card[]): number => {
  let score = 0;
  let acesCount = 0;

  for (const card of cards) {
    switch (card) {
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        score += parseInt(card);
        break;
      case "10":
      case "J":
      case "Q":
      case "K":
        score += 10;
        break;
      case "A":
        acesCount += 1;
        break;
      default:
        throw new Error(`Invalid card: ${card}`);
    }
  }

  // Handle Aces, deciding their value as 1 or 11
  while (acesCount > 0) {
    // Check if treating this Ace as 11 keeps the score <= 21
    if (score + 11 <= 21) {
      score += 11;
    } else {
      score += 1;
    }
    acesCount -= 1;
  }

  return score;
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

    // Utility function to help respond to the interaction
    const generateContentMessage = async (
      dealerHand: Card[],
      playerHand: Card[],
      showBalance: boolean,
      showDealerHand: boolean,
      additionalMessage?: string,
    ) => {
      const userBalance = await getUserBalance(interactionUserId, guildId);
      const dealerScore = calculateHandScore(dealerHand);
      const playerScore = calculateHandScore(playerHand);

      const dealerHandText = showDealerHand
        ? printCardHand(dealerHand)
        : printCardHand(dealerHand.slice(0, 1));

      const message = `**Dealer's Hand:**\r${dealerHandText}${
        showDealerHand ? `(${dealerScore})` : " `[ ? ]`"
      }\r\r**${interactionUsername}'s Hand:**\r${printCardHand(
        playerHand,
      )} (${playerScore})${
        !!additionalMessage ? `\r\r${additionalMessage}` : ""
      }${
        showBalance ? `\r${interactionUsername} balance: ${userBalance}` : ""
      }`;

      return message;
    };

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
        const pushReply = await generateContentMessage(
          dealerHand,
          players[interactionUserId].Cards,
          true,
          true,
          "Double Blackjack. It's a Push.",
        );
        await interaction.editReply(pushReply);
        return;
      } else {
        // Player does not have blackjack, dealer wins
        // Award wager to jackpot (we already gave the user's money to Reserve)
        await addCoin("Jackpot", guildId, bet, "Jackpot", guildName, "Reserve");

        // Reply with dealer blackjack text
        const dealerBlackjack = await generateContentMessage(
          dealerHand,
          players[interactionUserId].Cards,
          true,
          true,
          "Dealer Blackjack. Better luck next time!",
        );
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
      const playerBlackjack = await generateContentMessage(
        dealerHand,
        players[interactionUserId].Cards,
        true,
        true,
        `Natural Blackjack. Congratulations! You've gained: ${
          bet * 1.5
        } finicoin.`,
      );
      await interaction.editReply(playerBlackjack);
      return;
    }

    // Now the user can actually play...
    const hitButton = new ButtonBuilder()
      .setCustomId("hit")
      .setLabel("Hit")
      .setStyle(ButtonStyle.Secondary);
    const standButton = new ButtonBuilder()
      .setCustomId("stand")
      .setLabel("Stand")
      .setStyle(ButtonStyle.Secondary);
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      hitButton,
      standButton,
    );

    // Initial (non-blackjack) response
    const initialMessage = await generateContentMessage(
      dealerHand,
      players[interactionUserId].Cards,
      false,
      false,
    );
    const interactionResponse = await interaction.editReply({
      content: initialMessage,
      components: [actionRow],
    });

    // Filter ensures only the original user can interact with the buttons
    const collectorFilter = (i) => i.user.id === interactionUserId;

    // Listen for interactions
    const collector = interactionResponse.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: collectorFilter,
      time: 600_000, // 10 min
    });

    // Event that fires when the collector times out
    collector.on("end", async (i) => {
      // Show final hand
      const timeoutMessage = await generateContentMessage(
        dealerHand,
        players[interactionUserId].Cards,
        true,
        true,
        "Game has timed out.",
      );
      await interaction.editReply({
        content: timeoutMessage,
        components: [],
      });
    });

    // Event that fires when a user interacts with the buttons
    collector.on("collect", async (i) => {
      if (i.customId === "hit") {
        // Give user a new card
        players[i.user.id].Cards.push(getRandomCard());
        // Calculate the user's current total
        const userCurrentScore = calculateHandScore(players[i.user.id].Cards);

        if (userCurrentScore > 21) {
          // User has busted, they lose
          // Award wager to jackpot (we already gave the user's money to Reserve)
          await addCoin(
            "Jackpot",
            guildId,
            bet,
            "Jackpot",
            guildName,
            "Reserve",
          );

          // Inform user they lost
          const lossMessage = await generateContentMessage(
            dealerHand,
            players[i.user.id].Cards,
            true,
            true,
            "You have busted. Better luck next time.",
          );
          await i.update({
            content: lossMessage,
            components: [],
          });
        } else {
          // User still has options
          const currentState = await generateContentMessage(
            dealerHand,
            players[i.user.id].Cards,
            false,
            false,
          );
          await i.update({
            content: currentState,
            components: [actionRow],
          });
        }
      } else if (i.customId === "stand") {
        // Get user stats
        const playerScore = calculateHandScore(players[i.user.id].Cards);
        players[i.user.id].Status = "standing";

        // Perform dealer logic
        let dealerScore = calculateHandScore(dealerHand);
        while (dealerScore < 17) {
          // Deal card
          dealerHand.push(getRandomCard());

          const nextDealerScore = calculateHandScore(dealerHand);

          if (nextDealerScore > 21) {
            // Dealer busts
            // Calculate win
            const reward = bet + bet;

            await addCoin(
              interactionUserId,
              guildId,
              reward,
              interactionUsername,
              guildName,
              "Reserve",
            );

            // Reply with dealer bust text
            const dealerBust = await generateContentMessage(
              dealerHand,
              players[i.user.id].Cards,
              true,
              true,
              `Dealer busts. Congratulations, you've won ${bet} finicoin.`,
            );
            await interaction.editReply({
              content: dealerBust,
              components: [],
            });
            return;
          }
          dealerScore = nextDealerScore;
        }

        // Check for a tie
        if (playerScore === dealerScore) {
          // Calculate tie win
          const reward = bet;

          await addCoin(
            interactionUserId,
            guildId,
            reward,
            interactionUsername,
            guildName,
            "Reserve",
          );

          // Reply with tie text
          const tieMessage = await generateContentMessage(
            dealerHand,
            players[i.user.id].Cards,
            true,
            true,
            `You've tied. You've won your ${reward} bet back.`,
          );
          await i.update({
            content: tieMessage,
            components: [],
          });
          return;
        }

        // Now that dealer is down, compare scores
        const userWins = playerScore > dealerScore;

        if (userWins) {
          // Calculate regular win
          const reward = bet + bet;

          await addCoin(
            interactionUserId,
            guildId,
            reward,
            interactionUsername,
            guildName,
            "Reserve",
          );

          // Reply with winningHand text
          const winMessage = await generateContentMessage(
            dealerHand,
            players[i.user.id].Cards,
            true,
            true,
            `You've beat the dealer. Congratulations, you've won ${bet} finicoin.`,
          );
          await i.update({
            content: winMessage,
            components: [],
          });
        } else {
          // Dealer wins, tough luck
          // Award wager to jackpot (we already gave the user's money to Reserve)
          await addCoin(
            "Jackpot",
            guildId,
            bet,
            "Jackpot",
            guildName,
            "Reserve",
          );

          // Reply with loss text
          const lossMessage = await generateContentMessage(
            dealerHand,
            players[i.user.id].Cards,
            true,
            true,
            "Dealer wins. Better luck next time.",
          );
          await i.update({
            content: lossMessage,
            components: [],
          });
        }
      } else {
        // Unsure of what happened, just return current state I guess
        await i.update({
          content: `**Dealer's Hand:**\n${printCardHand(
            dealerHand,
          )}\n\n**${interactionUsername}'s Hand:**\n${printCardHand(
            players[interactionUserId].Cards,
          )}`,
          components: [actionRow],
        });
      }
    });

    return;
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /blackjack command", { error });
    await interaction.editReply("An error has occurred.");
  } finally {
    logCommand();
  }
};
