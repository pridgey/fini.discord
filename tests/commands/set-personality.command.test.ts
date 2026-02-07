import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { execute } from "../../commands/set-personality.command";
// All dependencies are mocked locally below

describe("set-personality command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  let markAllPersonalitiesInactiveForUserSpy: any;
  let setPersonalityActiveByNameSpy: any;
  let clearHistorySpy: any;
  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockInteraction = {
      options: {
        get: mock((name: string) => ({
          value: name === "name" ? "TestPersonality" : true,
        })),
      },
      user: { id: "user123" },
      guild: { id: "guild123" },
      reply: mock(() => Promise.resolve()),
    };
    markAllPersonalitiesInactiveForUserSpy = mock(() => Promise.resolve());
    setPersonalityActiveByNameSpy = mock(() => Promise.resolve(true));
    clearHistorySpy = mock(() => Promise.resolve());
  });

  it("should set personality and reply without clearing chat", async () => {
    mockInteraction.options.get = mock((name: string) => ({
      value: name === "name" ? "TestPersonality" : false,
    }));
    await execute(mockInteraction, mockLogCommand, {
      markAllPersonalitiesInactiveForUser:
        markAllPersonalitiesInactiveForUserSpy,
      setPersonalityActiveByName: setPersonalityActiveByNameSpy,
      clearHistory: clearHistorySpy,
    });
    expect(markAllPersonalitiesInactiveForUserSpy).not.toHaveBeenCalled();
    expect(setPersonalityActiveByNameSpy).toHaveBeenCalledWith({
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
    await execute(mockInteraction, mockLogCommand, {
      markAllPersonalitiesInactiveForUser:
        markAllPersonalitiesInactiveForUserSpy,
      setPersonalityActiveByName: setPersonalityActiveByNameSpy,
      clearHistory: clearHistorySpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "Active personality set to TestPersonality. (Chat history cleared)",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should clear chat history if option set", async () => {
    mockInteraction.options.get = mock((name: string) => ({
      value: name === "name" ? "TestPersonality" : true,
    }));
    await execute(mockInteraction, mockLogCommand, {
      markAllPersonalitiesInactiveForUser:
        markAllPersonalitiesInactiveForUserSpy,
      setPersonalityActiveByName: setPersonalityActiveByNameSpy,
      clearHistory: clearHistorySpy,
    });
    expect(clearHistorySpy).toHaveBeenCalled();
  });

  it("should reply if name is empty", async () => {
    mockInteraction.options.get = mock(() => ({ value: "" }));
    await execute(mockInteraction, mockLogCommand, {
      markAllPersonalitiesInactiveForUser:
        markAllPersonalitiesInactiveForUserSpy,
      setPersonalityActiveByName: setPersonalityActiveByNameSpy,
      clearHistory: clearHistorySpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "A Bot needs a name.",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle set active error", async () => {
    setPersonalityActiveByNameSpy.mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );
    await execute(mockInteraction, mockLogCommand, {
      markAllPersonalitiesInactiveForUser:
        markAllPersonalitiesInactiveForUserSpy,
      setPersonalityActiveByName: setPersonalityActiveByNameSpy,
      clearHistory: clearHistorySpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /set-personality command: fail",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });
});
