import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock pocketbase
const mockGetFirstListItem = mock((_query?: string) => Promise.resolve({ balance: 10000 } as any));
const mockCollection = mock(() => ({
  getFirstListItem: mockGetFirstListItem,
}));

mock.module("../../utilities/pocketbase", () => ({
  pb: {
    collection: mockCollection,
  },
}));

// Import after mocking
const { execute } = await import("../../commands/jackpot.command");

describe("jackpot command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockGetFirstListItem.mockClear();
    mockCollection.mockClear();

    mockInteraction = {
      guildId: "guild123",
      reply: mock(() => Promise.resolve()),
    };
  });

  describe("Display jackpot balance", () => {
    it("should display jackpot balance with proper formatting", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 10000 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCollection).toHaveBeenCalledWith("bank");
      expect(mockGetFirstListItem).toHaveBeenCalledWith(
        'user_id = "Jackpot" && server_id = "guild123"',
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The jackpot is currently at 10,000 Finicoin.",
      );
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should format large jackpot amounts with commas", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 1234567 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The jackpot is currently at 1,234,567 Finicoin.",
      );
    });

    it("should display zero jackpot", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 0 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The jackpot is currently at 0 Finicoin.",
      );
    });

    it("should handle small jackpot values", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 42 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The jackpot is currently at 42 Finicoin.",
      );
    });
  });

  describe("No jackpot record", () => {
    it("should display zero when jackpot record does not exist", async () => {
      mockGetFirstListItem.mockResolvedValueOnce(null);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The Jackpot is at 0 Finicoin.",
      );
    });

    it("should display zero when jackpot record is undefined", async () => {
      mockGetFirstListItem.mockResolvedValueOnce(undefined);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The Jackpot is at 0 Finicoin.",
      );
    });

    it("should display zero when jackpot record is empty object", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({});

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The Jackpot is at 0 Finicoin.",
      );
    });

    it("should handle null balance in record", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: null });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The Jackpot is at 0 Finicoin.",
      );
    });
  });

  describe("Guild filtering", () => {
    it("should query jackpot for specific guild", async () => {
      mockInteraction.guildId = "specific-guild-789";
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 5000 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalledWith(
        'user_id = "Jackpot" && server_id = "specific-guild-789"',
      );
    });

    it("should handle null guildId", async () => {
      mockInteraction.guildId = null;
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 5000 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalledWith(
        'user_id = "Jackpot" && server_id = "null"',
      );
    });

    it("should handle undefined guildId", async () => {
      mockInteraction.guildId = undefined;
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 5000 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalledWith(
        'user_id = "Jackpot" && server_id = "undefined"',
      );
    });
  });

  describe("Error handling", () => {
    it("should handle database errors gracefully", async () => {
      mockGetFirstListItem.mockRejectedValueOnce(new Error("Database error"));

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
      // Should not throw
    });

    it("should handle reply errors", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 10000 });
      mockInteraction.reply = mock(() =>
        Promise.reject(new Error("Reply failed")),
      );

      // Should not throw
      expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();
    });

    it("should call logCommand even on error", async () => {
      mockGetFirstListItem.mockRejectedValueOnce(new Error("Test error"));

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle network timeout", async () => {
      mockGetFirstListItem.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 100),
          ),
      );

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
    });
  });

  describe("Data validation", () => {
    it("should handle negative balance (data corruption)", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: -1000 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The jackpot is currently at -1,000 Finicoin.",
      );
    });

    it("should handle decimal balance values", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 1234.56 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The jackpot is currently at 1,234.56 Finicoin.",
      );
    });

    it("should handle very large jackpot values", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 999999999 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "The jackpot is currently at 999,999,999 Finicoin.",
      );
    });
  });

  describe("Consistent behavior", () => {
    it("should always call logCommand", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 5000 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalledTimes(1);
    });

    it("should use consistent query format", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 5000 });

      await execute(mockInteraction, mockLogCommand);

      const callArgs = mockGetFirstListItem.mock.calls[0][0];
      expect(callArgs).toContain('user_id = "Jackpot"');
      expect(callArgs).toContain("&&");
      expect(callArgs).toContain("server_id");
    });

    it("should always query bank collection", async () => {
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 5000 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCollection).toHaveBeenCalledWith("bank");
      expect(mockCollection).toHaveBeenCalledTimes(1);
    });
  });
});
