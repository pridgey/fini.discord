import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock pocketbase - needs to be done before importing command
let mockGetFirstListItem = mock(() => Promise.resolve(null as any));
let mockPb = {
  collection: mock(() => ({
    getFirstListItem: mockGetFirstListItem,
  })),
};

mock.module("../../utilities/pocketbase", () => ({
  pb: mockPb,
}));

// Import after mocking
const { execute } = await import("../../commands/blame.command");

describe("blame command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockGetFirstListItem.mockClear();
    mockPb.collection.mockClear();

    mockInteraction = {
      options: {
        get: mock(() => ({ value: "test item" })),
      },
      guildId: "guild123",
      reply: mock(() => Promise.resolve()),
    };
  });

  describe("Item found in hammerspace", () => {
    it("should display item details when found", async () => {
      const mockItem = {
        item: "rubber chicken",
        created_by_user_id: "testuser",
        created: "2024-01-15T10:30:00Z",
        times_used: 42,
      };
      mockGetFirstListItem.mockResolvedValueOnce(mockItem);
      mockInteraction.options.get = mock(() => ({ value: "rubber chicken" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockPb.collection).toHaveBeenCalledWith("hammerspace");
      expect(mockGetFirstListItem).toHaveBeenCalledWith(
        'item = "rubber chicken" && (server_id = "All" || server_id = "guild123")',
      );
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("rubber chicken");
      expect(replyCall).toContain("testuser");
      expect(replyCall).toContain("42");
      expect(replyCall).toContain("times");
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should display singular 'time' for one use", async () => {
      const mockItem = {
        item: "test item",
        created_by_user_id: "user123",
        created: "2024-01-15T10:30:00Z",
        times_used: 1,
      };
      mockGetFirstListItem.mockResolvedValueOnce(mockItem);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("1");
      expect(replyCall).toContain("time.");
    });

    it("should display plural 'times' for multiple uses", async () => {
      const mockItem = {
        item: "test item",
        created_by_user_id: "user123",
        created: "2024-01-15T10:30:00Z",
        times_used: 5,
      };
      mockGetFirstListItem.mockResolvedValueOnce(mockItem);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("5");
      expect(replyCall).toContain("times.");
    });

    it("should handle zero times used", async () => {
      const mockItem = {
        item: "test item",
        created_by_user_id: "user123",
        created: "2024-01-15T10:30:00Z",
        times_used: 0,
      };
      mockGetFirstListItem.mockResolvedValueOnce(mockItem);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("0");
      expect(replyCall).toContain("times.");
    });

    it("should handle null times_used", async () => {
      const mockItem = {
        item: "test item",
        created_by_user_id: "user123",
        created: "2024-01-15T10:30:00Z",
        times_used: null,
      };
      mockGetFirstListItem.mockResolvedValueOnce(mockItem);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("0");
      expect(replyCall).toContain("times.");
    });

    it("should format date correctly", async () => {
      const mockItem = {
        item: "test item",
        created_by_user_id: "user123",
        created: "2024-01-15T10:30:00Z",
        times_used: 1,
      };
      mockGetFirstListItem.mockResolvedValueOnce(mockItem);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      // Date format will vary by locale, but should contain the date
      expect(replyCall).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    });
  });

  describe("Item not found", () => {
    it("should display not found message when item doesn't exist", async () => {
      mockGetFirstListItem.mockResolvedValueOnce(null);
      mockInteraction.options.get = mock(() => ({ value: "nonexistent item" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "I couldn't find anything matching: _'nonexistent item'_",
      );
    });

    it("should handle undefined response", async () => {
      mockGetFirstListItem.mockResolvedValueOnce(undefined);

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.stringContaining("I couldn't find anything matching"),
      );
    });

    it("should display exact search term in not found message", async () => {
      mockGetFirstListItem.mockResolvedValueOnce(null);
      mockInteraction.options.get = mock(() => ({ value: "specific search" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "I couldn't find anything matching: _'specific search'_",
      );
    });
  });

  describe("Input validation", () => {
    it("should reject items longer than 100 characters", async () => {
      const longItem = "x".repeat(101);
      mockInteraction.options.get = mock(() => ({ value: longItem }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "If you're Graham, stop it. If you're not Graham, I bet he put you up to it. I need a shorter prompt please.",
      );
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should accept items exactly 100 characters", async () => {
      const maxLengthItem = "x".repeat(100);
      mockInteraction.options.get = mock(() => ({ value: maxLengthItem }));
      mockGetFirstListItem.mockResolvedValueOnce(null);

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalled();
    });

    it("should accept empty string", async () => {
      mockInteraction.options.get = mock(() => ({ value: "" }));
      mockGetFirstListItem.mockResolvedValueOnce(null);

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalledWith(
        'item = "" && (server_id = "All" || server_id = "guild123")',
      );
    });

    it("should handle undefined item value", async () => {
      mockInteraction.options.get = mock(() => ({ value: undefined }));
      mockGetFirstListItem.mockResolvedValueOnce(null);

      await execute(mockInteraction, mockLogCommand);

      // Should handle gracefully - length check will fail safely
      expect(mockLogCommand).toHaveBeenCalled();
    });
  });

  describe("Server filtering", () => {
    it("should search in current guild or All", async () => {
      mockInteraction.guildId = "specific-guild-456";
      mockGetFirstListItem.mockResolvedValueOnce(null);
      mockInteraction.options.get = mock(() => ({ value: "item" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalledWith(
        'item = "item" && (server_id = "All" || server_id = "specific-guild-456")',
      );
    });

    it("should handle null guildId", async () => {
      mockInteraction.guildId = null;
      mockGetFirstListItem.mockResolvedValueOnce(null);
      mockInteraction.options.get = mock(() => ({ value: "item" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalledWith(
        'item = "item" && (server_id = "All" || server_id = "null")',
      );
    });

    it("should include items from All servers", async () => {
      const mockItem = {
        item: "global item",
        created_by_user_id: "admin",
        created: "2024-01-01T00:00:00Z",
        times_used: 100,
        server_id: "All",
      };
      mockGetFirstListItem.mockResolvedValueOnce(mockItem);
      mockInteraction.options.get = mock(() => ({ value: "global item" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.stringContaining("global item"),
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

    it("should handle invalid date format", async () => {
      const mockItem = {
        item: "test item",
        created_by_user_id: "user123",
        created: "invalid-date",
        times_used: 1,
      };
      mockGetFirstListItem.mockResolvedValueOnce(mockItem);

      await execute(mockInteraction, mockLogCommand);

      // Should still reply without throwing
      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it("should call logCommand even on error", async () => {
      mockGetFirstListItem.mockRejectedValueOnce(new Error("Test error"));

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle reply errors", async () => {
      mockGetFirstListItem.mockResolvedValueOnce(null);
      mockInteraction.reply = mock(() =>
        Promise.reject(new Error("Reply failed")),
      );

      // Should not throw
      expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();
    });
  });

  describe("Special characters in item names", () => {
    it("should handle items with quotes", async () => {
      mockInteraction.options.get = mock(() => ({
        value: 'item with "quotes"',
      }));
      mockGetFirstListItem.mockResolvedValueOnce(null);

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalled();
    });

    it("should handle items with special characters", async () => {
      mockInteraction.options.get = mock(() => ({ value: "item@#$%^&*()" }));
      mockGetFirstListItem.mockResolvedValueOnce(null);

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalled();
    });

    it("should handle items with emoji", async () => {
      mockInteraction.options.get = mock(() => ({ value: "item 🎉" }));
      mockGetFirstListItem.mockResolvedValueOnce(null);

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetFirstListItem).toHaveBeenCalled();
    });
  });
});
