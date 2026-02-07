import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  setupPersonalityModuleMocks,
  initPersonalityMocks,
  mockGetAllPersonalitiesForUser,
} from "../mocks/personalities.mock";
import {
  setupUtilityModuleMocks,
  initUtilityMocks,
  mockSplitBigString,
} from "../mocks/utilities.mock";
import { mockConsole, restoreConsole } from "../mocks/console.mock";

// Setup module mocks before importing the module under test
setupPersonalityModuleMocks();
setupUtilityModuleMocks();

// Import after mocking
const { execute } = await import("../../commands/list-personalities.command");

describe("list-personalities command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    // Reset all mocks before each test
    initPersonalityMocks();
    initUtilityMocks();

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
      reply: mock(() => Promise.resolve({} as any)),
      followUp: mock(() => Promise.resolve({} as any)),
    };

    // Set up default mock implementations
    mockGetAllPersonalitiesForUser.mockImplementation(() =>
      Promise.resolve([
        { personality_name: "Test1", prompt: "Prompt1", active: true },
        { personality_name: "Test2", prompt: "Prompt2", active: false },
      ]),
    );
    mockSplitBigString.mockImplementation((str: string) => [str]);
  });

  afterEach(() => {
    // Restore console after each test
    restoreConsole();
  });

  it("should reply with personalities list", async () => {
    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalled();
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle multiple messages", async () => {
    mockSplitBigString.mockImplementation(() => ["msg1", "msg2"]);

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith("msg1");
    expect(mockInteraction.followUp).toHaveBeenCalledWith("msg2");
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle error", async () => {
    mockGetAllPersonalitiesForUser.mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /list-personality command: fail",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle empty personality list", async () => {
    mockGetAllPersonalitiesForUser.mockImplementation(() =>
      Promise.resolve([]),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
    expect(replyCall).toContain("Default");
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle interactions without a guild", async () => {
    mockInteraction.guild = null;
    mockGetAllPersonalitiesForUser.mockImplementation(() =>
      Promise.resolve([
        { personality_name: "Test1", prompt: "Prompt1", active: true },
      ]),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockGetAllPersonalitiesForUser).toHaveBeenCalledWith({
      userId: "user123",
      serverId: undefined,
    });
    expect(mockInteraction.reply).toHaveBeenCalled();
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle more than 2 messages with multiple follow-ups", async () => {
    mockSplitBigString.mockImplementation(() => ["msg1", "msg2", "msg3"]);

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith("msg1");
    expect(mockInteraction.followUp).toHaveBeenCalledTimes(2);
    expect(mockInteraction.followUp).toHaveBeenCalledWith("msg2");
    expect(mockInteraction.followUp).toHaveBeenCalledWith("msg3");
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should include active indicator for active personalities", async () => {
    mockGetAllPersonalitiesForUser.mockImplementation(() =>
      Promise.resolve([
        { personality_name: "Active1", prompt: "Prompt1", active: true },
        { personality_name: "Inactive1", prompt: "Prompt2", active: false },
      ]),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    const replyCall = (mockInteraction.reply as any).mock.calls[0][0];
    expect(replyCall).toContain("Active1");
    expect(replyCall).toContain("**(Active)**");
    expect(mockLogCommand).toHaveBeenCalled();
  });
});
