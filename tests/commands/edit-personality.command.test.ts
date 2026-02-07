import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  setupPersonalityModuleMocks,
  initPersonalityMocks,
  mockGetPersonalityByName,
  mockUpdatePersonality,
} from "../mocks/personalities.mock";
import { mockConsole, restoreConsole } from "../mocks/console.mock";

// Setup module mocks before importing the module under test
setupPersonalityModuleMocks();

// Import after mocking
const { execute } = await import("../../commands/edit-personality.command");

describe("edit-personality command", () => {
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
        get: mock((name: string) => ({
          value: name === "name" ? "TestPersonality" : "NewPrompt",
        })),
      } as any,
      reply: mock(() => Promise.resolve({} as any)),
    };
  });

  afterEach(() => {
    // Restore console after each test
    restoreConsole();
  });

  it("should update personality if exists", async () => {
    mockGetPersonalityByName.mockImplementation(() =>
      Promise.resolve([{ id: "pid" }]),
    );
    mockUpdatePersonality.mockImplementation((params: any) =>
      Promise.resolve({ personality_name: "TestPersonality" }),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockUpdatePersonality).toHaveBeenCalledWith({
      personalityId: "pid",
      personalityPrompt: "NewPrompt",
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "TestPersonality has been updated.",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should reply if personality does not exist", async () => {
    mockGetPersonalityByName.mockImplementation(() => Promise.resolve([]));

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "Could not find a personality with the name TestPersonality.",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle update error", async () => {
    mockGetPersonalityByName.mockImplementation(() =>
      Promise.resolve([{ id: "pid" }]),
    );
    mockUpdatePersonality.mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /edit-personality command: fail",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should reject when prompt exceeds max length", async () => {
    const longPrompt = "a".repeat(301);
    mockInteraction.options.get = mock((name: string) => ({
      value: name === "name" ? "TestPersonality" : longPrompt,
    }));
    mockGetPersonalityByName.mockImplementation(() =>
      Promise.resolve([{ id: "pid" }]),
    );
    mockUpdatePersonality.mockImplementation(() =>
      Promise.reject(new Error("Personality name or prompt is too long.")),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content:
        "Error during /edit-personality command: Personality name or prompt is too long.",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle interactions without a guild", async () => {
    mockInteraction.guild = null;
    mockGetPersonalityByName.mockImplementation(() =>
      Promise.resolve([{ id: "pid" }]),
    );
    mockUpdatePersonality.mockImplementation((params: any) =>
      Promise.resolve({ personality_name: "TestPersonality" }),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockGetPersonalityByName).toHaveBeenCalledWith({
      userId: "user123",
      personalityName: "TestPersonality",
      serverId: undefined,
    });
    expect(mockUpdatePersonality).toHaveBeenCalledWith({
      personalityId: "pid",
      personalityPrompt: "NewPrompt",
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "TestPersonality has been updated.",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle error during getPersonalityByName", async () => {
    mockGetPersonalityByName.mockImplementation(() =>
      Promise.reject(new Error("Database error")),
    );

    await execute(
      mockInteraction as ChatInputCommandInteraction,
      mockLogCommand,
    );

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /edit-personality command: Database error",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });
});
