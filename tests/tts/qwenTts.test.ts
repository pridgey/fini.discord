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
  languageLabel,
  qwenTtsBinary,
  ttsModelDir,
  ttsModelPaths,
  ttsReadOnlyPaths,
  type TtsRequest,
} from "../../modules/tts/qwenTts";

/**
 * `buildTtsArgs` is asserted on rather than exercised, because a real run
 * loads 2.4GB of weights and takes tens of seconds. What matters here is the
 * argument list, and the parts of it that are silent when they regress: which
 * conditioning path a request lands on, and whether the language reaches the
 * model in the form it recognises.
 */

const MODEL_DIR = "/tmp/fini-tts-models";
const BIN = "/opt/qwentts/qwen-tts";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    FINI_TTS_MODEL_DIR: process.env.FINI_TTS_MODEL_DIR,
    FINI_QWEN_TTS_BIN: process.env.FINI_QWEN_TTS_BIN,
  };
  process.env.FINI_TTS_MODEL_DIR = MODEL_DIR;
  process.env.FINI_QWEN_TTS_BIN = BIN;
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
    expect(qwenTtsBinary()).toBe(BIN);
    expect(ttsModelDir()).toBe(MODEL_DIR);
    expect(ttsModelPaths()).toEqual({
      talker: join(MODEL_DIR, "talker.gguf"),
      codec: join(MODEL_DIR, "codec.gguf"),
    });
  });

  it("falls back to a PATH lookup with no binary configured", () => {
    delete process.env.FINI_QWEN_TTS_BIN;

    expect(qwenTtsBinary()).toBe("qwen-tts");
  });
});

describe("buildTtsArgs", () => {
  it("passes both model files and writes a wav into the workspace", () => {
    const { outputPath, args } = buildTtsArgs(request());

    expect(valueOf(args, "--model")).toBe(join(MODEL_DIR, "talker.gguf"));
    expect(valueOf(args, "--codec")).toBe(join(MODEL_DIR, "codec.gguf"));
    expect(outputPath).toBe("/tmp/job/speech.wav");
    expect(valueOf(args, "-o")).toBe(outputPath);
  });

  it("never puts the prompt in the arguments", () => {
    // It goes to stdin instead, so there is no argument for it to be mistaken
    // for a flag's value and no length limit for it to run into.
    const { args } = buildTtsArgs(request({ text: "--model /etc/passwd" }));

    expect(args).not.toContain("--model /etc/passwd");
    expect(args).not.toContain("-p");
  });

  it("omits the reference clip when no voice was asked for", () => {
    const { args } = buildTtsArgs(request());

    expect(args).not.toContain("--ref-wav");
    expect(args).not.toContain("--ref-text");
  });

  it("passes a reference clip through when there is one", () => {
    const { args } = buildTtsArgs(request({ speakerFile: "/tmp/job/ref.wav" }));

    expect(valueOf(args, "--ref-wav")).toBe("/tmp/job/ref.wav");
  });

  it("turns on in-context conditioning when there is a transcript", () => {
    const { args } = buildTtsArgs(
      request({
        speakerFile: "/tmp/job/ref.wav",
        speakerTextFile: "/tmp/job/ref.txt",
      }),
    );

    expect(valueOf(args, "--ref-wav")).toBe("/tmp/job/ref.wav");
    expect(valueOf(args, "--ref-text")).toBe("/tmp/job/ref.txt");
  });

  it("drops a transcript with no clip to go with it", () => {
    // A transcript of the model's default voice is not a thing that exists,
    // and `--ref-text` without `--ref-wav` is fatal inside the model.
    const { args } = buildTtsArgs(
      request({ speakerTextFile: "/tmp/job/ref.txt" }),
    );

    expect(args).not.toContain("--ref-text");
  });

  it("caps generation in frames, from the requested seconds", () => {
    const { args } = buildTtsArgs(request({ maxSeconds: 8 }));

    expect(valueOf(args, "--max-new")).toBe(
      String(Math.round(8 * FRAMES_PER_SECOND)),
    );
  });

  it("never lets a request raise the cap above the module's own", () => {
    const { args } = buildTtsArgs(
      request({ maxSeconds: MAX_SPEECH_SECONDS * 10 }),
    );

    expect(valueOf(args, "--max-new")).toBe(
      String(Math.round(MAX_SPEECH_SECONDS * FRAMES_PER_SECOND)),
    );
  });

  it("sends the language by the name the model knows it by", () => {
    // The tag the interaction carries is ISO 639-1; the model's table is keyed
    // by the English name, and an unknown one is fatal rather than ignored.
    const { args } = buildTtsArgs(request({ language: "ja" }));

    expect(valueOf(args, "--lang")).toBe("japanese");
  });

  it("drops a language the model was not trained on", () => {
    const { args } = buildTtsArgs(request({ language: "cy" }));

    expect(args).not.toContain("--lang");
  });

  it("passes a seed only when one was asked for", () => {
    expect(buildTtsArgs(request()).args).not.toContain("--seed");
    expect(valueOf(buildTtsArgs(request({ seed: 42 })).args, "--seed")).toBe(
      "42",
    );
  });

  it("sets no sampling parameters", () => {
    // The binary already defaults to the checkpoint's own generation config,
    // so anything here would be a chance to drift away from it.
    const { args } = buildTtsArgs(request({ speakerFile: "/tmp/job/ref.wav" }));

    for (const flag of ["--temp", "--top-k", "--top-p", "--rep-pen"]) {
      expect(args).not.toContain(flag);
    }
  });
});

describe("languageLabel", () => {
  it("maps every offered choice to a name", () => {
    for (const language of TTS_LANGUAGES) {
      expect(languageLabel(language.value)).toBe(language.label);
    }
  });

  it("has nothing for a tag the model does not know", () => {
    expect(languageLabel("cy")).toBeUndefined();
    expect(languageLabel(undefined)).toBeUndefined();
  });
});

describe("isSupportedLanguage", () => {
  it("accepts every language in the choice list", () => {
    for (const language of TTS_LANGUAGES) {
      expect(isSupportedLanguage(language.value)).toBe(true);
    }
  });

  it("rejects an unknown tag and a missing one", () => {
    expect(isSupportedLanguage("cy")).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
  });
});

describe("ttsReadOnlyPaths", () => {
  it("exposes the binary's own directory and the weights", () => {
    // The binary resolves its `libggml-*.so` siblings relative to itself, so
    // its directory has to be mounted or it will not start.
    expect(ttsReadOnlyPaths()).toEqual(["/opt/qwentts", MODEL_DIR]);
  });

  it("only asks for the weights when the binary came off PATH", () => {
    delete process.env.FINI_QWEN_TTS_BIN;

    expect(ttsReadOnlyPaths()).toEqual([MODEL_DIR]);
  });
});

describe("isTtsConfigured", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fini-tts-test-"));
    process.env.FINI_TTS_MODEL_DIR = dir;
    process.env.FINI_QWEN_TTS_BIN = "qwen-tts";
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("is false with the weights missing", () => {
    expect(isTtsConfigured()).toBe(false);
  });

  it("is false with only the talker installed", async () => {
    await writeFile(join(dir, "talker.gguf"), "weights");

    expect(isTtsConfigured()).toBe(false);
  });

  it("is true once both weight files are in place", async () => {
    await writeFile(join(dir, "talker.gguf"), "weights");
    await writeFile(join(dir, "codec.gguf"), "codec");

    expect(isTtsConfigured()).toBe(true);
  });

  it("is false when an explicitly configured binary is not there", async () => {
    await writeFile(join(dir, "talker.gguf"), "weights");
    await writeFile(join(dir, "codec.gguf"), "codec");
    process.env.FINI_QWEN_TTS_BIN = join(dir, "nope", "qwen-tts");

    expect(isTtsConfigured()).toBe(false);
  });
});
