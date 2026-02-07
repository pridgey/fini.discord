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

      expect(mockCreateNewPersonality).toHaveBeenCalledTimes(1);
      const createCall = mockCreateNewPersonality.mock.calls[0][0];
      expect(createCall.personalityName).toBe("TestPersonality");
      expect(createCall.personalityPrompt).toBe("A test personality prompt");
      expect(createCall.setActiveNow).toBe(false);
      expect(createCall.userId).toBe("test-user-id");
      expect(createCall.serverId).toBe("test-guild-id");

      expect(mockInteraction.reply).toHaveBeenCalled();
      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(replyArg).toContain("TestPersonality created");
      expect(mockLogCommand).toHaveBeenCalled();
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

      expect(mockSetPersonalityActive).toHaveBeenCalledTimes(1);
      const activateCall = mockSetPersonalityActive.mock.calls[0][0];
      expect(activateCall.personalityId).toBe("test-personality-id");
      expect(activateCall.userId).toBe("test-user-id");
      expect(activateCall.serverId).toBe("test-guild-id");

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(replyArg).toContain("It is set as active");
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

      expect(mockClearHistory).toHaveBeenCalledTimes(1);
      expect(mockClearHistory).toHaveBeenCalledWith(
        "test-user-id",
        "test-guild-id",
        "anthropic",
      );
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

      expect(mockSetPersonalityActive).toHaveBeenCalled();
      expect(mockClearHistory).toHaveBeenCalled();
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

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: "A personality needs both Name and Prompt.",
      });
      expect(mockCreateNewPersonality).not.toHaveBeenCalled();
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

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: "A personality needs both Name and Prompt.",
      });
      expect(mockCreateNewPersonality).not.toHaveBeenCalled();
    });

    it("should reject when name exceeds max length", async () => {
      const longName = "a".repeat(101); // MAX_PERSONALITY_NAME_LENGTH is 100
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

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("can't remember all that"),
      });
      expect(mockCreateNewPersonality).not.toHaveBeenCalled();
    });

    it("should reject when prompt exceeds max length", async () => {
      const longPrompt = "a".repeat(301); // MAX_PERSONALITY_PROMPT_LENGTH is 300
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

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("can't remember all that"),
      });
      expect(mockCreateNewPersonality).not.toHaveBeenCalled();
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

      expect(mockCreateNewPersonality).not.toHaveBeenCalled();
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

      expect(mockCreateNewPersonality).toHaveBeenCalled();
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
      expect(mockCreateNewPersonality).not.toHaveBeenCalled();
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

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining(
          "Error during /create-personality command",
        ),
      });
      expect(mockLogCommand).toHaveBeenCalled();
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

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining(
          "Error during /create-personality command",
        ),
      });
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

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining(
          "Error during /create-personality command",
        ),
      });
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

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining(
          "Error during /create-personality command",
        ),
      });
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

      expect(mockCreateNewPersonality).toHaveBeenCalledTimes(1);
      const createCall = mockCreateNewPersonality.mock.calls[0][0];
      expect(createCall.personalityName).toBe("TestPersonality");
      expect(createCall.personalityPrompt).toBe("A test personality prompt");
      expect(createCall.setActiveNow).toBe(false);
      expect(createCall.userId).toBe("test-user-id");
      expect(createCall.serverId).toBeUndefined();
    });

    it("should pass guild ID when available", async () => {
      await execute(
        mockInteraction as ChatInputCommandInteraction,
        mockLogCommand,
      );

      expect(mockCreateNewPersonality).toHaveBeenCalledTimes(1);
      const createCall = mockCreateNewPersonality.mock.calls[0][0];
      expect(createCall.serverId).toBe("test-guild-id");
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

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: "A personality needs both Name and Prompt.",
      });
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

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: "A personality needs both Name and Prompt.",
      });
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

      expect(mockSetPersonalityActive).toHaveBeenCalled();
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

      expect(mockCreateNewPersonality).toHaveBeenCalled();
      expect(mockSetPersonalityActive).not.toHaveBeenCalled();
      expect(mockClearHistory).not.toHaveBeenCalled();
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

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(replyArg).toContain("/set-personality InactivePersonality");
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

      const replyArg = (mockInteraction.reply as any).mock.calls[0][0];
      expect(typeof replyArg).toBe("string");
      expect(replyArg).toContain("It is set as active");
      expect(replyArg).not.toContain("To use it, run");
    });
  });
});
