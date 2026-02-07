import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";

// Mock randomNumber utility
const mockRandomNumber = mock((min: number, max: number) => {
  return Math.floor((max + min) / 2); // Return middle value for predictability
});

mock.module("../../utilities/randomNumber", () => ({
  randomNumber: mockRandomNumber,
}));

// Import after mocking
const { execute } = await import("../../commands/roll.command");

describe("roll command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockRandomNumber.mockClear();

    mockInteraction = {
      options: {
        get: mock((name: string) => {
          if (name === "amount") return { value: 1 };
          if (name === "sides") return { value: 20 };
          return undefined;
        }),
      },
      reply: mock(() => Promise.resolve()),
    };
  });

  describe("Single dice roll", () => {
    it("should roll one d20 by default", async () => {
      mockRandomNumber.mockReturnValueOnce(15);

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalledWith(1, 20, true);
      expect(mockInteraction.reply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 1d20");
      expect(replyCall).toContain("15");
    });

    it("should roll different sided dice", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 1 };
        if (name === "sides") return { value: 6 };
        return undefined;
      });
      mockRandomNumber.mockReturnValueOnce(4);

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalledWith(1, 6, true);
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 1d6");
      expect(replyCall).toContain("4");
    });

    it("should handle d100", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 1 };
        if (name === "sides") return { value: 100 };
        return undefined;
      });
      mockRandomNumber.mockReturnValueOnce(73);

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalledWith(1, 100, true);
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 1d100");
      expect(replyCall).toContain("73");
    });
  });

  describe("Multiple dice rolls", () => {
    it("should roll multiple dice", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 3 };
        if (name === "sides") return { value: 6 };
        return undefined;
      });
      mockRandomNumber
        .mockReturnValueOnce(3)
        .mockReturnValueOnce(5)
        .mockReturnValueOnce(2);

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalledTimes(3);
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 3d6");
      expect(replyCall).toContain("3");
      expect(replyCall).toContain("5");
      expect(replyCall).toContain("2");
      expect(replyCall).toContain("total of: 10");
    });

    it("should handle many dice (up to 50)", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 50 };
        if (name === "sides") return { value: 20 };
        return undefined;
      });

      // Mock 50 rolls
      for (let i = 0; i < 50; i++) {
        mockRandomNumber.mockReturnValueOnce(10);
      }

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalledTimes(50);
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 50d20");
      expect(replyCall).toContain("total of: 500");
    });

    it("should cap dice amount at 50", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 100 };
        if (name === "sides") return { value: 6 };
        return undefined;
      });

      // Mock 50 rolls (not 100)
      for (let i = 0; i < 50; i++) {
        mockRandomNumber.mockReturnValueOnce(3);
      }

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalledTimes(50);
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 50d6");
    });
  });

  describe("Edge cases and boundaries", () => {
    it("should handle zero or negative amount as 1", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 0 };
        if (name === "sides") return { value: 20 };
        return undefined;
      });
      mockRandomNumber.mockReturnValueOnce(10);

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalledTimes(1);
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 1d20");
    });

    it("should handle negative amount as 1", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: -5 };
        if (name === "sides") return { value: 6 };
        return undefined;
      });
      mockRandomNumber.mockReturnValueOnce(4);

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalledTimes(1);
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 1d6");
    });

    it("should handle minimum sides (2)", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 1 };
        if (name === "sides") return { value: 1 };
        return undefined;
      });
      mockRandomNumber.mockReturnValueOnce(1);

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalledWith(1, 2, true);
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 1d2");
    });

    it("should handle undefined options with defaults", async () => {
      mockInteraction.options.get = mock(() => undefined);
      mockRandomNumber.mockReturnValueOnce(12);

      await execute(mockInteraction, mockLogCommand);

      expect(mockRandomNumber).toHaveBeenCalledWith(1, 20, true);
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 1d20");
    });
  });

  describe("Output formatting", () => {
    it("should format numbers with commas for large values", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 10 };
        if (name === "sides") return { value: 1000 };
        return undefined;
      });

      for (let i = 0; i < 10; i++) {
        mockRandomNumber.mockReturnValueOnce(100);
      }

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("Rolling 10d1,000");
      expect(replyCall).toContain("total of: 1,000");
    });

    it("should display all rolled values in table format", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 5 };
        if (name === "sides") return { value: 6 };
        return undefined;
      });

      mockRandomNumber
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(2)
        .mockReturnValueOnce(3)
        .mockReturnValueOnce(4)
        .mockReturnValueOnce(5);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("```");
      expect(replyCall).toMatch(/[|]/); // Table format with pipes
    });

    it("should calculate correct total", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "amount") return { value: 4 };
        if (name === "sides") return { value: 8 };
        return undefined;
      });

      mockRandomNumber
        .mockReturnValueOnce(3)
        .mockReturnValueOnce(7)
        .mockReturnValueOnce(2)
        .mockReturnValueOnce(8);

      await execute(mockInteraction, mockLogCommand);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall).toContain("total of: 20");
    });
  });
});
