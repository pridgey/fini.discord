import { describe, expect, it } from "bun:test";
import { finicardsChannelOf } from "../../utilities/config/configUtils";

describe("the Finicards channel", () => {
  it("is the channel set for Finicards", () => {
    expect(finicardsChannelOf({ bot_channel: "bots", finicards_channel: "cards" })).toBe("cards");
  });

  it("falls back to the bot channel when none is set, or it was reset", () => {
    expect(finicardsChannelOf({ bot_channel: "bots" })).toBe("bots");
    expect(finicardsChannelOf({ bot_channel: "bots", finicards_channel: "" })).toBe("bots");
  });

  it("is nothing on a server with neither", () => {
    expect(finicardsChannelOf({ bot_channel: "" })).toBeNull();
    expect(finicardsChannelOf(null)).toBeNull();
  });
});
