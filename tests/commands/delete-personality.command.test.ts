import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { execute } from "../../commands/delete-personality.command";
// All dependencies are mocked locally below

describe("delete-personality command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  let personalityExistsSpy: any;
  let deletePersonalityByNameSpy: any;
  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockInteraction = {
      options: {
        get: mock(() => ({ value: "TestPersonality" })),
      },
      user: { id: "user123" },
      guild: { id: "guild123" },
      reply: mock(() => Promise.resolve()),
    };
    personalityExistsSpy = mock(() => Promise.resolve(true));
    deletePersonalityByNameSpy = mock(() => Promise.resolve());
  });

  it("should delete personality if exists", async () => {
    personalityExistsSpy.mockImplementation(() => Promise.resolve(true));
    await execute(mockInteraction, mockLogCommand, {
      personalityExistsForUser: personalityExistsSpy,
      deletePersonalityByName: deletePersonalityByNameSpy,
    });
    expect(deletePersonalityByNameSpy).toHaveBeenCalledWith({
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
    personalityExistsSpy.mockImplementation(() => Promise.resolve(false));
    await execute(mockInteraction, mockLogCommand, {
      personalityExistsForUser: personalityExistsSpy,
      deletePersonalityByName: deletePersonalityByNameSpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "Could not find a personality with the name TestPersonality.",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should reply if name is empty", async () => {
    mockInteraction.options.get = mock(() => ({ value: "" }));
    await execute(mockInteraction, mockLogCommand, {
      personalityExistsForUser: personalityExistsSpy,
      deletePersonalityByName: deletePersonalityByNameSpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "A Bot needs a name (to kill).",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle delete error", async () => {
    deletePersonalityByNameSpy.mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );
    personalityExistsSpy.mockImplementation(() => Promise.resolve(true));
    await execute(mockInteraction, mockLogCommand, {
      personalityExistsForUser: personalityExistsSpy,
      deletePersonalityByName: deletePersonalityByNameSpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /delete-personality command: fail",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });
});
