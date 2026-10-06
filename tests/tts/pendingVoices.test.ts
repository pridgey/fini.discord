import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, utimes, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const pendingDir = await mkdtemp(join(tmpdir(), "fini-tts-pending-test-"));
process.env.FINI_TTS_PENDING_DIR = pendingDir;

const {
  PENDING_VOICE_TTL_MS,
  discardPendingVoice,
  readPendingVoice,
  stashPendingVoice,
} = await import("../../modules/tts/pendingVoices");

const clip = join(pendingDir, "..", `speaker-${Date.now()}.wav`);
await writeFile(clip, "RIFF fake wav");

afterAll(async () => {
  await rm(pendingDir, { recursive: true, force: true });
  await rm(clip, { force: true });
});

describe("pending voices", () => {
  it("stashes a clip and reads it back", async () => {
    const id = await stashPendingVoice({
      clipPath: clip,
      clipHash: "abc",
      transcript: "hello there",
    });

    const pending = await readPendingVoice(id);

    expect(id).toMatch(/^[a-f0-9]{16}$/);
    expect(pending?.clipHash).toBe("abc");
    expect(pending?.transcript).toBe("hello there");
    expect(await readFile(pending!.clipPath, "utf8")).toBe("RIFF fake wav");
  });

  it("forgets a discarded clip", async () => {
    const id = await stashPendingVoice({ clipPath: clip, clipHash: "abc" });

    await discardPendingVoice(id);

    expect(await readPendingVoice(id)).toBeUndefined();
  });

  it("refuses ids that are not ours", async () => {
    // The id arrives in a button's custom id, which a client can forge.
    expect(await readPendingVoice("../../etc")).toBeUndefined();
    expect(await readPendingVoice(undefined)).toBeUndefined();
    expect(await readPendingVoice("0123456789abcdef")).toBeUndefined();
  });

  it("sweeps expired clips on the next stash", async () => {
    const old = await stashPendingVoice({ clipPath: clip, clipHash: "old" });
    const longAgo = (Date.now() - PENDING_VOICE_TTL_MS - 60_000) / 1000;
    await utimes(join(pendingDir, old), longAgo, longAgo);

    await stashPendingVoice({ clipPath: clip, clipHash: "new" });

    expect(existsSync(join(pendingDir, old))).toBe(false);
  });
});
