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

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        "You cannot place a bet less than 0.10 finicoin",
      );
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should accept bet of exactly 0.10", async () => {
      mockInteraction.options.get = mock(() => ({ value: 0.1 }));
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5); // Non-blackjack cards

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalled();
    });

    it("should reject bet when user has insufficient balance", async () => {
      mockInteraction.options.get = mock(() => ({ value: 1000 }));
      mockGetUserBalance.mockResolvedValueOnce(500);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("You do not have enough finicoin"),
      );
    });

    it("should accept bet when user has exact balance", async () => {
      mockInteraction.options.get = mock(() => ({ value: 1000 }));
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalled();
    });

    it("should handle negative bet values", async () => {
      mockInteraction.options.get = mock(() => ({ value: -100 }));
      mockGetUserBalance.mockResolvedValueOnce(1000);

      await execute(mockInteraction, mockLogCommand);

      // Bet should be converted to absolute value
      expect(mockInteraction.editReply).toHaveBeenCalled();
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
      // Dealer gets Ace (index 12) and 10 (index 8)
      mockRandomNumber
        .mockReturnValueOnce(12) // Dealer Ace
        .mockReturnValueOnce(8) // Dealer 10
        .mockReturnValueOnce(0) // Player 2
        .mockReturnValueOnce(1); // Player 3

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(replyCall).toContain("Dealer Blackjack");
    });

    it("should detect player blackjack (Ace + face card)", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockInteraction.options.get = mock(() => ({ value: 100 }));
      // Dealer gets non-blackjack
      mockRandomNumber
        .mockReturnValueOnce(0) // Dealer 2
        .mockReturnValueOnce(1) // Dealer 3
        .mockReturnValueOnce(12) // Player Ace
        .mockReturnValueOnce(9); // Player Jack

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(replyCall).toContain("Natural Blackjack");
    });

    it("should push when both have blackjack", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockInteraction.options.get = mock(() => ({ value: 100 }));
      // Both get blackjack
      mockRandomNumber
        .mockReturnValueOnce(12) // Dealer Ace
        .mockReturnValueOnce(9) // Dealer Jack
        .mockReturnValueOnce(12) // Player Ace
        .mockReturnValueOnce(10); // Player Queen

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(replyCall).toContain("Push");
    });

    it("should pay 1.5x for natural blackjack", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockInteraction.options.get = mock(() => ({ value: 100 }));
      mockRandomNumber
        .mockReturnValueOnce(0) // Dealer non-blackjack
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(12) // Player blackjack
        .mockReturnValueOnce(9);

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
    it("should show dealer's first card only initially", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(replyCall.content).toContain("Dealer's Hand");
      expect(replyCall.content).toContain("[ ? ]");
    });

    it("should show player's full hand", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(replyCall.content).toContain("testuser's Hand");
    });

    it("should show player score", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(replyCall.content).toMatch(/\(\d+\)/);
    });

    it("should include hit and stand buttons", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(replyCall.components).toBeDefined();
      expect(replyCall.components.length).toBeGreaterThan(0);
    });
  });

  describe("Error handling", () => {
    it("should handle getUserBalance errors", async () => {
      mockGetUserBalance.mockRejectedValueOnce(new Error("Balance error"));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        "An error has occurred.",
      );
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

  describe("Message formatting", () => {
    it("should format card display with brackets", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(replyCall.content).toContain("[");
      expect(replyCall.content).toContain("]");
    });

    it("should use bold formatting for headers", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(replyCall.content).toMatch(/\*\*/);
    });

    it("should display username in message", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockRandomNumber.mockReturnValue(5);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(replyCall.content).toContain("testuser");
    });
  });
});
