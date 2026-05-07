import { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { Card, cardDeck } from "../../../types/games/blackjack.types";
import { getUserBalance } from "../../finicoin";
import { randomNumber } from "../../../utilities/randomNumber";

/**
 * Utility function to extract dealer and player hand information from the blackjack game message text.
 */
type BlackJackState = {
  dealerCards: Card[];
  playerCards: Card[];
  wager: number;
};
export const getStateFromText = (text: string): BlackJackState => {
  // "### pridgey's blackjack game\r\r_Wager_: 10\r\r**Dealer's Hand:**\r`[ J ]` `[ ? ]`\r\r**pridgey's Hand:**\r`[ 10 ]` `[ 3 ]` (13)"

  // Split the message into lines
  const lines = text.split("\r\r");
  const wagerLine = lines.find((line) => line.startsWith("_Wager_:"));
  const dealerLine = lines.find((line) =>
    line.startsWith("**Dealer's Hand:**"),
  );
  const playerLine = lines.find(
    (line) =>
      line.includes("'s Hand:**") && !line.startsWith("**Dealer's Hand:**"),
  );

  console.log("Debug - extracted lines", {
    text,
    lines,
    wagerLine,
    dealerLine,
    playerLine,
  });

  if (!wagerLine || !dealerLine || !playerLine) {
    throw new Error("Invalid message format");
  }

  const extractCards = (line: string): Card[] => {
    const cardMatches = line.match(/\[ (.*?) \]/g);
    console.log("Debug - extracted card matches", { cardMatches });
    return cardMatches
      ? cardMatches.map((card) => card.replace(/\[|\]/g, "").trim() as Card)
      : [];
  };

  const dealerCards = extractCards(dealerLine);
  const playerCards = extractCards(playerLine);

  const wager = parseInt(wagerLine.replace("_Wager_: ", "").trim());

  return { dealerCards, playerCards, wager };
};

/**
 * Utility function to generate the content message for the blackjack game
 */
type generateBlackjackMessageParams = {
  dealerHand: Card[];
  playerHand: Card[];
  wager: number;
  showBalance: boolean;
  showDealerHand: boolean;
  additionalMessage?: string;
  interaction: ChatInputCommandInteraction | ButtonInteraction;
};
export const generateBlackjackMessage = async ({
  dealerHand,
  playerHand,
  wager,
  showBalance,
  showDealerHand,
  additionalMessage,
  interaction,
}: generateBlackjackMessageParams) => {
  const userId = interaction.user.id;
  const guildId = interaction.guildId ?? "unknown guild id";
  const interactionUsername = interaction.user.username;

  /**
   * Utility function to print a card hand to discord text
   */
  const printCardHand = (cards: Card[]): string => {
    return cards.map((card) => `\`[ ${card} ]\``).join(" ");
  };

  const userBalance = await getUserBalance(userId, guildId);
  const dealerScore = calculateHandScore(dealerHand);
  const playerScore = calculateHandScore(playerHand);

  const dealerHandText = showDealerHand
    ? printCardHand(dealerHand)
    : printCardHand(dealerHand.slice(0, 1));

  return `### ${interactionUsername}'s Blackjack Game\r\r_Wager_: ${wager}\r\r**Dealer's Hand:**\r${dealerHandText}${
    showDealerHand ? `(${dealerScore})` : " `[ ? ]`"
  }\r\r**${interactionUsername}'s Hand:**\r${printCardHand(
    playerHand,
  )} (${playerScore})${!!additionalMessage ? `\r\r${additionalMessage}` : ""}${
    showBalance ? `\r${interactionUsername} balance: ${userBalance}` : ""
  }`;
};

/**
 * Utility function to calculate the score for a given hand of cards
 */
export const calculateHandScore = (cards: Card[]): number => {
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

/**
 * Utility function to get a random card from the deck
 */
export const getRandomCard = () => {
  const randomIndex = randomNumber(0, cardDeck.length - 1, true);
  const card = cardDeck[randomIndex];
  return card;
};

/**
 * Utility function to check if a hand is a blackjack (an Ace and a 10-value card)
 */
export const checkIfBlackjack = (cards: Card[]): boolean => {
  const handHasAce = cards.includes("A");
  const handHas10 = cards.some((c) => ["10", "J", "Q", "K"].includes(c));

  return handHas10 && handHasAce;
};
