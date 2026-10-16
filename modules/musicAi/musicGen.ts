import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { runProcess } from "../media/runProcess";
import { fileSize } from "../media/workspace";

/**
 * The generation half of `/music-ai`.
 *
 * MusicGen Small, exported to ONNX, run through transformers.js by
 * `scripts/musicgen.ts`. Text in, 32kHz mono wav out.
 *
 * Three decisions are worth knowing before changing anything here.
 *
 * **int8 on the CPU, and the GPU loses on measurement rather than on
 * principle.** onnxruntime-node bundles a WebGPU provider, it runs on this
 * Maxwell card through Vulkan, and on identical fp32 weights it is 1.8x
 * faster than the CPU. It still loses: WebGPU has no int8 kernels, so the
 * quantised graphs fall back per-node and run 12x slower there, and
 * int8-on-CPU beats the best GPU configuration by 2.3x. Going fp32 to suit
 * the GPU would also want 2.25GB of VRAM against the ~3.6GB the chat model
 * leaves free, and a 59 second shader compile on every invocation. The
 * numbers are in this module's README.
 *
 * **A subprocess, not an import.** The three ONNX sessions are 630MB on disk
 * and more resident. Loading them into the bot would hold that for the
 * process's lifetime on a host with roughly 2.7GB free; a process that exits
 * gives it back. The cost is a cold load on every invocation, which is the
 * same trade `modules/tts` makes and for the same reason.
 *
 * **The prompt goes in on stdin.** It is arbitrary user text. Passed as an
 * argument it could be read as a flag, and there is no shell in the path to
 * worry about either way.
 */

/**
 * Codec frames per second of generated audio.
 *
 * MusicGen's EnCodec runs at 50Hz. Mirrored from `scripts/musicgen.ts` so the
 * length cap and the generation request agree on what a second costs, and
 * exported so the estimate below can be tested without running a generation.
 */
export const FRAMES_PER_SECOND = 50;

/**
 * Longest clip the bot will generate.
 *
 * Fifteen, and the number is a memory limit rather than a taste one. Measured
 * on this box with the chat model up, each row a separate cold run:
 *
 * ```
 *    5s audio   34s wall   peak 1.4GB
 *   10s audio   34s wall   peak 3.1GB   (host had ~2.7GB free)
 *   10s audio   58s wall   peak 2.0GB   (host had ~3.1GB free, warmer cache)
 *   15s audio   68s wall   peak 2.1GB
 *   30s audio   abandoned after 6 minutes, swapping
 * ```
 *
 * Two things that table says, neither of them the obvious one.
 *
 * The same 10 second request took 34 and 58 seconds on two runs. Wall clock
 * here is mostly a function of what else the host is doing, not of the
 * length - the flat model load is a large share of a short clip, and whether
 * the weights are in page cache moves it more than five extra seconds of
 * audio does. Any estimate is therefore coarse on purpose.
 *
 * Peak RSS moving *opposite* to the workload is the other tell: under
 * pressure the kernel evicts the mmapped weights, so resident size stops
 * measuring the working set and starts measuring what survived.
 *
 * Thirty seconds does not run out of memory, it runs into swap, which is
 * worse: it holds a media slot for minutes and drags the rest of the bot down
 * with it. Fifteen is the longest length that finished every time it was
 * tried. A host with more free memory could raise this; it is not a model
 * limit, and MusicGen Small is trained to 30.
 */
export const MAX_MUSIC_SECONDS = 15;

/**
 * What a request gets when it does not ask for a length.
 *
 * Ten rather than the cap, because 34 seconds of waiting is a Discord command
 * and 68 seconds is a thing you walk away from.
 */
export const DEFAULT_MUSIC_SECONDS = 10;

/**
 * Classifier-free guidance scale.
 *
 * The checkpoint's own default, and left alone for the reason `modules/tts`
 * leaves sampling alone: it is the value the model was tuned and demoed at,
 * and a knob here is mostly an opportunity to drift away from it. Higher
 * tracks the prompt more literally at the cost of sounding thinner.
 */
export const GUIDANCE_SCALE = 3;

/**
 * The Bun that runs the generation script.
 *
 * Defaults to the one running the bot, which is almost always right and needs
 * no configuration. The override exists because the sandbox mounts this
 * binary's directory read-only, and a Bun installed somewhere unusual is
 * easier to point at than to move.
 * @returns The configured executable path
 */
export const bunBinary = (): string =>
  process.env.FINI_BUN_BIN || process.execPath;

/**
 * This file's own directory.
 *
 * Via `fileURLToPath` rather than `new URL(...).pathname`, which leaves the
 * path percent-encoded - a repo checked out somewhere with a space in the
 * name would get a script path containing `%20` and an unhelpful ENOENT.
 * @returns The absolute directory containing this module
 */
const moduleDir = (): string => dirname(fileURLToPath(import.meta.url));

/**
 * Path to the generation script.
 *
 * Resolved against this file rather than `process.cwd()`, so the bot works
 * when started from somewhere other than the repo root.
 * @returns The configured script path
 */
export const musicGenScript = (): string =>
  process.env.FINI_MUSICGEN_SCRIPT ||
  resolve(moduleDir(), "../../scripts/musicgen.ts");

/**
 * Directory holding the ONNX export.
 *
 * Outside the repo because it is 630MB, and at a fixed path with fixed
 * filenames rather than in the Hugging Face cache: cache paths carry the
 * snapshot hash, so they move whenever the repo is re-pulled, and mounting the
 * whole cache into the sandbox would also hand the generator the chat model's
 * weights.
 * @returns The configured model directory
 */
export const musicGenModelDir = (): string =>
  process.env.FINI_MUSICGEN_MODEL_DIR ||
  join(homedir(), ".local/share/fini-musicgen");

/**
 * Every file `scripts/musicgen.ts` opens.
 *
 * Listed in full rather than checking the directory exists, because a partial
 * install is the failure that actually happens - an interrupted download
 * leaves the directory and the small json files in place and one of the three
 * graphs missing.
 * @returns Absolute paths to the model files
 */
export const musicGenModelFiles = (): string[] => {
  const dir = musicGenModelDir();

  return [
    join(dir, "config.json"),
    join(dir, "generation_config.json"),
    join(dir, "tokenizer.json"),
    join(dir, "tokenizer_config.json"),
    join(dir, "onnx/text_encoder_quantized.onnx"),
    join(dir, "onnx/decoder_model_merged_quantized.onnx"),
    join(dir, "onnx/encodec_decode.onnx"),
  ];
};

/**
 * Raised when the model is not installed.
 *
 * Its own type because the reply for it is a setup instruction rather than the
 * tail of a failed process - the same distinction `TtsUnavailableError` draws,
 * and for the same reason: "bun exited with 1" sends whoever reads the log
 * looking for a bug instead of a download.
 */
export class MusicGenUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MusicGenUnavailableError";
  }
}

/** The setup instruction, shared by the reply and the thrown error. */
export const MUSICGEN_SETUP_HINT =
  "the music model isn't installed on my host. Run `scripts/setup-music.sh` to fetch it.";

/**
 * Whether `/music-ai` can run at all.
 *
 * The script and the weights are checked; the Bun binary is not, because the
 * process doing the checking is Bun.
 * @returns True when the script and every model file are in place
 */
export const isMusicGenConfigured = (): boolean =>
  existsSync(musicGenScript()) && musicGenModelFiles().every(existsSync);

export type MusicRequest = {
  /** What to generate. Written to stdin, never an argument. */
  prompt: string;
  /** Directory to write the wav into, normally the job workspace. */
  outputDir: string;
  /** Output filename without extension. */
  outputBase: string;
  /** Seconds of audio, clamped to `MAX_MUSIC_SECONDS`. */
  seconds?: number;
  /**
   * Sampling seed.
   *
   * Worth setting and worth reporting: generation is stochastic, so the same
   * prompt twice is two different pieces, and without the seed a good one
   * cannot be asked for again.
   */
  seed?: number;
  timeoutMs: number;
};

/**
 * How long a request will take, near enough to tell someone.
 *
 * A large flat term for the model load plus a modest per-second one, fitted
 * to the *slower* of the runs in `MAX_MUSIC_SECONDS` rather than the mean.
 * That is deliberate. The spread between two identical requests is wider than
 * the difference between 5 and 15 seconds of audio, so there is no honest
 * precision to be had here - and of the two ways to be wrong, finishing early
 * is the one nobody complains about.
 *
 * Used to set expectations in the reply, not to enforce anything. The timeout
 * is the real limit.
 * @param seconds Requested length of audio
 * @returns Rough wall-clock seconds, erring long
 */
export const estimateGenerationSeconds = (seconds: number): number =>
  Math.round(17 + 3.4 * seconds);

/**
 * Assembles the argument list for `scripts/musicgen.ts`.
 *
 * Split out from the run so the flags can be asserted on in tests without
 * loading 630MB of weights - the same reason `buildTtsArgs` is separate.
 * @param request The generation to build
 * @returns The output path and the arguments to run it
 */
export const buildMusicGenArgs = (
  request: MusicRequest,
): { outputPath: string; args: string[] } => {
  const outputPath = join(request.outputDir, `${request.outputBase}.wav`);

  // Clamped rather than validated, because the command already constrains the
  // option and this is the backstop for everything else that calls it.
  const seconds = Math.min(
    Math.max(request.seconds ?? DEFAULT_MUSIC_SECONDS, 1),
    MAX_MUSIC_SECONDS,
  );

  const args = [
    musicGenScript(),
    "--model-dir",
    musicGenModelDir(),
    "--out",
    outputPath,
    "--seconds",
    String(seconds),
    "--guidance",
    String(GUIDANCE_SCALE),
  ];

  if (request.seed !== undefined) {
    args.push("--seed", String(request.seed));
  }

  return { outputPath, args };
};

/**
 * Paths the sandbox has to expose for the generation to start.
 *
 * Three, and none of them optional. Bun's own directory; the model directory;
 * and the repo, because the script imports `@huggingface/transformers` and
 * onnxruntime's native library out of `node_modules`. All read-only, and none
 * of them reachable through `$HOME` - that does not exist inside the
 * container.
 * @returns Directories to mount read-only
 */
export const musicGenReadOnlyPaths = (): string[] => [
  dirname(bunBinary()),
  musicGenModelDir(),
  resolve(moduleDir(), "../.."),
];

/**
 * Generates music.
 * @param request The generation to run
 * @returns The path and size of the wav produced
 * @throws MusicGenUnavailableError when the model is not installed
 * @throws ProcessError when generation fails or runs past the timeout
 */
export const generateMusic = async (
  request: MusicRequest,
): Promise<{ path: string; bytes: number }> => {
  if (!isMusicGenConfigured()) {
    throw new MusicGenUnavailableError(MUSICGEN_SETUP_HINT);
  }

  const { outputPath, args } = buildMusicGenArgs(request);

  await runProcess(bunBinary(), args, {
    timeoutMs: request.timeoutMs,
    cwd: request.outputDir,
    stdin: request.prompt,
    // No network. Everything it reads is on disk, and denying it is also what
    // guarantees a missing weight file fails here rather than quietly
    // downloading 630MB in the middle of an interaction.
    sandbox: {
      workDir: request.outputDir,
      network: false,
      readOnlyPaths: musicGenReadOnlyPaths(),
    },
  });

  return { path: outputPath, bytes: await fileSize(outputPath) };
};
