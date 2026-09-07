import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { runProcess } from "../media/runProcess";
import { fileSize } from "../media/workspace";

/**
 * The `qwen-tts` half of `/tts`.
 *
 * Qwen3-TTS Base can be conditioned on a reference clip two ways, and the
 * difference between them is most of what `/tts` sounds like:
 *
 *   x-vector    the clip is collapsed into one 2048-dim speaker embedding
 *   in-context  the clip's codec frames AND a transcript of it go in the
 *               prompt, so the model reads a real example before speaking
 *
 * An x-vector carries roughly "adult man, measured" - enough that a generic
 * voice comes back sounding right, and nowhere near enough for GLaDOS or Goku,
 * whose character is structure over time rather than a point in timbre space.
 * In-context conditioning is the one that captures those, which is why this
 * runs `qwen-tts` rather than llama.cpp's `llama-tts`: the latter has only
 * `--tts-speaker-file` and no way to pass a transcript, so it can only ever
 * drive the weaker half.
 *
 * Both are still here. A transcript is something we ship next to the preset
 * clips and transcribe for an upload, and when transcription comes back empty
 * the reference is passed without one - which degrades to exactly the
 * x-vector-only voice the command used to have, rather than failing.
 *
 * The prompt is arbitrary user text and reaches the process on stdin, so it is
 * never an argv element and there is no shell anywhere in the path.
 */

/**
 * Frames the codec emits per second of audio.
 *
 * The model is named "12Hz" but the real figure is 24000/1920 = 12.5. It
 * matters because `--max-new` is the only hard cap on how long a generation
 * runs, and the low estimate is the safe one: it caps slightly late rather
 * than cutting a sentence short.
 */
export const FRAMES_PER_SECOND = 12.5;

/**
 * Longest utterance the bot will generate.
 *
 * Generation runs at about 0.37x realtime on CPU here, so two minutes of
 * speech is over five minutes of compute - the most that fits in the job
 * budget with room left to encode and upload. The text length cap on the
 * command is the real limit in practice; this is the backstop for a model that
 * will not stop talking.
 */
export const MAX_SPEECH_SECONDS = 120;

/**
 * Languages the model was trained on.
 *
 * `value` stays an ISO 639-1 tag because that is what the slash command has
 * always sent and what a caller would expect to pass; `qwen-tts` wants the
 * English name of the language instead, which `languageLabel` handles. The
 * names are the keys of `codec_language_id` in the checkpoint config, and an
 * unknown one is a hard error inside the model rather than a silent fallback -
 * so the mapping has to stay exact.
 */
export const TTS_LANGUAGES = [
  { name: "English", value: "en", label: "english" },
  { name: "Chinese", value: "zh", label: "chinese" },
  { name: "German", value: "de", label: "german" },
  { name: "Italian", value: "it", label: "italian" },
  { name: "Portuguese", value: "pt", label: "portuguese" },
  { name: "Spanish", value: "es", label: "spanish" },
  { name: "Japanese", value: "ja", label: "japanese" },
  { name: "Korean", value: "ko", label: "korean" },
  { name: "French", value: "fr", label: "french" },
  { name: "Russian", value: "ru", label: "russian" },
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
 * The name `qwen-tts` knows a language by.
 * @param value An ISO 639-1 tag
 * @returns The model's own name for it, or undefined if it does not have one
 */
export const languageLabel = (value: string | undefined): string | undefined =>
  TTS_LANGUAGES.find((language) => language.value === value)?.label;

/**
 * Path to the `qwen-tts` executable.
 *
 * Defaults to the name alone so a PATH install works, but in practice this is
 * set: qwentts.cpp has no packaged release, so `scripts/setup-tts.sh` builds
 * it, and the binary has to stay next to its `libggml-*.so` siblings.
 * @returns The configured executable path
 */
export const qwenTtsBinary = (): string =>
  process.env.FINI_QWEN_TTS_BIN || "qwen-tts";

/**
 * Directory holding the two GGUF files.
 *
 * A directory of our own with fixed filenames, rather than reading the Hugging
 * Face cache in place: those paths contain the snapshot commit hash, so they
 * change whenever the repo is re-pulled, and pointing the sandbox at the whole
 * cache would also hand `qwen-tts` the chat model's weights.
 * @returns The configured model directory
 */
export const ttsModelDir = (): string =>
  process.env.FINI_TTS_MODEL_DIR || join(homedir(), ".local/share/fini-tts");

export type TtsModelPaths = {
  /** The talker: Qwen3 LM, code predictor head, and the speaker encoder. */
  talker: string;
  /**
   * The codec, which the upstream project calls the tokenizer.
   *
   * Both directions live in here - it encodes the reference clip into the RVQ
   * frames that in-context conditioning puts in the prompt, and decodes
   * generated frames into samples. The decode is the single most expensive
   * stage of a generation.
   */
  codec: string;
};

/**
 * The model files, by convention within the model directory.
 * @returns Absolute paths to the talker and the codec
 */
export const ttsModelPaths = (): TtsModelPaths => {
  const dir = ttsModelDir();

  return { talker: join(dir, "talker.gguf"), codec: join(dir, "codec.gguf") };
};

/**
 * Raised when the binary or the weights are not installed.
 *
 * Its own error type because the reply for it is a setup instruction, not the
 * tail of a process failure - `/tts` on a fresh checkout is a configuration
 * problem, and saying "qwen-tts exited with null" sends whoever reads the log
 * looking for a bug instead of a build.
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
 * `qwen-tts` is assumed present and left to fail at spawn time; an explicit
 * path is checked, because a typo in `.env` is the likely cause.
 * @returns True when the binary and both model files are in place
 */
export const isTtsConfigured = (): boolean => {
  const binary = qwenTtsBinary();
  const { talker, codec } = ttsModelPaths();

  return (
    (!binary.includes("/") || existsSync(binary)) &&
    existsSync(talker) &&
    existsSync(codec)
  );
};

/** The setup instruction, shared by the reply and the thrown error. */
export const TTS_SETUP_HINT =
  "the TTS model isn't installed on my host. Run `scripts/setup-tts.sh` to build it.";

export type TtsRequest = {
  /** What to say. Written to stdin, never an argument and never through a shell. */
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
  /**
   * File holding a transcript of `speakerFile`, which turns on in-context
   * conditioning. Omit to fall back to the x-vector-only voice.
   *
   * A path rather than the text itself because `qwen-tts` takes it as
   * `--ref-text <file>`, and stdin is already carrying the prompt.
   */
  speakerTextFile?: string;
  /** ISO 639-1 tag; the model decides for itself without one. */
  language?: string;
  /** Cap on generated audio length, defaulting to `MAX_SPEECH_SECONDS`. */
  maxSeconds?: number;
  /**
   * Sampling seed.
   *
   * Worth setting and worth reporting: generation is stochastic, so the same
   * request twice is two different takes, and without the seed a good one
   * cannot be asked for again.
   */
  seed?: number;
  timeoutMs: number;
};

/**
 * Assembles the `qwen-tts` argument list.
 *
 * Exported separately from the run so the flags can be asserted on in tests
 * without loading two gigabytes of weights.
 *
 * Nothing here sets a sampling parameter. `qwen-tts` already defaults to the
 * checkpoint's own `generation_config.json` - temperature 0.9, top-k 50, top-p
 * 1.0, and the same again for the code predictor - so passing them would only
 * be a chance to drift away from it. This is worth knowing before adding a
 * flag: `llama-tts` inherited llama.cpp's generic text defaults instead
 * (temperature 0.8, top-k 40, top-p 0.95, and a min-p of 0.05 that the
 * reference config does not use at all), and every one of those was wrong.
 * @param request The generation to build
 * @returns The output path and the arguments to run it
 */
export const buildTtsArgs = (
  request: TtsRequest,
): { outputPath: string; args: string[] } => {
  const { talker, codec } = ttsModelPaths();
  const outputPath = join(request.outputDir, `${request.outputBase}.wav`);
  const maxSeconds = Math.min(
    request.maxSeconds ?? MAX_SPEECH_SECONDS,
    MAX_SPEECH_SECONDS,
  );

  const args = [
    "--model",
    talker,
    "--codec",
    codec,
    "--max-new",
    String(Math.round(maxSeconds * FRAMES_PER_SECOND)),
    "-o",
    outputPath,
  ];

  if (request.speakerFile) {
    args.push("--ref-wav", request.speakerFile);

    // Only meaningful alongside a clip, and only as a pair with it: a
    // transcript of nothing would be a transcript of the model's default
    // voice, which is not a thing that exists.
    if (request.speakerTextFile) {
      args.push("--ref-text", request.speakerTextFile);
    }
  }

  const label = languageLabel(request.language);
  if (label) {
    args.push("--lang", label);
  }

  if (request.seed !== undefined) {
    args.push("--seed", String(request.seed));
  }

  return { outputPath, args };
};

/**
 * Paths the sandbox has to expose for `qwen-tts` to start.
 *
 * The binary's own directory because the build resolves `libggml-*.so`
 * relative to it, and the model directory because the weights are read on
 * every invocation. Both read-only, and neither is under `$HOME` inside the
 * container - `$HOME` does not exist there.
 * @returns Directories to mount read-only
 */
export const ttsReadOnlyPaths = (): string[] => {
  const binary = qwenTtsBinary();

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

  await runProcess(qwenTtsBinary(), args, {
    timeoutMs: request.timeoutMs,
    cwd: request.outputDir,
    stdin: request.text,
    // No network: everything it reads is on disk. It decodes a reference clip
    // in the same process as the model weights, which is reason enough to
    // confine it even though the clip was re-encoded by ffmpeg first.
    sandbox: {
      workDir: request.outputDir,
      network: false,
      readOnlyPaths: ttsReadOnlyPaths(),
    },
  });

  return { path: outputPath, bytes: await fileSize(outputPath) };
};
