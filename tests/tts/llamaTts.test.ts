import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  FRAMES_PER_SECOND,
  MAX_SPEECH_SECONDS,
  TTS_LANGUAGES,
  buildTtsArgs,
  isSupportedLanguage,
  isTtsConfigured,
  llamaTtsBinary,
  ttsModelDir,
  ttsModelPaths,
  ttsReadOnlyPaths,
  type TtsRequest,
} from "../../modules/tts/llamaTts";

/**
 * `buildTtsArgs` is asserted on rather than exercised, because a real run
 * loads 2.3GB of weights and takes tens of seconds. What matters here is the
 * argument list: the prompt is arbitrary user text, and the flags that keep it
 * from being reinterpreted (`--no-escape`) or the model from reaching the
 * network (`--offline`) are silent when they regress - the command still works,
 * it just works differently than intended.
 */

const MODEL_DIR = "/tmp/fini-tts-models";
const BIN = "/opt/llama/llama-tts";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    FINI_TTS_MODEL_DIR: process.env.FINI_TTS_MODEL_DIR,
    FINI_LLAMA_TTS_BIN: process.env.FINI_LLAMA_TTS_BIN,
  };
  process.env.FINI_TTS_MODEL_DIR = MODEL_DIR;
  process.env.FINI_LLAMA_TTS_BIN = BIN;
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const request = (overrides: Partial<TtsRequest> = {}): TtsRequest => ({
  text: "hello there",
  outputDir: "/tmp/job",
  outputBase: "speech",
  timeoutMs: 1000,
  ...overrides,
});

/** The value following a flag, or undefined when the flag is absent. */
const valueOf = (args: string[], flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};

describe("model and binary resolution", () => {
  it("reads both paths from the environment", () => {
    expect(llamaTtsBinary()).toBe(BIN);
    expect(ttsModelDir()).toBe(MODEL_DIR);
    expect(ttsModelPaths()).toEqual({
      model: join(MODEL_DIR, "model.gguf"),
      mmproj: join(MODEL_DIR, "mmproj.gguf"),
    });
  });

  it("falls back to a PATH lookup with no binary configured", () => {
    delete process.env.FINI_LLAMA_TTS_BIN;

    expect(llamaTtsBinary()).toBe("llama-tts");
  });
});

describe("buildTtsArgs", () => {
  it("passes both model files and writes a wav into the workspace", () => {
    const { outputPath, args } = buildTtsArgs(request());

    expect(outputPath).toBe("/tmp/job/speech.wav");
    expect(valueOf(args, "-m")).toBe(join(MODEL_DIR, "model.gguf"));
    expect(valueOf(args, "-mm")).toBe(join(MODEL_DIR, "mmproj.gguf"));
    expect(valueOf(args, "-o")).toBe(outputPath);
  });

  it("takes the prompt literally and stays offline", () => {
    // Without --no-escape, llama-tts turns a typed "\n" into a newline; the
    // prompt is meant to be read out as written.
    const { args } = buildTtsArgs(request({ text: "a\\nb" }));

    expect(args).toContain("--no-escape");
    expect(args).toContain("--offline");
    expect(valueOf(args, "-p")).toBe("a\\nb");
  });

  it("puts the prompt last, so it cannot be read as a flag's value", () => {
    const { args } = buildTtsArgs(request({ text: "-m /etc/passwd" }));

    expect(args.at(-2)).toBe("-p");
    expect(args.at(-1)).toBe("-m /etc/passwd");
    // The real model path is still the configured one, not the prompt's.
    expect(valueOf(args, "-m")).toBe(join(MODEL_DIR, "model.gguf"));
  });

  it("omits the speaker file when no voice was asked for", () => {
    const { args } = buildTtsArgs(request());

    expect(args).not.toContain("--tts-speaker-file");
  });

  it("passes a reference clip through when there is one", () => {
    const { args } = buildTtsArgs(
      request({ speakerFile: "/tmp/job/speaker.wav" }),
    );

    expect(valueOf(args, "--tts-speaker-file")).toBe("/tmp/job/speaker.wav");
  });

  it("caps generation in frames, from the requested seconds", () => {
    const { args } = buildTtsArgs(request({ maxSeconds: 10 }));

    expect(valueOf(args, "-n")).toBe(
      String(Math.round(10 * FRAMES_PER_SECOND)),
    );
  });

  it("never lets a request raise the cap above the module's own", () => {
    const { args } = buildTtsArgs(request({ maxSeconds: 10_000 }));

    expect(valueOf(args, "-n")).toBe(
      String(Math.round(MAX_SPEECH_SECONDS * FRAMES_PER_SECOND)),
    );
  });

  it("passes a supported language", () => {
    const { args } = buildTtsArgs(request({ language: "ja" }));

    expect(valueOf(args, "--tts-lang")).toBe("ja");
  });

  it("drops a language the model was not trained on", () => {
    // --tts-lang accepts anything and mispronounces confidently rather than
    // failing, so an unknown tag is better left off entirely.
    const { args } = buildTtsArgs(request({ language: "tlh" }));

    expect(args).not.toContain("--tts-lang");
  });
});

describe("isSupportedLanguage", () => {
  it("accepts every language in the choice list", () => {
    for (const language of TTS_LANGUAGES) {
      expect(isSupportedLanguage(language.value)).toBe(true);
    }
  });

  it("rejects an unknown tag and a missing one", () => {
    expect(isSupportedLanguage("xx")).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
  });
});

describe("ttsReadOnlyPaths", () => {
  it("exposes the binary's own directory and the weights", () => {
    // The release tarball resolves libggml-*.so relative to the binary, so the
    // directory rather than the file has to be bound.
    expect(ttsReadOnlyPaths()).toEqual(["/opt/llama", MODEL_DIR]);
  });

  it("only asks for the weights when the binary came off PATH", () => {
    delete process.env.FINI_LLAMA_TTS_BIN;

    expect(ttsReadOnlyPaths()).toEqual([MODEL_DIR]);
  });
});

describe("isTtsConfigured", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fini-tts-test-"));
    process.env.FINI_TTS_MODEL_DIR = dir;
    delete process.env.FINI_LLAMA_TTS_BIN;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("is false with the weights missing", () => {
    expect(isTtsConfigured()).toBe(false);
  });

  it("is false with only the backbone installed", async () => {
    // Half an install is the likely state of an interrupted download, and the
    // missing codec fails deep inside llama-tts rather than at startup.
    await writeFile(join(dir, "model.gguf"), "");

    expect(isTtsConfigured()).toBe(false);
  });

  it("is true once both weight files are in place", async () => {
    await writeFile(join(dir, "model.gguf"), "");
    await writeFile(join(dir, "mmproj.gguf"), "");

    expect(isTtsConfigured()).toBe(true);
  });

  it("is false when an explicitly configured binary is not there", async () => {
    await writeFile(join(dir, "model.gguf"), "");
    await writeFile(join(dir, "mmproj.gguf"), "");
    process.env.FINI_LLAMA_TTS_BIN = join(dir, "nope", "llama-tts");

    expect(isTtsConfigured()).toBe(false);
  });
});
