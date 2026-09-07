import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  TRANSCRIBE_SAMPLE_RATE,
  buildTranscribeInputArgs,
  buildWhisperArgs,
  isTranscriptionConfigured,
  normaliseTranscript,
  transcribeReadOnlyPaths,
  transcribeReference,
  whisperBinary,
  whisperModel,
} from "../../modules/tts/transcribe";

/**
 * Transcription is best-effort, and that is the part worth pinning down: a
 * host with no whisper installed, a clip with no speech in it and a crash all
 * have to come back as "no transcript" rather than as a failed command, since
 * the generation after this can still produce audio without one.
 */

const BIN = "/opt/whisper/whisper-cli";
const MODEL = "/opt/whisper/models/ggml-small.en.bin";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    FINI_WHISPER_BIN: process.env.FINI_WHISPER_BIN,
    FINI_WHISPER_MODEL: process.env.FINI_WHISPER_MODEL,
  };
  process.env.FINI_WHISPER_BIN = BIN;
  process.env.FINI_WHISPER_MODEL = MODEL;
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const valueOf = (args: string[], flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};

describe("configuration", () => {
  it("reads both paths from the environment", () => {
    expect(whisperBinary()).toBe(BIN);
    expect(whisperModel()).toBe(MODEL);
  });

  it("falls back to a PATH lookup with no binary configured", () => {
    delete process.env.FINI_WHISPER_BIN;

    expect(whisperBinary()).toBe("whisper-cli");
  });

  it("is not configured when the model is missing", () => {
    expect(isTranscriptionConfigured()).toBe(false);
  });
});

describe("buildTranscribeInputArgs", () => {
  it("downmixes to the rate whisper works at", () => {
    const args = buildTranscribeInputArgs(
      "/tmp/job/speaker.wav",
      "/tmp/job/t.wav",
    );

    expect(valueOf(args, "-i")).toBe("/tmp/job/speaker.wav");
    expect(valueOf(args, "-ar")).toBe(String(TRANSCRIBE_SAMPLE_RATE));
    expect(valueOf(args, "-ac")).toBe("1");
    expect(args.at(-1)).toBe("/tmp/job/t.wav");
  });
});

describe("buildWhisperArgs", () => {
  it("asks for the words and nothing else", () => {
    // Timestamps in the file would be read out as words to say, and the
    // progress print would land in the same stream as the transcript.
    const args = buildWhisperArgs("/tmp/job/t.wav", "/tmp/job/out");

    expect(valueOf(args, "-m")).toBe(MODEL);
    expect(valueOf(args, "-f")).toBe("/tmp/job/t.wav");
    expect(args).toContain("-nt");
    expect(args).toContain("-np");
    expect(args).toContain("-otxt");
    expect(valueOf(args, "-of")).toBe("/tmp/job/out");
  });
});

describe("transcribeReadOnlyPaths", () => {
  it("exposes the binary's directory and the model's", () => {
    expect(transcribeReadOnlyPaths()).toEqual([
      "/opt/whisper",
      "/opt/whisper/models",
    ]);
  });

  it("only asks for the model when the binary came off PATH", () => {
    delete process.env.FINI_WHISPER_BIN;

    expect(transcribeReadOnlyPaths()).toEqual(["/opt/whisper/models"]);
  });
});

describe("normaliseTranscript", () => {
  it("flattens whisper's line breaks into one line", () => {
    expect(normaliseTranscript("  Hello there.\n General Kenobi.\n\n")).toBe(
      "Hello there. General Kenobi.",
    );
  });

  it("comes back empty for a clip with no speech in it", () => {
    expect(normaliseTranscript("\n \n")).toBe("");
  });

  it("caps a transcript that ran away", () => {
    // whisper loops on silence, and the failure mode is a wall of repeats
    // rather than an error.
    expect(normaliseTranscript("la ".repeat(5_000)).length).toBeLessThanOrEqual(
      2_000,
    );
  });
});

describe("transcribeReference", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fini-transcribe-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns nothing when whisper is not installed", async () => {
    // The important half: no transcript means x-vector-only conditioning,
    // which is a worse voice and not a failed command.
    expect(
      await transcribeReference(join(dir, "speaker.wav"), dir, 1_000),
    ).toBeUndefined();
  });

  it("returns nothing rather than throwing when the run fails", async () => {
    // A real binary and model, pointed at a file that is not audio.
    const binary = join(dir, "whisper-cli");
    const model = join(dir, "ggml-small.en.bin");
    await writeFile(binary, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    await writeFile(model, "weights");
    process.env.FINI_WHISPER_BIN = binary;
    process.env.FINI_WHISPER_MODEL = model;
    await writeFile(join(dir, "speaker.wav"), "not audio");

    expect(
      await transcribeReference(join(dir, "speaker.wav"), dir, 5_000),
    ).toBeUndefined();
  });
});
