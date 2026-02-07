import { describe, it, expect, mock, beforeEach, spyOn } from "bun:test";

// Mock logHammerspaceUsage utility
const mockLogHammerspaceUsage = mock(() => Promise.resolve());
mock.module("../../utilities/hammerspace", () => ({
  logHammerspaceUsage: mockLogHammerspaceUsage,
}));

// Mock pocketbase
const mockGetList = mock((_page?: number, _perPage?: number, _options?: any) =>
  Promise.resolve({
    items: [{ item: "rubber chicken" }],
  } as any),
);
const mockCollection = mock(() => ({
  getList: mockGetList,
}));

mock.module("../../utilities/pocketbase", () => ({
  pb: {
    collection: mockCollection,
  },
}));

// Import after mocking
const { execute } = await import("../../commands/slap.command");

describe("slap command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;
  let mathRandomSpy: any;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockGetList.mockClear();
    mockCollection.mockClear();
    mockLogHammerspaceUsage.mockClear();

    // Spy on Math.random to control randomness
    mathRandomSpy = spyOn(Math, "random");
    mathRandomSpy.mockReturnValue(0.5); // Default to middle value

    mockInteraction = {
      options: {
        get: mock(() => ({ value: "target" })),
      },
      user: {
        username: "testuser",
      },
      reply: mock(() => Promise.resolve()),
    };
  });

  describe("Basic slap functionality", () => {
    it("should slap target with random item", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "rubber chicken" }],
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCollection).toHaveBeenCalledWith("hammerspace");
      expect(mockGetList).toHaveBeenCalledWith(1, 1, {
        sort: "@random",
        filter: 'type = "item"',
      });
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("rubber chicken"),
      });
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should include target name in message", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "banana" }],
      });
      mockInteraction.options.get = mock(() => ({ value: "Bob" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("Bob"),
      });
    });

    it("should use author username if target is empty", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "pillow" }],
      });
      mockInteraction.options.get = mock(() => ({ value: "" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("testuser"),
      });
    });

    it("should use author username if target is undefined", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "pillow" }],
      });
      mockInteraction.options.get = mock(() => ({ value: undefined }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("testuser"),
      });
    });
  });

  describe("Random intensity variation", () => {
    it("should sometimes include 'the shit out of' intensifier", async () => {
      mathRandomSpy.mockReturnValue(0.1); // < 0.15, should trigger intensifier
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "fish" }],
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("the shit out of"),
      });
    });

    it("should not always include intensifier", async () => {
      mathRandomSpy.mockReturnValue(0.5); // > 0.15, should not trigger intensifier
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "fish" }],
      });

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0].content;
      expect(replyCall).not.toContain("the shit out of");
    });

    it("should handle boundary case at 15%", async () => {
      mathRandomSpy.mockReturnValue(0.15); // Exactly 0.15
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "fish" }],
      });

      await execute(mockInteraction, mockLogCommand);

      // At exactly 0.15, the condition > 0.15 is false, so it triggers the intensifier
      const replyCall = mockInteraction.reply.mock.calls[0][0].content;
      expect(replyCall).toContain("the shit out of");
    });
  });

  describe("Hammerspace item selection", () => {
    it("should request random item from hammerspace", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "spoon" }],
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetList).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({
          sort: "@random",
        }),
      );
    });

    it("should filter for type 'item'", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "wrench" }],
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockGetList).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({
          filter: 'type = "item"',
        }),
      );
    });

    it("should log hammerspace usage", async () => {
      const mockItem = { item: "hammer" };
      mockGetList.mockResolvedValueOnce({
        items: [mockItem],
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogHammerspaceUsage).toHaveBeenCalledWith(mockItem);
    });

    it("should handle different item types", async () => {
      const items = ["sword", "shield", "potion", "scroll", "torch"];

      for (const itemName of items) {
        mockGetList.mockResolvedValueOnce({
          items: [{ item: itemName }],
        });
        mockInteraction.reply.mockClear();

        await execute(mockInteraction, mockLogCommand);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
          content: expect.stringContaining(itemName),
        });
      }
    });
  });

  describe("Message formatting", () => {
    it("should format message with bold text", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "stick" }],
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringMatching(/\*\*.*\*\*/),
      });
    });

    it("should include 'Fini slaps' in message", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "book" }],
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("Fini slaps"),
      });
    });

    it("should trim whitespace from target", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "newspaper" }],
      });
      mockInteraction.options.get = mock(() => ({ value: "  Bob  " }));

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0].content;
      expect(replyCall).not.toContain("  Bob  ");
      expect(replyCall).toContain("Bob");
    });

    it("should include 'with' before item name", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "chair" }],
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("with chair"),
      });
    });
  });

  describe("Error handling", () => {
    it("should handle database errors gracefully", async () => {
      mockGetList.mockRejectedValueOnce(new Error("Database error"));

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
      // Should not throw
    });

    it("should handle empty hammerspace items", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [],
      });

      // Should not throw
      expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();
    });

    it("should handle missing item property", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{}],
      });

      await execute(mockInteraction, mockLogCommand);

      // Should complete even with undefined item
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle reply errors", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "stone" }],
      });
      mockInteraction.reply = mock(() =>
        Promise.reject(new Error("Reply failed")),
      );

      // Should not throw
      expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();
    });

    it("should call logCommand even on error", async () => {
      mockGetList.mockRejectedValueOnce(new Error("Test error"));

      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should handle logHammerspaceUsage errors", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "bat" }],
      });
      mockLogHammerspaceUsage.mockRejectedValueOnce(new Error("Log failed"));

      // Should still complete and reply
      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("should handle very long target names", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "feather" }],
      });
      const longName = "a".repeat(100);
      mockInteraction.options.get = mock(() => ({ value: longName }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it("should handle special characters in target name", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "sock" }],
      });
      mockInteraction.options.get = mock(() => ({ value: "@User#1234" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("@User#1234"),
      });
    });

    it("should handle emoji in target name", async () => {
      mockGetList.mockResolvedValueOnce({
        items: [{ item: "boot" }],
      });
      mockInteraction.options.get = mock(() => ({ value: "User 🎉" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("User 🎉"),
      });
    });

    it("should handle very long item names", async () => {
      const longItem = "x".repeat(200);
      mockGetList.mockResolvedValueOnce({
        items: [{ item: longItem }],
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining(longItem),
      });
    });
  });
});
