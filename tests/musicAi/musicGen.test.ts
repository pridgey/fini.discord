import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  DEFAULT_MUSIC_SECONDS,
  FRAMES_PER_SECOND,
  GUIDANCE_SCALE,
  MAX_MUSIC_SECONDS,
  buildMusicGenArgs,
  bunBinary,
  estimateGenerationSeconds,
  isMusicGenConfigured,
  musicGenModelDir,
  musicGenModelFiles,
  musicGenReadOnlyPaths,
  musicGenScript,
  type MusicRequest,
} from "../../modules/musicAi/musicGen";

/**
 * `buildMusicGenArgs` is asserted on rather than exercised, because a real run
 * loads 630MB of weights and takes half a minute. What matters here is the
 * argument list and the length clamp - the clamp especially, because it is the
 * only thing standing between a caller and a request that sits on a media slot
 * for an hour.
 */

const MODEL_DIR = "/tmp/fini-musicgen-models";
const SCRIPT = "/opt/fini/musicgen.ts";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    FINI_MUSICGEN_MODEL_DIR: process.env.FINI_MUSICGEN_MODEL_DIR,
    FINI_MUSICGEN_SCRIPT: process.env.FINI_MUSICGEN_SCRIPT,
    FINI_BUN_BIN: process.env.FINI_BUN_BIN,
  };
  process.env.FINI_MUSICGEN_MODEL_DIR = MODEL_DIR;
  process.env.FINI_MUSICGEN_SCRIPT = SCRIPT;
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const request = (overrides: Partial<MusicRequest> = {}): MusicRequest => ({
  prompt: "a slow piano piece",
  outputDir: "/tmp/job",
  outputBase: "music",
  timeoutMs: 1000,
  ...overrides,
});

/** The value following a flag, or undefined when the flag is absent. */
const valueOf = (args: string[], flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};

describe("model and script resolution", () => {
  it("reads both paths from the environment", () => {
    expect(musicGenModelDir()).toBe(MODEL_DIR);
    expect(musicGenScript()).toBe(SCRIPT);
  });

  it("defaults the model directory under the user's data dir", () => {
    delete process.env.FINI_MUSICGEN_MODEL_DIR;

    expect(musicGenModelDir()).toEndWith("/.local/share/fini-musicgen");
  });

  it("resolves the script against the module, not the cwd", () => {
    // Started from anywhere other than the repo root, a cwd-relative path
    // would miss - and the command would report the model as uninstalled.
    delete process.env.FINI_MUSICGEN_SCRIPT;

    expect(musicGenScript()).toStartWith("/");
    expect(musicGenScript()).toEndWith("/scripts/musicgen.ts");
  });

  it("runs the bun that is running the bot", () => {
    delete process.env.FINI_BUN_BIN;

    expect(bunBinary()).toBe(process.execPath);
  });

  it("names every file the generator opens", () => {
    const files = musicGenModelFiles();

    expect(files).toContain(join(MODEL_DIR, "config.json"));
    expect(files).toContain(join(MODEL_DIR, "tokenizer.json"));
    expect(files).toContain(
      join(MODEL_DIR, "onnx/decoder_model_merged_quantized.onnx"),
    );
    expect(files).toContain(join(MODEL_DIR, "onnx/encodec_decode.onnx"));
    expect(files).toContain(
      join(MODEL_DIR, "onnx/text_encoder_quantized.onnx"),
    );
  });
});

describe("isMusicGenConfigured", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fini-musicgen-"));
    process.env.FINI_MUSICGEN_MODEL_DIR = dir;
    process.env.FINI_MUSICGEN_SCRIPT = join(dir, "musicgen.ts");
    await writeFile(join(dir, "musicgen.ts"), "");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const installAll = async () => {
    await mkdir(join(dir, "onnx"), { recursive: true });
    for (const file of musicGenModelFiles()) await writeFile(file, "");
  };

  it("is false with nothing installed", () => {
    expect(isMusicGenConfigured()).toBe(false);
  });

  it("is true once every file is in place", async () => {
    await installAll();

    expect(isMusicGenConfigured()).toBe(true);
  });

  it("is false when one graph is missing", async () => {
    // The failure that actually happens: an interrupted download leaves the
    // directory and the small json files behind and one .onnx short.
    await installAll();
    await rm(join(dir, "onnx/encodec_decode.onnx"));

    expect(isMusicGenConfigured()).toBe(false);
  });

  it("is false when the script is missing", async () => {
    await installAll();
    await rm(join(dir, "musicgen.ts"));

    expect(isMusicGenConfigured()).toBe(false);
  });
});

describe("buildMusicGenArgs", () => {
  it("writes a wav into the job workspace", () => {
    const { outputPath, args } = buildMusicGenArgs(
      request({ outputDir: "/tmp/job-7", outputBase: "tester-music" }),
    );

    expect(outputPath).toBe("/tmp/job-7/tester-music.wav");
    expect(valueOf(args, "--out")).toBe(outputPath);
  });

  it("runs the script with the configured model directory", () => {
    const { args } = buildMusicGenArgs(request());

    expect(args[0]).toBe(SCRIPT);
    expect(valueOf(args, "--model-dir")).toBe(MODEL_DIR);
  });

  it("passes the checkpoint's own guidance scale", () => {
    const { args } = buildMusicGenArgs(request());

    expect(valueOf(args, "--guidance")).toBe(String(GUIDANCE_SCALE));
  });

  it("defaults the length when none is asked for", () => {
    const { args } = buildMusicGenArgs(request());

    expect(valueOf(args, "--seconds")).toBe(String(DEFAULT_MUSIC_SECONDS));
  });

  it("clamps a length past the cap", () => {
    const { args } = buildMusicGenArgs(request({ seconds: 600 }));

    expect(valueOf(args, "--seconds")).toBe(String(MAX_MUSIC_SECONDS));
  });

  it("clamps a zero or negative length to something generatable", () => {
    expect(
      valueOf(buildMusicGenArgs(request({ seconds: 0 })).args, "--seconds"),
    ).toBe("1");
    expect(
      valueOf(buildMusicGenArgs(request({ seconds: -5 })).args, "--seconds"),
    ).toBe("1");
  });

  it("omits the seed unless one is given", () => {
    expect(
      valueOf(buildMusicGenArgs(request()).args, "--seed"),
    ).toBeUndefined();
    expect(
      valueOf(buildMusicGenArgs(request({ seed: 42 })).args, "--seed"),
    ).toBe("42");
  });

  it("never puts the prompt in the argument list", () => {
    // It goes in on stdin. As an argument, a prompt starting with a dash
    // would be read as a flag.
    const { args } = buildMusicGenArgs(
      request({ prompt: "--model-dir /etc nasty" }),
    );

    expect(args).not.toContain("nasty");
    expect(valueOf(args, "--model-dir")).toBe(MODEL_DIR);
  });
});

describe("musicGenReadOnlyPaths", () => {
  it("mounts the model directory", () => {
    expect(musicGenReadOnlyPaths()).toContain(MODEL_DIR);
  });

  it("mounts the repo, because the script imports from node_modules", () => {
    // Asserted as "something covering the script" rather than by directory
    // name, which is whatever the repo happened to be cloned into.
    delete process.env.FINI_MUSICGEN_SCRIPT;
    const script = musicGenScript();

    expect(
      musicGenReadOnlyPaths().some((path) => script.startsWith(`${path}/`)),
    ).toBe(true);
  });

  it("mounts bun's own directory", () => {
    process.env.FINI_BUN_BIN = "/opt/bun/bin/bun";

    expect(musicGenReadOnlyPaths()).toContain("/opt/bun/bin");
  });
});

describe("estimateGenerationSeconds", () => {
  it("accounts for the flat model load", () => {
    // Load dominates a short clip, so the estimate must not start at zero.
    expect(estimateGenerationSeconds(0)).toBeGreaterThanOrEqual(10);
  });

  it("grows with the requested length", () => {
    expect(estimateGenerationSeconds(30)).toBeGreaterThan(
      estimateGenerationSeconds(5),
    );
  });

  it("stays under the command's generation timeout at the cap", () => {
    // If this fails the cap and the timeout have drifted apart, and the
    // longest legal request is one the command will kill.
    expect(estimateGenerationSeconds(MAX_MUSIC_SECONDS)).toBeLessThan(5 * 60);
  });
});

describe("generation script contract", () => {
  const script = async () =>
    Bun.file(join(import.meta.dir, "../../scripts/musicgen.ts")).text();

  it("agrees with this module on the frame rate", async () => {
    // The two files have to agree or the length cap means nothing: the script
    // turns seconds into tokens, and this module sizes the timeout against it.
    expect(await script()).toContain(
      `FRAMES_PER_SECOND = ${FRAMES_PER_SECOND}`,
    );
  });

  it("seeds the library's global PRNG rather than passing a generate option", async () => {
    // transformers.js samples from a module-level MT19937. A `seed` key on
    // the `generate` call typechecks, runs, and is silently ignored - so
    // --seed would look supported and do nothing. Guarded because the broken
    // version is the one that looks right.
    const source = await script();

    expect(source).toContain("random.seed(args.seed)");
    expect(source).not.toMatch(/seed:\s*args\.seed/);
  });

  it("refuses to reach the network for a missing weight", async () => {
    // Inside the sandbox a download is a confusing timeout; outside it is
    // 630MB in the middle of an interaction.
    expect(await script()).toContain("env.allowRemoteModels = false");
  });
});
