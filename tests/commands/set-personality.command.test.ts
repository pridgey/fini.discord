import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  setupPersonalityModuleMocks,
  initPersonalityMocks,
  mockMarkAllPersonalitiesInactiveForUser,
  mockSetPersonalityActiveByName,
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
const { execute } = await import("../../commands/set-personality.command");

describe("set-personality command", () => {
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
        id: "user123",
      } as any,
      guild: {
        id: "guild123",
      } as any,
      options: {
        get: mock((name: string) => ({
          value: name === "name" ? "TestPersonality" : true,
        })),
      } as any,
      reply: mock(() => Promise.resolve({} as any)),
    };

    // Set up default mock implementations
    mockMarkAllPersonalitiesInactiveForUser.mockImplementation(() =>
      Promise.resolve(),
    );
    mockSetPersonalityActiveByName.mockImplementation(() =>
      Promise.resolve(true),
    );
    mockClearHistory.mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    // Restore console after each test
    restoreConsole();
  });

  it("should set personality and reply without clearing chat", async () => {
    mockInteraction.options.get = mock((name: string) => {
      if (name === "name") {
        return { value: "TestPersonality" };
      }
      // Return null for clear option to avoid clearing chat
      return null;
    });

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockMarkAllPersonalitiesInactiveForUser).not.toHaveBeenCalled();
    expect(mockSetPersonalityActiveByName).toHaveBeenCalledWith({
      personalityName: "TestPersonality",
      userId: "user123",
      serverId: "guild123",
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "Active personality set to TestPersonality. ",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should set personality and reply with clearing chat", async () => {
    mockInteraction.options.get = mock((name: string) => ({
      value: name === "name" ? "TestPersonality" : true,
    }));

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "Active personality set to TestPersonality. (Chat history cleared)",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should clear chat history if option set", async () => {
    mockInteraction.options.get = mock((name: string) => ({
      value: name === "name" ? "TestPersonality" : true,
    }));

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockClearHistory).toHaveBeenCalled();
  });

  it("should reply if name is empty", async () => {
    mockInteraction.options.get = mock(() => ({ value: "" }));

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "A Bot needs a name.",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle set active error", async () => {
    mockSetPersonalityActiveByName.mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /set-personality command: fail",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should set Default personality and mark all inactive", async () => {
    mockInteraction.options.get = mock((name: string) => {
      if (name === "name") {
        return { value: "Default" };
      }
      return null;
    });

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockMarkAllPersonalitiesInactiveForUser).toHaveBeenCalledWith({
      userId: "user123",
      serverId: "guild123",
    });
    expect(mockSetPersonalityActiveByName).not.toHaveBeenCalled();
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "Active personality set to Default. ",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle interactions without a guild", async () => {
    mockInteraction.guild = null;
    mockInteraction.options.get = mock((name: string) => {
      if (name === "name") {
        return { value: "TestPersonality" };
      }
      return null;
    });

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockSetPersonalityActiveByName).toHaveBeenCalledWith({
      personalityName: "TestPersonality",
      userId: "user123",
      serverId: undefined,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "Active personality set to TestPersonality. ",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should clear both openai and anthropic chat history", async () => {
    mockInteraction.options.get = mock((name: string) => ({
      value: name === "name" ? "TestPersonality" : true,
    }));

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockClearHistory).toHaveBeenCalledTimes(2);
    expect(mockClearHistory).toHaveBeenCalledWith(
      "user123",
      "guild123",
      "openai",
    );
    expect(mockClearHistory).toHaveBeenCalledWith(
      "user123",
      "guild123",
      "anthropic",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle error during markAllPersonalitiesInactiveForUser", async () => {
    mockInteraction.options.get = mock((name: string) => {
      if (name === "name") {
        return { value: "Default" };
      }
      return null;
    });
    mockMarkAllPersonalitiesInactiveForUser.mockImplementation(() =>
      Promise.reject(new Error("Database error")),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /set-personality command: Database error",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });
});
