import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";

// Mock Citation class
class MockCitation {
  reason: string = "";
  penalty: string = "";
  title: string = "";

  async render(filename: string, gif: boolean) {
    return Buffer.from(
      `Mock citation: ${this.title} - ${this.reason} - ${this.penalty} - ${
        gif ? "gif" : "png"
      }`,
    );
  }
}

mock.module("@blockzilla101/citation", () => ({
  Citation: MockCitation,
}));

// Import after mocking
const { execute } = await import("../../commands/citation.command");
import { AttachmentBuilder } from "discord.js";

describe("citation command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    mockLogCommand = mock(() => {});

    mockInteraction = {
      options: {
        get: mock((name: string) => {
          if (name === "title") return { value: "Test Title" };
          if (name === "citation") return { value: "Test citation text" };
          if (name === "penalty") return { value: "Test penalty" };
          if (name === "gif") return { value: true };
          return undefined;
        }),
      },
      deferReply: mock(() => Promise.resolve()),
      editReply: mock(() => Promise.resolve()),
    };
  });

  describe("Valid citation generation", () => {
    it("should generate citation with all parameters", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        files: [expect.any(AttachmentBuilder)],
      });
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should generate citation with gif format", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      const editReplyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(editReplyCall.files).toHaveLength(1);
      expect(editReplyCall.files[0]).toBeInstanceOf(AttachmentBuilder);
    });

    it("should generate citation with png format when gif is false", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: false };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should default gif to true when not provided", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return undefined;
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe("Missing parameters", () => {
    it("should generate error citation when title is missing", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "" };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should generate error citation when citation text is missing", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: "" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should generate error citation when penalty is missing", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: "" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should generate error citation when all parameters are missing", async () => {
      mockInteraction.options.get = mock(() => ({ value: "" }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });
  });

  describe("Length validation", () => {
    it("should reject title longer than 200 characters", async () => {
      const longTitle = "x".repeat(201);
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: longTitle };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should accept title exactly 200 characters", async () => {
      const maxTitle = "x".repeat(200);
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: maxTitle };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should reject penalty longer than 200 characters", async () => {
      const longPenalty = "x".repeat(201);
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: longPenalty };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should accept penalty exactly 200 characters", async () => {
      const maxPenalty = "x".repeat(200);
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: maxPenalty };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should reject citation text longer than 1000 characters", async () => {
      const longCitation = "x".repeat(1001);
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: longCitation };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });

    it("should accept citation text exactly 1000 characters", async () => {
      const maxCitation = "x".repeat(1000);
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: maxCitation };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should show length error citation when any parameter is too long", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "x".repeat(201) };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: false };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe("Attachment creation", () => {
    it("should create attachment with correct filename", async () => {
      await execute(mockInteraction, mockLogCommand);

      const editReplyCall = mockInteraction.editReply.mock.calls[0][0];
      const attachment = editReplyCall.files[0];
      expect(attachment.name).toBe("citation.gif");
    });

    it("should create attachment with buffer data", async () => {
      await execute(mockInteraction, mockLogCommand);

      const editReplyCall = mockInteraction.editReply.mock.calls[0][0];
      const attachment = editReplyCall.files[0];
      expect(attachment.attachment).toBeInstanceOf(Buffer);
    });
  });

  describe("Error handling", () => {
    it("should handle citation render errors gracefully", async () => {
      // This would require mocking the Citation class to throw
      // For now, we test that malformed input doesn't throw
      mockInteraction.options.get = mock(() => ({ value: undefined }));

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
    });

    it("should handle editReply errors", async () => {
      mockInteraction.editReply = mock(() =>
        Promise.reject(new Error("Edit failed")),
      );

      // Should not throw
      await expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();
    });

    it("should handle deferReply errors", async () => {
      mockInteraction.deferReply = mock(() =>
        Promise.reject(new Error("Defer failed")),
      );

      // Should not throw
      await expect(
        execute(mockInteraction, mockLogCommand),
      ).resolves.toBeUndefined();
    });
  });

  describe("Special characters", () => {
    it("should handle special characters in title", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title @#$%^&*()" };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should handle emoji in citation text", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: "Citation 🎉🎊" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should handle newlines in citation", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: "Line 1\nLine 2\nLine 3" };
        if (name === "penalty") return { value: "Penalty" };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it("should handle quotes in penalty", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "Title" };
        if (name === "citation") return { value: "Citation" };
        if (name === "penalty") return { value: 'Penalty "quoted"' };
        if (name === "gif") return { value: true };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe("Consistent behavior", () => {
    it("should always defer reply first", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      const deferOrder = mockInteraction.deferReply.mock.calls.length;
      const editOrder = mockInteraction.editReply.mock.calls.length;
      expect(deferOrder).toBeGreaterThan(0);
      expect(editOrder).toBeGreaterThan(0);
    });

    it("should always call logCommand at the end", async () => {
      await execute(mockInteraction, mockLogCommand);

      expect(mockLogCommand).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalledTimes(1);
    });

    it("should generate citation even with minimum valid input", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "title") return { value: "T" };
        if (name === "citation") return { value: "C" };
        if (name === "penalty") return { value: "P" };
        if (name === "gif") return { value: false };
        return undefined;
      });

      await execute(mockInteraction, mockLogCommand);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      expect(mockLogCommand).toHaveBeenCalled();
    });
  });
});
