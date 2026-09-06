import { describe, it, expect, mock, beforeEach } from "bun:test";
import { ALL_CHAT_TYPES } from "../../modules/aiChat/chatTypes";
import { clearAllHistory } from "../../utilities/clearAllHistory";

/*
 * The single-backend clear is injected rather than module-mocked. bun's
 * mock.module is process global and several command suites replace
 * utilities/chatHistory wholesale, so a module mock here would be silently
 * overwritten depending on file order - passing in isolation and testing
 * nothing in a full run.
 */
describe("clearAllHistory", () => {
  let clear: ReturnType<typeof mock>;

  /** The chatType each call was given, in call order. */
  const clearedTypes = () => clear.mock.calls.map((call) => call[2]);

  beforeEach(() => {
    clear = mock(() => Promise.resolve());
  });

  // The bug this exists to prevent: /set-personality cleared a hand-written
  // subset of backends, so llama history survived a clear the user was told
  // had happened.
  it("clears every chatType, not a subset", async () => {
    await clearAllHistory("user123", "guild456", clear as any);

    expect(clearedTypes()).toEqual([...ALL_CHAT_TYPES]);
  });

  it("includes llama, the backend the old callers missed", async () => {
    await clearAllHistory("user123", "guild456", clear as any);

    expect(clearedTypes()).toContain("llama");
  });

  it("passes the user and server through to each backend", async () => {
    await clearAllHistory("user123", "guild456", clear as any);

    for (const chatType of ALL_CHAT_TYPES) {
      expect(clear).toHaveBeenCalledWith("user123", "guild456", chatType);
    }
  });

  // index.ts writes history as `message.guildId ?? "unknown"`. Anything else
  // filters on a server_id that was never stored and deletes nothing.
  it.each([null, undefined])(
    "falls back to the stored server id for %p",
    async (guildID) => {
      await clearAllHistory("user123", guildID as any, clear as any);

      for (const call of clear.mock.calls) {
        expect(call[1]).toBe("unknown");
      }
    },
  );

  // The writer uses `guildId ?? "unknown"`, so only nullish is substituted.
  // Anything else is passed through, or the two would disagree on what to
  // filter for. Discord never yields an empty guildId in practice.
  it("passes a non-nullish server id through untouched", async () => {
    await clearAllHistory("user123", "" as any, clear as any);

    for (const call of clear.mock.calls) {
      expect(call[1]).toBe("");
    }
  });

  describe("Error handling", () => {
    it("keeps going when one backend fails", async () => {
      clear = mock(() => Promise.resolve()) as any;
      (clear as any).mockRejectedValueOnce(new Error("openai unreachable"));

      await clearAllHistory("user123", "guild456", clear as any);

      // Every backend still attempted, including the ones queued behind the
      // failure - one unreachable service must not strand the rest.
      expect(clear).toHaveBeenCalledTimes(ALL_CHAT_TYPES.length);
      expect(clearedTypes()).toEqual([...ALL_CHAT_TYPES]);
    });

    it("does not throw when every backend fails", async () => {
      clear = mock(() => Promise.reject(new Error("all down"))) as any;

      expect(
        clearAllHistory("user123", "guild456", clear as any),
      ).resolves.toBeUndefined();
    });
  });
});
