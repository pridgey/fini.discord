import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { execute } from "../../commands/list-personalities.command";
// All dependencies are mocked locally below

describe("list-personalities command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  let getAllPersonalitiesForUserSpy: any;
  let splitBigStringSpy: any;
  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockInteraction = {
      user: { id: "user123" },
      guild: { id: "guild123" },
      reply: mock(() => Promise.resolve()),
      followUp: mock(() => Promise.resolve()),
    };
    getAllPersonalitiesForUserSpy = mock(() =>
      Promise.resolve([
        { personality_name: "Test1", prompt: "Prompt1", active: true },
        { personality_name: "Test2", prompt: "Prompt2", active: false },
      ]),
    );
    splitBigStringSpy = mock((str: string) => [str]);
  });

  it("should reply with personalities list", async () => {
    await execute(mockInteraction, mockLogCommand, {
      getAllPersonalitiesForUser: getAllPersonalitiesForUserSpy,
      splitBigString: splitBigStringSpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalled();
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle multiple messages", async () => {
    splitBigStringSpy.mockImplementation(() => ["msg1", "msg2"]);
    await execute(mockInteraction, mockLogCommand, {
      getAllPersonalitiesForUser: getAllPersonalitiesForUserSpy,
      splitBigString: splitBigStringSpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith("msg1");
    expect(mockInteraction.followUp).toHaveBeenCalledWith("msg2");
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle error", async () => {
    getAllPersonalitiesForUserSpy.mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );
    await execute(mockInteraction, mockLogCommand, {
      getAllPersonalitiesForUser: getAllPersonalitiesForUserSpy,
      splitBigString: splitBigStringSpy,
    });
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /list-personality command: fail",
    });
    expect(mockLogCommand).toHaveBeenCalled();
  });
});
