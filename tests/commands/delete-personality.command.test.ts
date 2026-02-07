import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  setupPersonalityModuleMocks,
  initPersonalityMocks,
  mockPersonalityExistsForUser,
  mockDeletePersonalityByName,
} from "../mocks/personalities.mock";
import { mockConsole, restoreConsole } from "../mocks/console.mock";

// Setup module mocks before importing the module under test
setupPersonalityModuleMocks();

// Import after mocking
const { execute } = await import("../../commands/delete-personality.command");

describe("delete-personality command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    // Reset all mocks before each test
    initPersonalityMocks();

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
        get: mock(() => ({ value: "TestPersonality" })),
      } as any,
      reply: mock(() => Promise.resolve({} as any)),
    };
  });

  afterEach(() => {
    // Restore console after each test
    restoreConsole();
  });

  it("should delete personality if exists", async () => {
    mockPersonalityExistsForUser.mockImplementation(() =>
      Promise.resolve(true),
    );
    mockDeletePersonalityByName.mockImplementation(() => Promise.resolve());

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockDeletePersonalityByName).toHaveBeenCalledWith({
      userId: "user123",
      personalityName: "TestPersonality",
      serverId: "guild123",
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "TestPersonality killed. You did this.",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should reply if personality does not exist", async () => {
    mockPersonalityExistsForUser.mockImplementation(() =>
      Promise.resolve(false),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "Could not find a personality with the name TestPersonality.",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should reply if name is empty", async () => {
    mockInteraction.options.get = mock(() => ({ value: "" }));

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "A Bot needs a name (to kill).",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle delete error", async () => {
    mockPersonalityExistsForUser.mockImplementation(() =>
      Promise.resolve(true),
    );
    mockDeletePersonalityByName.mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /delete-personality command: fail",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle interactions without a guild", async () => {
    mockInteraction.guild = null;
    mockPersonalityExistsForUser.mockImplementation(() =>
      Promise.resolve(true),
    );
    mockDeletePersonalityByName.mockImplementation(() => Promise.resolve());

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockDeletePersonalityByName).toHaveBeenCalledWith({
      userId: "user123",
      personalityName: "TestPersonality",
      serverId: undefined,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "TestPersonality killed. You did this.",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle error during personality existence check", async () => {
    mockPersonalityExistsForUser.mockImplementation(() =>
      Promise.reject(new Error("DB connection failed")),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /delete-personality command: DB connection failed",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });
});
