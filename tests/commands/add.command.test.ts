import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { pb } from "../../utilities/pocketbase";
import { execute } from "../../commands/add.command";

// Mock Pocketbase
const mockCreate = mock(() => Promise.resolve({}));
pb.collection = mock(() => ({ create: mockCreate }));

describe("add command", () => {
  let mockInteraction: any;
  let mockLogCommand: ReturnType<typeof mock>;

  beforeEach(() => {
    mockLogCommand = mock(() => {});
    mockCreate.mockClear();
    mockInteraction = {
      options: {
        get: mock((name: string) => ({ value: "Test Item" })),
      },
      user: { username: "testuser" },
      guild: { id: "guild123" },
      reply: mock(() => Promise.resolve()),
    };
  });

  it("should add item to hammerspace and reply", async () => {
    await execute(mockInteraction, mockLogCommand);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      "**Test Item** has been added to the hammerspace",
    );
    expect(mockLogCommand).toHaveBeenCalled();
  });

  it("should handle item too long", async () => {
    mockInteraction.options.get = mock(() => ({ value: "x".repeat(101) }));
    await execute(mockInteraction, mockLogCommand);
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "I'm way too lazy to add an item that long",
    });
  });

  it("should handle empty item", async () => {
    mockInteraction.options.get = mock(() => ({ value: "" }));
    await execute(mockInteraction, mockLogCommand);
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "I can't add nothing, crazy pants.",
    });
  });

  it("should handle Pocketbase error", async () => {
    mockCreate.mockImplementationOnce(() => Promise.reject(new Error("fail")));
    await execute(mockInteraction, mockLogCommand);
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Error during /add command: fail",
    });
  });
});
