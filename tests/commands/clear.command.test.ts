import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock clearHistory utility
const mockClearHistory = mock((_userId: string, _guildId: string, _provider: string) => Promise.resolve());

mock.module("../../utilities/chatHistory", () => ({
  clearHistory: mockClearHistory,
}));

// Import after mocking
const { execute } = await import("../../commands/clear.command");
const { ALL_CHAT_TYPES } = await import("../../modules/aiChat/chatTypes");

describe("clear command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockClearHistory.mockClear();

    mockInteraction = {
      user: {
        id: "user123",
      },
      guildId: "guild456",
      // discord.js flips these when the interaction is answered, and the
      // command branches on them to pick reply vs editReply
      deferred: false,
      replied: false,
      deferReply: mock(() => {
        mockInteraction.deferred = true;
        return Promise.resolve();
      }),
      editReply: mock(() => Promise.resolve()),
      reply: mock(() => Promise.resolve()),
    };
  });

  describe("Clear chat history", () => {
    it("should clear all AI chat histories", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledTimes(ALL_CHAT_TYPES.length);
      for (const chatType of ALL_CHAT_TYPES) {
        expect(mockClearHistory).toHaveBeenCalledWith(
          "user123",
          "guild456",
          chatType,
        );
      }
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        "Your chat history has been cleared.",
      );
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should clear openai history", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledWith(
        "user123",
        "guild456",
        "openai",
      );
    });

    it("should clear anthropic history", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledWith(
        "user123",
        "guild456",
        "anthropic",
      );
    });

    it("should clear ollama history", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledWith(
        "user123",
        "guild456",
        "ollama",
      );
    });
  });

  describe("Different users and guilds", () => {
    it("should clear history for specific user", async () => {
      mockInteraction.user.id = "different-user-789";

      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledWith(
        "different-user-789",
        expect.any(String),
        expect.any(String),
      );
    });

    it("should clear history for specific guild", async () => {
      mockInteraction.guildId = "specific-guild-999";

      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledWith(
        expect.any(String),
        "specific-guild-999",
        expect.any(String),
      );
    });

    it("should handle null guildId", async () => {
      mockInteraction.guildId = null;

      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledWith(
        "user123",
        "unknown",
        "openai",
      );
      expect(mockClearHistory).toHaveBeenCalledWith(
        "user123",
        "unknown",
        "anthropic",
      );
      expect(mockClearHistory).toHaveBeenCalledWith(
        "user123",
        "unknown",
        "ollama",
      );
    });

    it("should handle undefined guildId", async () => {
      mockInteraction.guildId = undefined;

      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledWith(
        "user123",
        "unknown",
        expect.any(String),
      );
    });
  });

  describe("Error handling", () => {
    it("should handle clearHistory errors and still complete", async () => {
      mockClearHistory.mockRejectedValueOnce(new Error("Clear failed"));

      await execute(mockInteraction, mockLogCommand);

      // Should continue clearing other histories
      expect(mockClearHistory).toHaveBeenCalledTimes(ALL_CHAT_TYPES.length);
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle multiple clearHistory failures", async () => {
      for (const chatType of ALL_CHAT_TYPES) {
        mockClearHistory.mockRejectedValueOnce(new Error(`${chatType} failed`));
      }

      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledTimes(ALL_CHAT_TYPES.length);
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle reply errors", async () => {
      mockInteraction.editReply = mock(() =>
        Promise.reject(new Error("Reply failed")),
      );

      // Should not throw
      expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();
    });

    it("should call logCommand even on error", async () => {
      mockClearHistory.mockRejectedValue(new Error("All failed"));

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle partial failures gracefully", async () => {
      // First succeeds, second fails, the rest succeed - the failure must not
      // stop the backends queued behind it.
      mockClearHistory
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Anthropic failed"));

      await execute(mockInteraction, mockLogCommand);

      // Every backend should still be attempted
      expect(mockClearHistory).toHaveBeenCalledTimes(ALL_CHAT_TYPES.length);
      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });
  });

  describe("Call order", () => {
    it("should clear histories in the order ALL_CHAT_TYPES declares", async () => {
      await execute(mockInteraction, mockLogCommand);

      const clearedTypes = mockClearHistory.mock.calls.map((call) => call[2]);
      expect(clearedTypes).toEqual([...ALL_CHAT_TYPES]);
    });

    it("should reply after clearing all histories", async () => {
      let clearHistoryCalled = 0;
      mockClearHistory.mockImplementation(() => {
        clearHistoryCalled++;
        return Promise.resolve();
      });

      await execute(mockInteraction, mockLogCommand);

      expect(clearHistoryCalled).toBe(ALL_CHAT_TYPES.length);
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should log command after reply", async () => {
      let replyCalled = false;
      mockInteraction.editReply = mock(() => {
        replyCalled = true;
        return Promise.resolve();
      });

      await execute(mockInteraction, mockLogCommand);

      expect(replyCalled).toBe(true);
      expect(mockLogCommand).toHaveBeenCalled();
    });
  });

  describe("Success message", () => {
    it("should display clear confirmation message", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        "Your chat history has been cleared.",
      );
    });

    it("should display same message regardless of user", async () => {
      // First user
      await execute(mockInteraction, mockLogCommand);
      const firstReply = mockInteraction.editReply.mock.calls[0][0];

      // Second user
      mockInteraction.editReply.mockClear();
      mockInteraction.user.id = "different-user";
      await execute(mockInteraction, mockLogCommand);
      const secondReply = mockInteraction.editReply.mock.calls[0][0];

      expect(firstReply).toBe(secondReply);
    });
  });

  describe("Integration behavior", () => {
    it("should clear histories sequentially", async () => {
      const clearOrder: string[] = [];
      mockClearHistory.mockImplementation((_userId: string, _guildId: string, provider: string) => {
        clearOrder.push(provider);
        return Promise.resolve();
      });

      await execute(mockInteraction, mockLogCommand);

      expect(clearOrder).toEqual([...ALL_CHAT_TYPES]);
    });

    it("should always call logCommand once", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalledTimes(1);
    });

    it("should clear all histories even if one is slow", async () => {
      mockClearHistory.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledTimes(ALL_CHAT_TYPES.length);
      expect(mockLogCommand).toHaveBeenCalled();
    });
  });

  describe("Deferral", () => {
    it("should defer before any clearing starts", async () => {
      // The whole point of the defer: it has to be in flight before the slow
      // part, or Discord's three second window closes mid-clear
      let deferredFirst = false;
      mockClearHistory.mockImplementation(() => {
        deferredFirst = mockInteraction.deferReply.mock.calls.length > 0;
        return Promise.resolve();
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.deferReply).toHaveBeenCalledTimes(1);
      expect(deferredFirst).toBe(true);
    });

    it("should still clear and reply if deferring fails", async () => {
      mockInteraction.deferReply = mock(() =>
        Promise.reject(new Error("Defer failed")),
      );

      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledTimes(ALL_CHAT_TYPES.length);
      // Never deferred, so answering falls back to a direct reply
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "Your chat history has been cleared.",
      );
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should log the command when the interaction cannot be answered", async () => {
      // The incident shape: history is gone, but the reply lands on an
      // interaction Discord has already discarded. Nothing may escape.
      mockInteraction.editReply = mock(() =>
        Promise.reject(new Error("Unknown interaction")),
      );

      await expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();

      expect(mockClearHistory).toHaveBeenCalledTimes(ALL_CHAT_TYPES.length);
      expect(mockLogCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe("Edge cases", () => {
    it("should handle missing user id", async () => {
      mockInteraction.user.id = undefined;

      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledWith(
        undefined,
        expect.any(String),
        expect.any(String),
      );
    });

    it("should handle empty string user id", async () => {
      mockInteraction.user.id = "";

      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledWith(
        "",
        expect.any(String),
        expect.any(String),
      );
    });

    it("should handle empty string guild id", async () => {
      mockInteraction.guildId = "";

      await execute(mockInteraction, mockLogCommand);

      expect(mockClearHistory).toHaveBeenCalledWith(
        expect.any(String),
        "",
        expect.any(String),
      );
    });
  });
});
