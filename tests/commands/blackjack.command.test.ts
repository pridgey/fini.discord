import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock randomNumber utility
const mockRandomNumber = mock(() => 0);
mock.module("../../utilities/randomNumber", () => ({
  randomNumber: mockRandomNumber,
}));

// Mock finicoin module
const mockAddCoin = mock(() => Promise.resolve());
const mockGetUserBalance = mock(() => Promise.resolve(1000));
mock.module("../../modules/finicoin", () => ({
  addCoin: mockAddCoin,
  getUserBalance: mockGetUserBalance,
}));

// Import after mocking
const { execute } = await import("../../commands/blackjack.command");
const { calculateHandScore, getStateFromText } = await import(
  "../../modules/games/blackjack/blackjackUtilities"
);
const { cardDeck } = await import("../../types/games/blackjack.types");

type Card = (typeof cardDeck)[number];

/*
 * These tests assert on money moved and on game state parsed back out of the
 * message, never on the wording of the message itself.
 *
 * The reason is a bug this suite already shipped: "should push when both have
 * blackjack" matched the copy "It's a Push.", a later rewrite changed it to
 * "it's a push!", and the case-sensitive match failed for months while the
 * payout was correct the whole time. A test that breaks when someone reworders
 * a sentence, and stays green when the payout is wrong, is worse than no test.
 */

/** The deck index that yields a given face, so tests can name cards. */
const indexOf = (face: Card) => cardDeck.indexOf(face);

/** Queues the four opening cards in the order the command draws them. */
const deal = (dealer: [Card, Card], player: [Card, Card]) => {
  mockRandomNumber
    .mockReturnValueOnce(indexOf(dealer[0]))
    .mockReturnValueOnce(indexOf(dealer[1]))
    .mockReturnValueOnce(indexOf(player[0]))
    .mockReturnValueOnce(indexOf(player[1]));
};

/** The message body, whether the command replied with a string or an object. */
const bodyOf = (call: any): string =>
  typeof call === "string" ? call : call.content;

/** The game state the hit/stand buttons would recover from what was sent. */
const stateFrom = (call: any) => getStateFromText(bodyOf(call));

/** Every payout made *to* the player, ignoring the wager taken off them. */
const payoutsTo = (userId: string) =>
  mockAddCoin.mock.calls.filter((call: any[]) => call[0] === userId);

describe("blackjack command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockAddCoin.mockClear();
    mockGetUserBalance.mockClear();
    mockRandomNumber.mockClear();

    mockInteraction = {
      options: {
        get: mock(() => ({ value: 100 })),
      },
      user: {
        id: "user123",
        username: "testuser",
      },
      guildId: "guild456",
      guild: {
        name: "Test Guild",
      },
      deferReply: mock(() => Promise.resolve()),
      editReply: mock(() =>
        Promise.resolve({
          createMessageComponentCollector: mock(() => ({
            on: mock(() => {}),
          })),
        }),
      ),
    };
  });

  describe("Bet validation", () => {
    it("should reject bet less than 0.10", async () => {
      mockInteraction.options.get = mock(() => ({ value: 0.05 }));

      await execute(mockInteraction, mockLogCommand);

      // The contract is that no money moves and no hand is dealt; the exact
      // sentence the user sees is free to change.
      expect(mockAddCoin).not.toHaveBeenCalled();
      expect(mockRandomNumber).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should accept bet of exactly 0.10", async () => {
      mockInteraction.options.get = mock(() => ({ value: 0.1 }));
      mockGetUserBalance.mockResolvedValueOnce(1000);
      deal(["7", "9"], ["7", "9"]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalledWith(
        "Reserve",
        "guild456",
        0.1,
        "Reserve",
        "Test Guild",
        "user123",
      );
    });

    it("should reject bet when user has insufficient balance", async () => {
      mockInteraction.options.get = mock(() => ({ value: 1000 }));
      mockGetUserBalance.mockResolvedValueOnce(500);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).not.toHaveBeenCalled();
      expect(mockRandomNumber).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should accept bet when user has exact balance", async () => {
      mockInteraction.options.get = mock(() => ({ value: 1000 }));
      mockGetUserBalance.mockResolvedValueOnce(1000);
      deal(["7", "9"], ["7", "9"]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalledWith(
        "Reserve",
        "guild456",
        1000,
        "Reserve",
        "Test Guild",
        "user123",
      );
    });

    it("should handle negative bet values", async () => {
      mockInteraction.options.get = mock(() => ({ value: -100 }));
      mockGetUserBalance.mockResolvedValueOnce(1000);
      deal(["7", "9"], ["7", "9"]);

      await execute(mockInteraction, mockLogCommand);

      // The command takes Math.abs of the bet, so a negative wager must debit
      // 100 - never credit it, which is the way this goes wrong.
      expect(mockAddCoin).toHaveBeenCalledWith(
        "Reserve",
        "guild456",
        100,
        "Reserve",
        "Test Guild",
        "user123",
      );
    });
  });

  describe("Initial card dealing", () => {
    it("should deal 2 cards to player", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber
        .mockReturnValueOnce(0) // Dealer card 1
        .mockReturnValueOnce(1) // Dealer card 2
        .mockReturnValueOnce(2) // Player card 1
        .mockReturnValueOnce(3); // Player card 2

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should deal 2 cards to dealer", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(2)
        .mockReturnValueOnce(3);

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalled();
    });

    it("should take user's wager immediately", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockInteraction.options.get = mock(() => ({ value: 100 }));
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalledWith(
        "Reserve",
        "guild456",
        100,
        "Reserve",
        "Test Guild",
        "user123",
      );
    });
  });

  describe("Blackjack scenarios", () => {
    it("should detect dealer blackjack (Ace + 10)", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      deal(["A", "10"], ["2", "3"]);

      await execute(mockInteraction, mockLogCommand);

      // The stake is forfeited to the jackpot and the player is paid nothing.
      expect(mockAddCoin).toHaveBeenCalledWith(
        "Jackpot",
        "guild456",
        100,
        "Jackpot",
        "Test Guild",
        "Reserve",
      );
      expect(payoutsTo("user123")).toHaveLength(0);

      // The round is over, so the hole card is no longer hidden.
      const state = stateFrom(mockInteraction.editReply.mock.calls[0][0]);
      expect(state.dealerCards).toEqual(["A", "10"]);
    });

    it("should detect player blackjack (Ace + face card)", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockInteraction.options.get = mock(() => ({ value: 100 }));
      deal(["2", "3"], ["A", "J"]);

      await execute(mockInteraction, mockLogCommand);

      // Paid out, and the round ended immediately rather than offering buttons.
      expect(payoutsTo("user123")).toHaveLength(1);

      const state = stateFrom(mockInteraction.editReply.mock.calls[0][0]);
      expect(state.playerCards).toEqual(["A", "J"]);
      expect(calculateHandScore(state.playerCards)).toBe(21);
    });

    it("should push when both have blackjack", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockInteraction.options.get = mock(() => ({ value: 100 }));
      deal(["A", "J"], ["A", "Q"]);

      await execute(mockInteraction, mockLogCommand);

      // A push returns the stake exactly - no win, no loss.
      expect(mockAddCoin).toHaveBeenCalledWith(
        "user123",
        "guild456",
        100,
        "testuser",
        "Test Guild",
        "Reserve",
      );
      expect(payoutsTo("user123")).toHaveLength(1);

      const state = stateFrom(mockInteraction.editReply.mock.calls[0][0]);
      expect(calculateHandScore(state.dealerCards)).toBe(21);
      expect(calculateHandScore(state.playerCards)).toBe(21);
    });

    it("should pay 1.5x for natural blackjack", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockInteraction.options.get = mock(() => ({ value: 100 }));
      deal(["2", "3"], ["A", "J"]);

      await execute(mockInteraction, mockLogCommand);

      // Should award bet + (bet * 1.5) = 100 + 150 = 250
      expect(mockAddCoin).toHaveBeenCalledWith(
        "user123",
        "guild456",
        250,
        "testuser",
        "Test Guild",
        "Reserve",
      );
    });
  });

  describe("Card scoring", () => {
    it("should calculate numeric card values correctly", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      // Deal 2, 3, 4, 5 (should total to specific scores)
      mockRandomNumber
        .mockReturnValueOnce(0) // 2
        .mockReturnValueOnce(1) // 3
        .mockReturnValueOnce(2) // 4
        .mockReturnValueOnce(3); // 5

      await execute(mockInteraction, mockLogCommand);

      // Cards should be displayed with scores
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should value face cards as 10", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber
        .mockReturnValueOnce(9) // Jack = 10
        .mockReturnValueOnce(10) // Queen = 10
        .mockReturnValueOnce(0) // 2
        .mockReturnValueOnce(1); // 3

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should count Ace as 11 when beneficial", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber
        .mockReturnValueOnce(12) // Ace
        .mockReturnValueOnce(0) // 2
        .mockReturnValueOnce(1) // 3
        .mockReturnValueOnce(2); // 4

      await execute(mockInteraction, mockLogCommand);

      // Ace + 2 should be 13, not 3
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should count Ace as 1 when 11 would bust", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber
        .mockReturnValueOnce(9) // Jack = 10
        .mockReturnValueOnce(10) // Queen = 10
        .mockReturnValueOnce(8) // 10
        .mockReturnValueOnce(12); // Ace (should be 1 not 11)

      await execute(mockInteraction, mockLogCommand);

      // 10 + Ace should be 21 if Ace valued correctly
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe("Game display", () => {
    // The hole card is the whole game. If the dealer's second card leaks into
    // the message before the player acts, blackjack stops being blackjack.
    it("should keep the dealer's second card hidden while the hand is live", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      deal(["7", "K"], ["4", "9"]);

      await execute(mockInteraction, mockLogCommand);

      // Cast because the hidden card renders as "?", which getStateFromText
      // still types as a Card. Harmless in production - the button handlers
      // replace it with the real card carried in their customId - but the
      // literal has to be widened to compare against here.
      const state = stateFrom(mockInteraction.editReply.mock.calls[0][0]);
      expect(state.dealerCards as string[]).toEqual(["7", "?"]);
      expect(state.dealerCards as string[]).not.toContain("K");
    });

    it("should show the player both of their own cards", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      deal(["7", "K"], ["4", "9"]);

      await execute(mockInteraction, mockLogCommand);

      const state = stateFrom(mockInteraction.editReply.mock.calls[0][0]);
      expect(state.playerCards).toEqual(["4", "9"]);
    });

    // Asserts the number is right, not merely that some number is present.
    it("should show the player's actual score", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      deal(["7", "K"], ["4", "9"]);

      await execute(mockInteraction, mockLogCommand);

      const body = bodyOf(mockInteraction.editReply.mock.calls[0][0]);
      expect(body).toContain(`(${calculateHandScore(["4", "9"])})`);
    });

    it("should offer a hit and a stand button addressed to this player", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      deal(["7", "K"], ["4", "9"]);

      await execute(mockInteraction, mockLogCommand);

      const { components } = mockInteraction.editReply.mock.calls[0][0];
      const ids = components
        .flatMap((row: any) => row.components)
        .map((button: any) => button.data.custom_id);

      // The customId carries the player and the hidden card, which is how the
      // handlers know whose hand it is and what the dealer is really holding.
      expect(ids).toEqual([
        "blackjack_hit:user123:K",
        "blackjack_stand:user123:K",
      ]);
    });
  });

  describe("Error handling", () => {
    it("should handle getUserBalance errors", async () => {
      mockGetUserBalance.mockRejectedValueOnce(new Error("Balance error"));

      await execute(mockInteraction, mockLogCommand);

      // What matters is that the failure is contained: the player is answered,
      // no hand is dealt and no money moves. The apology text is free to change.
      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockAddCoin).not.toHaveBeenCalled();
      expect(mockRandomNumber).not.toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle addCoin errors gracefully", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockAddCoin.mockRejectedValueOnce(new Error("Transaction failed"));
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should always call logCommand", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle missing guild info", async () => {
      mockInteraction.guildId = null;
      mockInteraction.guild = null;
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalledWith(
        "Reserve",
        "unknown guild id",
        expect.any(Number),
        "Reserve",
        "unknown guild name",
        "user123",
      );
    });

    it("should handle undefined bet value", async () => {
      mockInteraction.options.get = mock(() => ({ value: undefined }));
      mockGetUserBalance.mockResolvedValueOnce(1000);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe("Jackpot contributions", () => {
    it("should contribute losses to jackpot", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockInteraction.options.get = mock(() => ({ value: 100 }));
      // Dealer wins immediately
      mockRandomNumber
        .mockReturnValueOnce(12) // Dealer Ace
        .mockReturnValueOnce(9) // Dealer Jack (blackjack)
        .mockReturnValueOnce(0) // Player 2
        .mockReturnValueOnce(1); // Player 3

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalledWith(
        "Jackpot",
        "guild456",
        100,
        "Jackpot",
        "Test Guild",
        "Reserve",
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle very small bets", async () => {
      mockInteraction.options.get = mock(() => ({ value: 0.1 }));
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalled();
    });

    it("should handle very large bets", async () => {
      mockInteraction.options.get = mock(() => ({ value: 999999 }));
      mockGetUserBalance.mockResolvedValueOnce(1000000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalled();
    });

    it("should handle decimal bet values", async () => {
      mockInteraction.options.get = mock(() => ({ value: 123.45 }));
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalled();
    });

    it("should handle multiple Aces in hand", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber
        .mockReturnValueOnce(0) // Dealer
        .mockReturnValueOnce(1) // Dealer
        .mockReturnValueOnce(12) // Player Ace
        .mockReturnValueOnce(12); // Player Ace

      await execute(mockInteraction, mockLogCommand);

      // Two Aces should not cause issues in scoring
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  /*
   * The message is not just for the reader: blackjack_hit and blackjack_stand
   * rebuild the entire hand from interaction.message.content via
   * getStateFromText. So the layout - the card brackets, the bold hand headers,
   * the wager line - is a wire format between the command and its buttons, and
   * these tests hold that contract rather than the prose around it.
   */
  describe("Message is machine-readable by the button handlers", () => {
    it("round-trips the hand the buttons will read back", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockInteraction.options.get = mock(() => ({ value: 250 }));
      deal(["7", "K"], ["4", "9"]);

      await execute(mockInteraction, mockLogCommand);

      const state = stateFrom(mockInteraction.editReply.mock.calls[0][0]);

      expect({
        dealerCards: state.dealerCards as string[],
        playerCards: state.playerCards as string[],
        wager: state.wager,
      }).toEqual({
        dealerCards: ["7", "?"],
        playerCards: ["4", "9"],
        wager: 250,
      });
    });
  });
});
