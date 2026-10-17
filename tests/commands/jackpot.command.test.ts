import { describe, it, expect, mock, beforeEach } from "bun:test";
import PocketBase from "pocketbase";
import { typedOptionGetters } from "../mocks/typedOptionGetters";

// Mock pocketbase
const mockGetFirstListItem = mock((_query?: string) =>
  Promise.resolve({ balance: 10000 } as any),
);
const mockCollection = mock(() => ({
  getFirstListItem: mockGetFirstListItem,
}));

mock.module("../../utilities/pocketbase", () => ({
  pb: {
    filter: PocketBase.prototype.filter,
    collection: mockCollection,
  },
}));

// Mock the history query + pagination plumbing
const mockHistoryQuery = mock((_params?: any) =>
  Promise.resolve({
    items: [] as any[],
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    perPage: 20,
  }),
);
const mockBuildResults = mock((_params?: any) =>
  Promise.resolve({ components: [{ container: true }], useComponentsV2: true }),
);
const mockQueryHandler = mock((_id?: string) => ({
  id: "jackpot_history",
  query: mockHistoryQuery,
  buildResults: mockBuildResults,
}));

mock.module("../../queries/QueryHandler", () => ({
  QueryHandler: mockQueryHandler,
}));

const mockCreatePaginationContext = mock(() => Promise.resolve("ctx123"));
const mockCreatePaginationRow = mock(() => ({ pageRow: true }));

mock.module("../../utilities/pagination/pagination", () => ({
  createPaginationContext: mockCreatePaginationContext,
  createPaginationRow: mockCreatePaginationRow,
}));

/** Builds `count` stand-in winner rows for the history query mock. */
const winners = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    server_id: "guild123",
    user_id: `user${i}`,
    username: `winner${i}`,
    amount: 100 * (i + 1),
    won_at: "2026-01-01T00:00:00.000Z",
    identifier: `winner${i}-guild`,
    rank: i + 1,
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
    mockHistoryQuery.mockClear();
    mockBuildResults.mockClear();
    mockQueryHandler.mockClear();
    mockCreatePaginationContext.mockClear();
    mockCreatePaginationRow.mockClear();

    mockInteraction = {
      guildId: "guild123",
      user: { id: "user123" },
      // The command reads the `history` option first; absent means the plain
      // balance reply, which is what most of these cases exercise.
      options: { ...typedOptionGetters, get: mock(() => undefined) },
      reply: mock(() => Promise.resolve()),
      deferReply: mock(() => Promise.resolve()),
      editReply: mock(() => Promise.resolve()),
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
        'user_id = "Jackpot" && server_id = null',
      );
    });

    it("should handle undefined guildId", async () => {
      mockInteraction.guildId = undefined;
      mockGetFirstListItem.mockResolvedValueOnce({ balance: 5000 });

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalledWith(
        'user_id = "Jackpot" && server_id = null',
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
      expect(execute(mockInteraction, mockLogCommand)).resolves.toBeUndefined();
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
  describe("History option", () => {
    /** Points the interaction's option lookup at `history: true`. */
    const withHistory = () => {
      mockInteraction.options.get = mock((name: string) =>
        name === "history" ? { value: true } : undefined,
      );
    };

    it("should not touch the bank when showing history", async () => {
      withHistory();
      mockHistoryQuery.mockResolvedValueOnce({
        items: winners(3),
        totalItems: 3,
        totalPages: 1,
        currentPage: 1,
        perPage: 20,
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCollection).not.toHaveBeenCalled();
      expect(mockQueryHandler).toHaveBeenCalledWith("jackpot_history");
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should scope history to the current server and page by 20", async () => {
      withHistory();
      mockHistoryQuery.mockResolvedValueOnce({
        items: winners(3),
        totalItems: 3,
        totalPages: 1,
        currentPage: 1,
        perPage: 20,
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockHistoryQuery).toHaveBeenCalledWith({
        page: 1,
        perPage: 20,
        filterOption: 'server_id = "guild123"',
      });
    });

    it("should report when nobody has won yet", async () => {
      withHistory();
      mockHistoryQuery.mockResolvedValueOnce({
        items: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        perPage: 20,
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: "Nobody has won the jackpot here yet.",
      });
      expect(mockCreatePaginationContext).not.toHaveBeenCalled();
    });

    it("should omit pagination when the history fits on one page", async () => {
      withHistory();
      mockHistoryQuery.mockResolvedValueOnce({
        items: winners(20),
        totalItems: 20,
        totalPages: 1,
        currentPage: 1,
        perPage: 20,
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCreatePaginationContext).not.toHaveBeenCalled();
      expect(mockCreatePaginationRow).not.toHaveBeenCalled();

      const payload = mockInteraction.editReply.mock.calls[0][0];
      expect(payload.components).toHaveLength(1);
    });

    it("should add pagination once the history outgrows a page", async () => {
      withHistory();
      mockHistoryQuery.mockResolvedValueOnce({
        items: winners(20),
        totalItems: 49,
        totalPages: 3,
        currentPage: 1,
        perPage: 20,
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCreatePaginationContext).toHaveBeenCalledWith({
        userId: "user123",
        queryId: "jackpot_history",
        filter: 'server_id = "guild123"',
        perPage: 20,
      });
      expect(mockCreatePaginationRow).toHaveBeenCalledWith({
        userId: "user123",
        currentPage: 1,
        totalPages: 3,
        contextId: "ctx123",
      });

      const payload = mockInteraction.editReply.mock.calls[0][0];
      expect(payload.components).toHaveLength(2);
    });

    it("should defer before querying, since history can be slow", async () => {
      withHistory();
      mockHistoryQuery.mockResolvedValueOnce({
        items: winners(1),
        totalItems: 1,
        totalPages: 1,
        currentPage: 1,
        perPage: 20,
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it("should still log the command when the history query fails", async () => {
      withHistory();
      mockHistoryQuery.mockRejectedValueOnce(new Error("query blew up"));

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should answer the deferral when the history query fails", async () => {
      withHistory();
      mockInteraction.deferred = true;
      mockInteraction.replied = false;
      mockHistoryQuery.mockRejectedValueOnce(new Error("query blew up"));

      await execute(mockInteraction, mockLogCommand);

      // Otherwise the user sits on a "thinking..." spinner indefinitely.
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: "Something went wrong pulling the jackpot history.",
      });
    });
  });
});
