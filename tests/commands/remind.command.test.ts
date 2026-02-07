import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock date-fns
const mockAdd = mock((date: Date, duration: any) => {
  const result = new Date(date);
  result.setHours(result.getHours() + (duration.hours || 0));
  result.setMinutes(result.getMinutes() + (duration.minutes || 0));
  result.setDate(result.getDate() + (duration.days || 0));
  return result;
});

mock.module("date-fns", () => ({
  add: mockAdd,
}));

// Mock tryParseDate utility
const mockTryParseDate = mock(() => null);
mock.module("../../utilities/tryParseDate/tryParseDate", () => ({
  tryParseDate: mockTryParseDate,
}));

// Mock pocketbase
const mockCreate = mock((_data?: any) => Promise.resolve({}));
const mockCollection = mock(() => ({
  create: mockCreate,
}));

mock.module("../../utilities/pocketbase", () => ({
  pb: {
    collection: mockCollection,
  },
}));

// Import after mocking
const { execute } = await import("../../commands/remind.command");

describe("remind command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockCreate.mockClear();
    mockCollection.mockClear();
    mockAdd.mockClear();
    mockTryParseDate.mockClear();

    mockInteraction = {
      options: {
        get: mock((name: string) => {
          if (name === "time") return { value: "5m" };
          if (name === "reminder") return { value: "Do something" };
          return undefined;
        }),
      },
      user: {
        id: "user123",
        username: "testuser",
      },
      guildId: "guild456",
      channelId: "channel789",
      id: "interaction123",
      deferReply: mock(() => Promise.resolve()),
      editReply: mock(() => Promise.resolve()),
      reply: mock(() => Promise.resolve()),
    };
  });

  describe("Relative time parsing", () => {
    it("should parse minutes", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "5m" };
        if (name === "reminder") return { value: "Check something" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockAdd).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should parse hours", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "2h" };
        if (name === "reminder") return { value: "Meeting" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockAdd).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalled();
    });

    it("should parse days", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "3d" };
        if (name === "reminder") return { value: "Deadline" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockAdd).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalled();
    });

    it("should parse weeks", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "2w" };
        if (name === "reminder") return { value: "Appointment" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockAdd).toHaveBeenCalled();
    });

    it("should parse multiple time units", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "2d 3h 30m" };
        if (name === "reminder") return { value: "Complex reminder" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockAdd).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalled();
    });

    it("should handle various time unit formats", async () => {
      const formats = [
        "5 minutes",
        "2 hours",
        "1 day",
        "3 weeks",
        "30 seconds",
      ];

      for (const format of formats) {
        mockInteraction.options.get = mock((name: string) => {
          if (name === "time") return { value: format };
          if (name === "reminder") return { value: "Test" };
          return undefined;
        });
        mockCreate.mockClear();

        await execute(mockInteraction, mockLogCommand);

        expect(mockCreate).toHaveBeenCalled();
      }
    });
  });

  describe("Absolute date parsing", () => {
    it("should parse valid absolute date", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "2025-12-31" };
        if (name === "reminder") return { value: "New Year reminder" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCreate).toHaveBeenCalled();
      // Should not call add for absolute dates
      const editReplyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(editReplyCall).toContain("New Year reminder");
    });

    it("should handle different date formats", async () => {
      const dates = ["Dec 25 2025", "2025-06-15", "August 31 2025"];

      for (const dateStr of dates) {
        mockInteraction.options.get = mock((name: string) => {
          if (name === "time") return { value: dateStr };
          if (name === "reminder") return { value: "Test" };
          return undefined;
        });
        mockCreate.mockClear();

        await execute(mockInteraction, mockLogCommand);

        expect(mockCreate).toHaveBeenCalled();
      }
    });
  });

  describe("Database interaction", () => {
    it("should create reminder in database with correct data", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "5m" };
        if (name === "reminder") return { value: "Test reminder" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCollection).toHaveBeenCalledWith("reminder");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_id: "channel789",
          reminder_text: "Test reminder",
          server_id: "guild456",
          user_id: "user123",
        }),
      );
    });

    it("should include original message link", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          original_message: expect.stringContaining("discord.com/channels"),
        }),
      );
    });

    it("should include timestamp in ISO format", async () => {
      await execute(mockInteraction, mockLogCommand);

      const createCall = mockCreate.mock.calls[0]?.[0];
      expect(createCall?.time).toBeDefined();
      expect(typeof createCall?.time).toBe("string");
      // ISO format check
      expect(createCall?.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("User feedback", () => {
    it("should defer reply before processing", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
    });

    it("should edit reply with confirmation", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "10m" };
        if (name === "reminder") return { value: "Important task" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      const reply = mockInteraction.editReply.mock.calls[0][0];
      expect(reply).toContain("testuser");
      expect(reply).toContain("Important task");
    });

    it("should include time information in reply", async () => {
      await execute(mockInteraction, mockLogCommand);

      const reply = mockInteraction.editReply.mock.calls[0][0];
      expect(reply).toContain("on ");
    });

    it("should show relative time notation for relative dates", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "5d" };
        if (name === "reminder") return { value: "Task" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      const reply = mockInteraction.editReply.mock.calls[0][0];
      expect(reply).toContain("(Today +5d)");
    });

    it("should not show relative notation for absolute dates", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "2025-12-25" };
        if (name === "reminder") return { value: "Christmas" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      const reply = mockInteraction.editReply.mock.calls[0][0];
      expect(reply).not.toContain("(Today +");
    });
  });

  describe("Error handling", () => {
    it("should handle missing time parameter", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "" };
        if (name === "reminder") return { value: "Test" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "I can't seem to parse your input. Please try again.",
      );
    });

    it("should handle missing reminder text", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "5m" };
        if (name === "reminder") return { value: "" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        "I can't seem to parse your input. Please try again.",
      );
    });

    it("should handle database errors", async () => {
      mockCreate.mockRejectedValueOnce(new Error("Database error"));

      // Should not throw
      expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();
    });

    it("should handle null guildId", async () => {
      mockInteraction.guildId = null;

      await execute(mockInteraction, mockLogCommand);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          server_id: "",
        }),
      );
    });
  });

  describe("Message link generation", () => {
    it("should generate correct Discord message link", async () => {
      await execute(mockInteraction, mockLogCommand);

      const createCall = mockCreate.mock.calls[0]?.[0];
      expect(createCall?.original_message).toBe(
        "https://discord.com/channels/guild456/channel789/interaction123",
      );
    });

    it("should handle different guild/channel IDs", async () => {
      mockInteraction.guildId = "guild999";
      mockInteraction.channelId = "channel888";
      mockInteraction.id = "interaction777";

      await execute(mockInteraction, mockLogCommand);

      const createCall = mockCreate.mock.calls[0]?.[0];
      expect(createCall?.original_message).toBe(
        "https://discord.com/channels/guild999/channel888/interaction777",
      );
    });
  });

  describe("Time calculation", () => {
    it("should add time correctly for relative dates", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "2h 30m" };
        if (name === "reminder") return { value: "Task" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(Date),
        expect.objectContaining({
          hours: expect.any(Number),
          minutes: expect.any(Number),
        }),
      );
    });

    it("should initialize all time units to zero", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "1d" };
        if (name === "reminder") return { value: "Task" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(Date),
        expect.objectContaining({
          years: expect.any(Number),
          months: expect.any(Number),
          weeks: expect.any(Number),
          days: expect.any(Number),
          hours: expect.any(Number),
          minutes: expect.any(Number),
          seconds: expect.any(Number),
        }),
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle very long reminder text", async () => {
      const longText = "a".repeat(500);
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "5m" };
        if (name === "reminder") return { value: longText };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          reminder_text: longText,
        }),
      );
    });

    it("should handle special characters in reminder", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "5m" };
        if (name === "reminder") return { value: "Test @#$%^&*()" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCreate).toHaveBeenCalled();
    });

    it("should handle emoji in reminder", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "time") return { value: "5m" };
        if (name === "reminder") return { value: "Party time 🎉🎊" };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          reminder_text: "Party time 🎉🎊",
        }),
      );
    });
  });
});
