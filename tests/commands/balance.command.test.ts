import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";

// Mock finicoin module
const mockGetUserBalance = mock(() => Promise.resolve(1000));
mock.module("../../modules/finicoin", () => ({
  getUserBalance: mockGetUserBalance,
}));

// Mock pocketbase
const mockGetFullList = mock(() => Promise.resolve([{ today_earnings: 50 }]));
const mockCollection = mock(() => ({
  getFullList: mockGetFullList,
}));

mock.module("../../utilities/pocketbase", () => ({
  pb: {
    collection: mockCollection,
  },
}));

// Import after mocking
const { execute } = await import("../../commands/balance.command");

describe("balance command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockGetUserBalance.mockClear();
    mockGetFullList.mockClear();
    mockCollection.mockClear();

    mockInteraction = {
      options: {
        get: mock(() => ({ value: false })),
      },
      user: {
        id: "user123",
        username: "testuser",
      },
      guildId: "guild123",
      reply: mock(() => Promise.resolve()),
    };
  });

  describe("Basic balance display", () => {
    it("should display user balance without daily earnings", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetUserBalance).toHaveBeenCalledWith("user123", "guild123");
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You currently have 1,000 Finicoin.",
      );
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle zero balance", async () => {
      mockGetUserBalance.mockResolvedValueOnce(0);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You currently have 0 Finicoin.",
      );
    });

    it("should handle null balance", async () => {
      mockGetUserBalance.mockResolvedValueOnce(null);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You currently have 0 Finicoin.",
      );
    });

    it("should format large balances with commas", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1234567);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You currently have 1,234,567 Finicoin.",
      );
    });
  });

  describe("Daily earnings display", () => {
    beforeEach(() => {
      mockInteraction.options.get = mock(() => ({ value: true }));
    });

    it("should display balance with daily earnings", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockGetFullList.mockResolvedValueOnce([{ today_earnings: 50 }]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockCollection).toHaveBeenCalledWith("message_reward_stats");
      expect(mockGetFullList).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You currently have 1,000 Finicoin.\nYou've earned 50 Finicoin today.",
      );
    });

    it("should handle zero daily earnings", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockGetFullList.mockResolvedValueOnce([{ today_earnings: 0 }]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You currently have 1,000 Finicoin.\nYou've earned 0 Finicoin today.",
      );
    });

    it("should handle no daily earnings record", async () => {
      mockGetUserBalance.mockResolvedValueOnce(1000);
      mockGetFullList.mockResolvedValueOnce([]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You currently have 1,000 Finicoin.\nYou've earned undefined Finicoin today.",
      );
    });

    it("should format large daily earnings with commas", async () => {
      mockGetUserBalance.mockResolvedValueOnce(5000000);
      mockGetFullList.mockResolvedValueOnce([{ today_earnings: 12345 }]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "You currently have 5,000,000 Finicoin.\nYou've earned 12,345 Finicoin today.",
      );
    });
  });

  describe("Error handling", () => {
    it("should not throw when getUserBalance fails", async () => {
      mockGetUserBalance.mockRejectedValueOnce(new Error("Database error"));

      await execute(mockInteraction, mockLogCommand);

      // Command should complete despite error
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle missing guildId gracefully", async () => {
      mockInteraction.guildId = null;
      mockGetUserBalance.mockResolvedValueOnce(1000);

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetUserBalance).toHaveBeenCalledWith(
        "user123",
        "unknown server id",
      );
    });
  });
});
