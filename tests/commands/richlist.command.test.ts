import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock pocketbase
const mockGetFullList = mock((_options?: any) => Promise.resolve([] as any[]));
const mockCollection = mock(() => ({
  getFullList: mockGetFullList,
}));

mock.module("../../utilities/pocketbase", () => ({
  pb: {
    collection: mockCollection,
  },
}));

// Import after mocking
const { execute } = await import("../../commands/richlist.command");

describe("richlist command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockGetFullList.mockClear();
    mockCollection.mockClear();

    mockFetch = mock((userId: string) => {
      const userMap = {
        user1: { username: "Alice" },
        user2: { username: "Bob" },
        user3: { username: "Charlie" },
        user4: { username: "Diana" },
        user5: { username: "Eve" },
      };
      return Promise.resolve(userMap[userId] || { username: "Unknown" });
    });

    mockInteraction = {
      guildId: "guild123",
      client: {
        users: {
          fetch: mockFetch,
        },
      },
      reply: mock(() => Promise.resolve()),
    };
  });

  describe("Basic richlist display", () => {
    it("should display richlist with users sorted by balance", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 1000 },
        { user_id: "user2", balance: 500 },
        { user_id: "user3", balance: 250 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockCollection).toHaveBeenCalledWith("bank");
      expect(mockGetFullList).toHaveBeenCalledWith({
        filter: 'server_id = "guild123"',
        sort: "-balance",
      });

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "**The Bourgeoisie**\r\n1. Alice: 1,000\r\n2. Bob: 500\r\n3. Charlie: 250",
      );
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle empty richlist", async () => {
      mockGetFullList.mockResolvedValueOnce([]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "**The Bourgeoisie**\r\n",
      );
    });

    it("should handle single user", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 5000 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "**The Bourgeoisie**\r\n1. Alice: 5,000",
      );
    });
  });

  describe("Filtering special accounts", () => {
    it("should exclude Jackpot account", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 1000 },
        { user_id: "Jackpot", balance: 50000 },
        { user_id: "user2", balance: 500 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).not.toContain("Jackpot");
      expect(replyCall).toContain("Alice");
      expect(replyCall).toContain("Bob");
    });

    it("should exclude Reserve account", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 1000 },
        { user_id: "Reserve", balance: 100000 },
        { user_id: "user2", balance: 500 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).not.toContain("Reserve");
      expect(replyCall).toContain("Alice");
      expect(replyCall).toContain("Bob");
    });

    it("should exclude both Jackpot and Reserve", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "Jackpot", balance: 50000 },
        { user_id: "user1", balance: 1000 },
        { user_id: "Reserve", balance: 100000 },
        { user_id: "user2", balance: 500 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).not.toContain("Jackpot");
      expect(replyCall).not.toContain("Reserve");
      expect(replyCall).toContain("Alice");
      expect(replyCall).toContain("Bob");
    });
  });

  describe("Balance formatting", () => {
    it("should format large balances with commas", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 1234567 },
        { user_id: "user2", balance: 987654 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "**The Bourgeoisie**\r\n1. Alice: 1,234,567\r\n2. Bob: 987,654",
      );
    });

    it("should handle zero balances", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 1000 },
        { user_id: "user2", balance: 0 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "**The Bourgeoisie**\r\n1. Alice: 1,000\r\n2. Bob: 0",
      );
    });

    it("should display proper ranking numbers", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 5000 },
        { user_id: "user2", balance: 4000 },
        { user_id: "user3", balance: 3000 },
        { user_id: "user4", balance: 2000 },
        { user_id: "user5", balance: 1000 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("1. Alice");
      expect(replyCall).toContain("2. Bob");
      expect(replyCall).toContain("3. Charlie");
      expect(replyCall).toContain("4. Diana");
      expect(replyCall).toContain("5. Eve");
    });
  });

  describe("User fetching", () => {
    it("should fetch user information for each balance record", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 1000 },
        { user_id: "user2", balance: 500 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockFetch).toHaveBeenCalledWith("user1");
      expect(mockFetch).toHaveBeenCalledWith("user2");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should handle user fetch errors gracefully", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 1000 },
        { user_id: "invalid", balance: 500 },
      ]);

      mockFetch = mock((userId: string) => {
        if (userId === "user1") {
          return Promise.resolve({ username: "Alice" });
        }
        return Promise.reject(new Error("User not found"));
      });

      mockInteraction.client.users.fetch = mockFetch;

      // Should not throw
      expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();
    });
  });

  describe("Sorting verification", () => {
    it("should request results sorted by balance descending", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 5000 },
        { user_id: "user2", balance: 3000 },
        { user_id: "user3", balance: 1000 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFullList).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: "-balance",
        }),
      );
    });

    it("should maintain sort order in display", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user3", balance: 10000 },
        { user_id: "user1", balance: 5000 },
        { user_id: "user2", balance: 2000 },
      ]);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      const charlieIndex = replyCall.indexOf("Charlie");
      const aliceIndex = replyCall.indexOf("Alice");
      const bobIndex = replyCall.indexOf("Bob");

      expect(charlieIndex).toBeLessThan(aliceIndex);
      expect(aliceIndex).toBeLessThan(bobIndex);
    });
  });

  describe("Guild filtering", () => {
    it("should filter by correct guild ID", async () => {
      mockInteraction.guildId = "specific-guild-456";
      mockGetFullList.mockResolvedValueOnce([]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFullList).toHaveBeenCalledWith({
        filter: 'server_id = "specific-guild-456"',
        sort: "-balance",
      });
    });

    it("should handle null guildId", async () => {
      mockInteraction.guildId = null;
      mockGetFullList.mockResolvedValueOnce([]);

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFullList).toHaveBeenCalledWith({
        filter: 'server_id = "null"',
        sort: "-balance",
      });
    });
  });

  describe("Error handling", () => {
    it("should handle database errors", async () => {
      mockGetFullList.mockRejectedValueOnce(
        new Error("Database connection failed"),
      );

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
      // Should not throw
    });

    it("should handle reply errors", async () => {
      mockGetFullList.mockResolvedValueOnce([
        { user_id: "user1", balance: 1000 },
      ]);
      mockInteraction.reply = mock(() =>
        Promise.reject(new Error("Reply failed")),
      );

      // Should not throw
      expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();
    });

    it("should call logCommand even on error", async () => {
      mockGetFullList.mockRejectedValueOnce(new Error("Test error"));

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
    });
  });
});
