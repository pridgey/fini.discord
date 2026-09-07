import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { runProcess } from "../media/runProcess";
import { fileSize } from "../media/workspace";

/**
 * The `llama-tts` half of `/tts`.
 *
 * `llama-tts` is a one-shot CLI, not a server: it loads the model, speaks the
 * prompt, writes a wav and exits. That is why this runs per invocation rather
 * than alongside the `llama serve` process in `npm start` - the ~4s of load
 * time is real but it buys back two gigabytes of resident memory between
 * invocations, on a box with 16GB that is already running pocketbase, the chat
 * model, and ffmpeg.
 *
 * Everything is passed as an argument array through `runProcess`, so the
 * prompt - which is arbitrary user text - never reaches a shell.
 */

/**
 * Frames the codec emits per second of audio.
 *
 * The model is named "12Hz" but the real figure is 24000/1920 = 12.5, which is
 * what a generation of 33 frames producing 2.64s of audio works out at. It
 * matters because `-n` is the only hard cap on how long a generation runs, and
 * the low estimate is the safe one: it caps slightly late rather than cutting
 * a sentence short.
 */
export const FRAMES_PER_SECOND = 12.5;

/**
 * Longest utterance the bot will generate.
 *
 * Generation runs at roughly 0.3x realtime on CPU here, so two minutes of
 * speech is about seven minutes of compute - which is the most that fits in the
 * job budget with room left to encode and upload the result. The text length
 * cap on the command is the real limit in practice; this is the backstop for a
 * model that will not stop talking.
 */
export const MAX_SPEECH_SECONDS = 120;

/**
 * Languages the model was trained on.
 *
 * Offered as choices rather than a free string because `--tts-lang` silently
 * accepts anything and an unsupported tag produces confidently wrong
 * pronunciation rather than an error.
 */
export const TTS_LANGUAGES = [
  { name: "English", value: "en" },
  { name: "Chinese", value: "zh" },
  { name: "German", value: "de" },
  { name: "Italian", value: "it" },
  { name: "Portuguese", value: "pt" },
  { name: "Spanish", value: "es" },
  { name: "Japanese", value: "ja" },
  { name: "Korean", value: "ko" },
  { name: "French", value: "fr" },
  { name: "Russian", value: "ru" },
];

/** The model's own default, and what the command falls back to. */
export const DEFAULT_LANGUAGE = "en";

/**
 * Whether a language tag is one the model handles.
 * @param value The tag from the interaction
 * @returns True when the model was trained on it
 */
export const isSupportedLanguage = (value: string | undefined): boolean =>
  TTS_LANGUAGES.some((language) => language.value === value);

/**
 * Path to the `llama-tts` executable.
 *
 * Defaults to the name alone so a PATH install works, but in practice this is
 * set: the llama.cpp release tarball is not something a package manager puts on
 * PATH, and the binary has to stay next to its `libggml-*.so` siblings.
 * @returns The configured executable path
 */
export const llamaTtsBinary = (): string =>
  process.env.FINI_LLAMA_TTS_BIN || "llama-tts";

/**
 * Directory holding the two GGUF files.
 *
 * A directory of our own with fixed filenames, rather than reading the Hugging
 * Face cache in place: those paths contain the snapshot commit hash, so they
 * change whenever the repo is re-pulled, and pointing the sandbox at the whole
 * cache would also hand `llama-tts` the chat model's weights.
 * @returns The configured model directory
 */
export const ttsModelDir = (): string =>
  process.env.FINI_TTS_MODEL_DIR || join(homedir(), ".local/share/fini-tts");

export type TtsModelPaths = {
  /** The Qwen3-TTS backbone. */
  model: string;
  /**
   * The audio codec, in mtmd projector form.
   *
   * Qwen3-TTS is a multimodal model whose output modality is audio, so the
   * thing that turns tokens into samples arrives as an mmproj rather than as a
   * separate vocoder argument the way OuteTTS's WavTokenizer did.
   */
  mmproj: string;
};

/**
 * The model files, by convention within the model directory.
 * @returns Absolute paths to the backbone and the codec
 */
export const ttsModelPaths = (): TtsModelPaths => {
  const dir = ttsModelDir();

  return { model: join(dir, "model.gguf"), mmproj: join(dir, "mmproj.gguf") };
};

/**
 * Raised when the binary or the weights are not installed.
 *
 * Its own error type because the reply for it is a setup instruction, not the
 * tail of a process failure - `/tts` on a fresh checkout is a configuration
 * problem, and saying "llama-tts exited with null" sends whoever reads the log
 * looking for a bug instead of a download.
 */
export class TtsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsUnavailableError";
  }
}

/**
 * Whether `/tts` can run at all.
 *
 * A missing PATH lookup cannot be checked without spawning, so a bare
 * `llama-tts` is assumed present and left to fail at spawn time; an explicit
 * path is checked, because a typo in `.env` is the likely cause.
 * @returns True when the binary and both model files are in place
 */
export const isTtsConfigured = (): boolean => {
  const binary = llamaTtsBinary();
  const { model, mmproj } = ttsModelPaths();

  return (
    (!binary.includes("/") || existsSync(binary)) &&
    existsSync(model) &&
    existsSync(mmproj)
  );
};

/** The setup instruction, shared by the reply and the thrown error. */
export const TTS_SETUP_HINT =
  "the TTS model isn't installed on my host. Run `scripts/setup-tts.sh` to fetch it.";

export type TtsRequest = {
  /** What to say. Passed as one argument, never through a shell. */
  text: string;
  /** Directory to write the wav into, normally the job workspace. */
  outputDir: string;
  /** Output filename without extension. */
  outputBase: string;
  /**
   * Reference clip to clone, already normalised by `prepareSpeakerClip`.
   * Omit to use the model's own default voice.
   */
  speakerFile?: string;
  /** ISO 639-1 tag; the model defaults to English without it. */
  language?: string;
  /** Cap on generated audio length, defaulting to `MAX_SPEECH_SECONDS`. */
  maxSeconds?: number;
  timeoutMs: number;
};

/**
 * Assembles the `llama-tts` argument list.
 *
 * Exported separately from the run so the flags can be asserted on in tests
 * without loading two gigabytes of weights.
 * @param request The generation to build
 * @returns The output path and the arguments to run it
 */
export const buildTtsArgs = (
  request: TtsRequest,
): { outputPath: string; args: string[] } => {
  const { model, mmproj } = ttsModelPaths();
  const outputPath = join(request.outputDir, `${request.outputBase}.wav`);
  const maxSeconds = Math.min(
    request.maxSeconds ?? MAX_SPEECH_SECONDS,
    MAX_SPEECH_SECONDS,
  );

  const args = [
    "-m",
    model,
    "-mm",
    mmproj,
    // Explicit paths mean no Hugging Face lookup, so this stays true; without
    // it a transient network hiccup on a cache check would fail a generation
    // that needed nothing from the network.
    "--offline",
    // `-e` is the default, which would turn a user typing "\n" into a real
    // newline and a lone backslash into a parse quirk. The prompt is meant to
    // be read out literally.
    "--no-escape",
    // Frame-level progress buries the one line that says what broke.
    "-lv",
    "2",
    "-n",
    String(Math.round(maxSeconds * FRAMES_PER_SECOND)),
    "-o",
    outputPath,
  ];

  if (request.speakerFile) {
    args.push("--tts-speaker-file", request.speakerFile);
  }

  if (isSupportedLanguage(request.language)) {
    args.push("--tts-lang", request.language!);
  }

  // Last, so the prompt is never mistaken for a flag's value while reading a
  // failing command back out of the logs.
  args.push("-p", request.text);

  return { outputPath, args };
};

/**
 * Paths the sandbox has to expose for `llama-tts` to start.
 *
 * The binary's own directory because the release tarball resolves
 * `libggml-*.so` and `libmtmd.so` relative to it, and the model directory
 * because the weights are read on every invocation. Both read-only, and
 * neither is under `$HOME` inside the container - `$HOME` does not exist there.
 * @returns Directories to mount read-only
 */
export const ttsReadOnlyPaths = (): string[] => {
  const binary = llamaTtsBinary();

  return [...(binary.includes("/") ? [dirname(binary)] : []), ttsModelDir()];
};

/**
 * Generates speech.
 * @param request The generation to run
 * @returns The path and size of the wav produced
 * @throws TtsUnavailableError when the model is not installed
 * @throws ProcessError when generation fails or runs past the timeout
 */
export const synthesizeSpeech = async (
  request: TtsRequest,
): Promise<{ path: string; bytes: number }> => {
  if (!isTtsConfigured()) {
    throw new TtsUnavailableError(TTS_SETUP_HINT);
  }

  const { outputPath, args } = buildTtsArgs(request);

  await runProcess(llamaTtsBinary(), args, {
    timeoutMs: request.timeoutMs,
    cwd: request.outputDir,
    // No network: the model is on disk and `--offline` says so. It decodes a
    // reference clip through miniaudio in the same process as the weights,
    // which is reason enough to confine it even though the clip was re-encoded
    // by ffmpeg first.
    sandbox: {
      workDir: request.outputDir,
      network: false,
      readOnlyPaths: ttsReadOnlyPaths(),
    },
  });

  return { path: outputPath, bytes: await fileSize(outputPath) };
};
