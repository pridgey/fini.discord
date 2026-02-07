import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { execute } from "../../commands/edit-personality.command";
// All dependencies are mocked locally below

describe("edit-personality command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  let getPersonalityByNameSpy: any;
  let updatePersonalitySpy: any;
  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockInteraction = {
      options: {
        get: mock((name: string) => ({
          value: name === "name" ? "TestPersonality" : "NewPrompt",
        })),
      },
      user: { id: "user123" },
      guild: { id: "guild123" },
      reply: mock(() => Promise.resolve()),
    };
    getPersonalityByNameSpy = mock(() => Promise.resolve([{ id: "pid" }]));
    updatePersonalitySpy = mock(() =>
      Promise.resolve({ personality_name: "TestPersonality" }),
    );
  });

  it("should update personality if exists", async () => {
    await execute(mockInteraction, mockLogCommand, {
      getPersonalityByName: getPersonalityByNameSpy,
      updatePersonality: updatePersonalitySpy,
    });
    expect(updatePersonalitySpy).toHaveBeenCalledWith({
      personalityId: "pid",
      personalityPrompt: "NewPrompt",
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "TestPersonality has been updated.",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should reply if personality does not exist", async () => {
    getPersonalityByNameSpy.mockImplementation(() => Promise.resolve([]));
    await execute(mockInteraction, mockLogCommand, {
      getPersonalityByName: getPersonalityByNameSpy,
      updatePersonality: updatePersonalitySpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "Could not find a personality with the name TestPersonality.",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle update error", async () => {
    updatePersonalitySpy.mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );
    await execute(mockInteraction, mockLogCommand, {
      getPersonalityByName: getPersonalityByNameSpy,
      updatePersonality: updatePersonalitySpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /edit-personality command: fail",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });
});
