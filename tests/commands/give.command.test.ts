import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";

// Mock finicoin module
const mockAddCoin = mock(() => Promise.resolve());
const mockGetUserBalance = mock(() => Promise.resolve(1000));

mock.module("../../modules/finicoin", () => ({
  addCoin: mockAddCoin,
  getUserBalance: mockGetUserBalance,
}));

// Import after mocking
const { execute } = await import("../../commands/give.command");

describe("give command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;
  let mockRecipient: any;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockAddCoin.mockClear();
    mockGetUserBalance.mockClear();

    mockRecipient = {
      id: "recipient123",
      username: "recipient",
    };

    mockInteraction = {
      options: {
        getUser: mock(() => mockRecipient),
        get: mock((name: string) => {
          if (name === "amount") return { value: 100 };
          return undefined;
        }),
      },
      user: {
        id: "user123",
        username: "giver",
      },
      guildId: "guild123",
      guild: {
        name: "Test Guild",
      },
      reply: mock(() => Promise.resolve()),
    };
  });

  describe("Successful transactions", () => {
    it("should give finicoin when user has sufficient balance", async () => {
      mockGetUserBalance
        .mockResolvedValueOnce(1000) // Initial balance
        .mockResolvedValueOnce(900) // New giver balance
        .mockResolvedValueOnce(600); // Recipient balance

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetUserBalance).toHaveBeenCalledWith("user123", "guild123");
      expect(mockAddCoin).toHaveBeenCalledWith(
        "recipient123",
        "guild123",
        100,
        "giver",
        "Test Guild",
        "user123",
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You've gifted 100 Finicoin to recipient.\nrecipient's balance: 600\nYour balance: 900",
      );
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle large amounts", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 50000 };
        return undefined;
      });

      mockGetUserBalance
        .mockResolvedValueOnce(100000)
        .mockResolvedValueOnce(50000)
        .mockResolvedValueOnce(75000);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalledWith(
        "recipient123",
        "guild123",
        50000,
        "giver",
        "Test Guild",
        "user123",
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You've gifted 50,000 Finicoin to recipient.\nrecipient's balance: 75,000\nYour balance: 50,000",
      );
    });

    it("should give exact balance amount", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 1000 };
        return undefined;
      });

      mockGetUserBalance
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1000);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalledWith(
        "recipient123",
        "guild123",
        1000,
        "giver",
        "Test Guild",
        "user123",
      );
    });
  });

  describe("Insufficient balance", () => {
    it("should reject transaction when user has insufficient balance", async () => {
      mockGetUserBalance.mockResolvedValueOnce(50);
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 100 };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You don't have enough Finicoin to gift 100\nYour current balance: 50",
      );
    });

    it("should reject when trying to give more than zero balance", async () => {
      mockGetUserBalance.mockResolvedValueOnce(0);
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 1 };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You don't have enough Finicoin to gift 1\nYour current balance: 0",
      );
    });
  });

  describe("Input validation", () => {
    it("should handle negative amounts as absolute value", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: -100 };
        return undefined;
      });

      mockGetUserBalance
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(900)
        .mockResolvedValueOnce(600);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalledWith(
        "recipient123",
        "guild123",
        100, // Converted to absolute value
        "giver",
        "Test Guild",
        "user123",
      );
    });

    it("should round decimal amounts", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 123.7 };
        return undefined;
      });

      mockGetUserBalance
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(876)
        .mockResolvedValueOnce(624);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalledWith(
        "recipient123",
        "guild123",
        124, // Rounded
        "giver",
        "Test Guild",
        "user123",
      );
    });

    it("should handle zero amount as zero gift", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 0 };
        return undefined;
      });

      mockGetUserBalance
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(500);

      await execute(mockInteraction, mockLogCommand);

      // Should still call addCoin with 0 amount
      expect(mockAddCoin).toHaveBeenCalledWith(
        "recipient123",
        "guild123",
        0,
        "giver",
        "Test Guild",
        "user123",
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle null user balance", async () => {
      mockGetUserBalance.mockResolvedValueOnce(null);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You don't have enough Finicoin to gift 100\nYour current balance: 0",
      );
    });

    it("should handle undefined user balance", async () => {
      mockGetUserBalance.mockResolvedValueOnce(undefined);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You don't have enough Finicoin to gift 100\nYour current balance: 0",
      );
    });

    it("should handle missing recipient", async () => {
      mockInteraction.options.getUser = mock(() => null);

      mockGetUserBalance
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(900)
        .mockResolvedValueOnce(100);

      await execute(mockInteraction, mockLogCommand);

      // Should still attempt to add coin with unknown user id
      expect(mockAddCoin).toHaveBeenCalledWith(
        "uknown user id",
        "guild123",
        100,
        "giver",
        "Test Guild",
        "user123",
      );
    });

    it("should handle missing guildId", async () => {
      mockInteraction.guildId = null;
      mockInteraction.guild = null;

      mockGetUserBalance
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(900)
        .mockResolvedValueOnce(100);

      await execute(mockInteraction, mockLogCommand);

      expect(mockAddCoin).toHaveBeenCalledWith(
        "recipient123",
        "unknown server id",
        100,
        "giver",
        "unknown server name",
        "user123",
      );
    });
  });

  describe("Error handling", () => {
    it("should handle getUserBalance error gracefully", async () => {
      mockGetUserBalance.mockRejectedValueOnce(new Error("Database error"));

      await execute(mockInteraction, mockLogCommand);

      // Should not throw, but won't complete transaction
      expect(mockAddCoin).not.toHaveBeenCalled();
    });

    it("should handle addCoin error gracefully", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockAddCoin.mockRejectedValueOnce(new Error("Transaction failed"));

      await execute(mockInteraction, mockLogCommand);

      // Should not throw
      expect(mockLogCommand).not.toHaveBeenCalled();
    });
  });

  describe("Display formatting", () => {
    it("should format balances with commas", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 1000 };
        return undefined;
      });

      mockGetUserBalance
        .mockResolvedValueOnce(10000)
        .mockResolvedValueOnce(9000)
        .mockResolvedValueOnce(6000);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You've gifted 1,000 Finicoin to recipient.\nrecipient's balance: 6,000\nYour balance: 9,000",
      );
    });

    it("should display recipient username correctly", async () => {
      mockRecipient.username = "SuperUser2000";

      mockGetUserBalance
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(900)
        .mockResolvedValueOnce(600);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("SuperUser2000");
    });
  });
});
