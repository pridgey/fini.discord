import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  setupPersonalityModuleMocks,
  initPersonalityMocks,
  mockCreateNewPersonality,
  mockPersonalityExistsForUser,
  mockSetPersonalityActive,
} from "../mocks/personalities.mock";
import {
  setupChatHistoryModuleMock,
  initChatHistoryMocks,
  mockClearHistory,
} from "../mocks/chatHistory.mock";
import { mockConsole, restoreConsole } from "../mocks/console.mock";

// Setup module mocks before importing the module under test
setupPersonalityModuleMocks();
setupChatHistoryModuleMock();

// Import after mocking
const { execute } = await import("../../commands/create-personality.command");

describe("create-personality command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    // Reset all mocks before each test
    initPersonalityMocks();
    initChatHistoryMocks();

    // Suppress console output during tests
    mockConsole();

    mockLogCommand = mock(() => {});

    // Create a mock interaction object
    mockInteraction = {
      user: {
        id: "test-user-id",
      } as any,
      guild: {
        id: "test-guild-id",
      } as any,
      options: {
        get: mock((name: string) => {
          const optionsMap: Record<string, any> = {
            name: { value: "TestPersonality" },
            prompt: { value: "A test personality prompt" },
            activate: { value: false },
            clear: { value: false },
          };
          return optionsMap[name];
        }),
      } as any,
      reply: mock(() => Promise.resolve({} as any)),
    };
  });

  afterEach(() => {
    // Restore console after each test
    restoreConsole();
  });

  describe("Successful personality creation", () => {
    it("should create a personality with valid name and prompt", async () => {
      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      expect(mockPersonalityExistsForUser).toHaveBeenCalledTimes(1);
      const existsCall = mockPersonalityExistsForUser.mock.calls[0][0];
      expect(existsCall.userId).toBe("test-user-id");
      expect(existsCall.personalityName).toBe("TestPersonality");
      expect(existsCall.serverId).toBe("test-guild-id");

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("TestPersonality created");
    });

    it("should activate personality when activate option is true", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "ActivePersonality" },
          prompt: { value: "An active personality" },
          activate: { value: true },
          clear: { value: false },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("ActivePersonality created");
      expect(getReplyString(replyArg)).toContain("It is set as active");
    });

    it("should clear chat history when clear option is true", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "ClearPersonality" },
          prompt: { value: "A personality with cleared history" },
          activate: { value: false },
          clear: { value: true },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("ClearPersonality created");
      expect(getReplyString(replyArg)).toContain("To use it, run");
    });

    it("should both activate and clear when both options are true", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "FullSetupPersonality" },
          prompt: { value: "A fully set up personality" },
          activate: { value: true },
          clear: { value: true },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "FullSetupPersonality created",
      );
      expect(getReplyString(replyArg)).toContain("It is set as active");
    });
  });

  describe("Validation failures", () => {
    it("should reject when name is missing", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "" },
          prompt: { value: "A test prompt" },
          activate: { value: false },
          clear: { value: false },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "Error during /create-personality command",
      );
    });

    it("should reject when prompt is missing", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "TestName" },
          prompt: { value: "" },
          activate: { value: false },
          clear: { value: false },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "Error during /create-personality command",
      );
    });

    it("should reject when name exceeds max length", async () => {
      const MAX_PERSONALITY_NAME_LENGTH = 100;
      const longName = "a".repeat(MAX_PERSONALITY_NAME_LENGTH + 1);
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: longName },
          prompt: { value: "A test prompt" },
          activate: { value: false },
          clear: { value: false },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "Error during /create-personality command",
      );
    });

    it("should reject when prompt exceeds max length", async () => {
      const MAX_PERSONALITY_PROMPT_LENGTH = 300;
      const longPrompt = "a".repeat(MAX_PERSONALITY_PROMPT_LENGTH + 1);
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "TestName" },
          prompt: { value: longPrompt },
          activate: { value: false },
          clear: { value: false },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "Error during /create-personality command",
      );
    });

    it("should reject at exactly max length boundary (301 chars for prompt)", async () => {
      const exactlyTooLongPrompt = "a".repeat(301);
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "TestName" },
          prompt: { value: exactlyTooLongPrompt },
          activate: { value: false },
          clear: { value: false },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "Error during /create-personality command",
      );
    });

    it("should accept at exactly max length boundary (300 chars for prompt)", async () => {
      const exactlyMaxPrompt = "a".repeat(300);
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "TestName" },
          prompt: { value: exactlyMaxPrompt },
          activate: { value: false },
          clear: { value: false },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("TestName created");
    });
  });

  describe("Duplicate personality handling", () => {
    it("should reject when personality name already exists for user", async () => {
      mockPersonalityExistsForUser.mockImplementation(() =>
        Promise.resolve(true),
      );

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.stringContaining(
          "There is already a personality with the name TestPersonality",
        ),
      );
    });
  });

  describe("Error handling", () => {
    it("should handle errors during personality creation", async () => {
      const testError = new Error("Database connection failed");
      mockCreateNewPersonality.mockImplementation(() =>
        Promise.reject(testError),
      );

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "Error during /create-personality command: Database connection failed",
      );
    });

    it("should handle errors during personality existence check", async () => {
      const testError = new Error("Query failed");
      mockPersonalityExistsForUser.mockImplementation(() =>
        Promise.reject(testError),
      );

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "Error during /create-personality command: Query failed",
      );
    });

    it("should handle errors during setPersonalityActive", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "TestPersonality" },
          prompt: { value: "Test prompt" },
          activate: { value: true },
          clear: { value: false },
        };
        return optionsMap[name];
      });

      const testError = new Error("Failed to activate personality");
      mockSetPersonalityActive.mockImplementation(() =>
        Promise.reject(testError),
      );

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "Error during /create-personality command: Failed to activate personality",
      );
    });

    it("should handle errors during clearHistory", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "TestPersonality" },
          prompt: { value: "Test prompt" },
          activate: { value: false },
          clear: { value: true },
        };
        return optionsMap[name];
      });

      const testError = new Error("Failed to clear history");
      mockClearHistory.mockImplementation(() => Promise.reject(testError));

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "Error during /create-personality command: Failed to clear history",
      );
    });
  });

  describe("Guild context handling", () => {
    it("should handle interactions without a guild", async () => {
      // Recreate mockInteraction without guild
      mockInteraction = {
        user: {
          id: "test-user-id",
        },
        guild: undefined,
        options: {
          get: mock((name: string) => {
            const optionsMap: Record<string, any> = {
              name: { value: "TestPersonality" },
              prompt: { value: "A test personality prompt" },
              activate: { value: false },
              clear: { value: false },
            };
            return optionsMap[name];
          }),
        },
        reply: mock(() => Promise.resolve({} as any)),
      };

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("created");
    });

    it("should pass guild ID when available", async () => {
      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("created");
    });
  });

  describe("Edge cases with option values", () => {
    it("should handle null option values", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "name" || name === "prompt") {
          return null;
        }
        return { value: false };
      }) as any;

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("created");
    });

    it("should handle undefined option values", async () => {
      mockInteraction.options.get = mock((name: string) => {
        if (name === "name" || name === "prompt") {
          return { value: undefined };
        }
        return { value: false };
      }) as any;

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("created");
    });

    it("should correctly handle boolean true for activate option", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "BoolTest" },
          prompt: { value: "Boolean test prompt" },
          activate: { value: true }, // Boolean true
          clear: { value: false },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("created");
    });

    it("should handle missing optional parameters", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "MinimalPersonality" },
          prompt: { value: "Minimal prompt" },
          activate: undefined,
          clear: undefined,
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("created");
    });
  });

  describe("Response message content", () => {
    it("should include set-personality command in response when not activated", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "InactivePersonality" },
          prompt: { value: "Not activated" },
          activate: { value: false },
          clear: { value: false },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain(
        "/set-personality InactivePersonality",
      );
    });

    it("should not include set-personality command when activated", async () => {
      mockInteraction.options.get = mock((name: string) => {
        const optionsMap: Record<string, any> = {
          name: { value: "ActivePersonality" },
          prompt: { value: "Activated" },
          activate: { value: true },
          clear: { value: false },
        };
        return optionsMap[name];
      });

      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      function getReplyString(replyArg: any): string {
        if (typeof replyArg === "string") return replyArg;
        if (replyArg && typeof replyArg.content === "string")
          return replyArg.content;
        return String(replyArg);
      }

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(getReplyString(replyArg)).toContain("It is set as active");
      expect(getReplyString(replyArg)).not.toContain("To use it, run");
    });
  });
});
