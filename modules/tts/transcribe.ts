import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";
import { runProcess } from "../media/runProcess";

/**
 * Transcribing a reference clip, so an uploaded voice can use the good half of
 * the model.
 *
 * In-context conditioning needs the words the reference clip says, not just
 * the audio. The preset clips ship a transcript next to them, but an upload
 * arrives as audio and nothing else - and it is uploads, not presets, that
 * people use the command for. Without this every uploaded clip would be stuck
 * on x-vector-only conditioning, which is the thing that made distinctive
 * voices come back sounding generic.
 *
 * whisper.cpp rather than a hosted API for the same reason the rest of this
 * runs locally: a reference clip is someone's voice, and a job that already
 * has no network should not grow one.
 *
 * This is best-effort by design. Every failure - no model installed, a clip
 * with no speech in it, a crash - returns undefined rather than throwing, and
 * the caller carries on without a transcript. The cost of that is the older,
 * worse voice; the cost of throwing would be no audio at all.
 */

/**
 * Path to the `whisper-cli` executable.
 *
 * Defaults to the name alone so a PATH install works. Unset is a supported
 * state: `/tts` runs without transcription, just not as well.
 * @returns The configured executable path
 */
export const whisperBinary = (): string =>
  process.env.FINI_WHISPER_BIN || "whisper-cli";

/**
 * Path to the ggml whisper model.
 * @returns The configured model path
 */
export const whisperModel = (): string =>
  process.env.FINI_WHISPER_MODEL ||
  join(homedir(), ".local/share/whisper.cpp/models/ggml-small.en.bin");

/**
 * Whether a clip can be transcribed at all.
 *
 * Checked before running rather than after failing, because "no transcript"
 * is a normal outcome that changes which conditioning path is used, and
 * deciding that up front keeps it out of the error handling.
 * @returns True when the binary and the model are both in place
 */
export const isTranscriptionConfigured = (): boolean => {
  const binary = whisperBinary();

  return (
    (!binary.includes("/") || existsSync(binary)) && existsSync(whisperModel())
  );
};

/**
 * Sample rate whisper works at.
 *
 * Its own constant rather than the reference clip's 24kHz: whisper resamples
 * anything else internally, and giving it the rate it wants keeps that out of
 * the measurement when a transcription is slow.
 */
export const TRANSCRIBE_SAMPLE_RATE = 16_000;

/** Filenames inside the workspace, kept apart from the reference clip's. */
const TRANSCRIBE_INPUT = "transcribe.wav";
const TRANSCRIBE_OUTPUT = "reference-text";

/**
 * Builds the ffmpeg arguments that put a clip into whisper's format.
 *
 * A second pass over audio ffmpeg already normalised, rather than one pass
 * producing both: the reference clip has to stay at the model's own 24kHz, and
 * resampling it down to 16k and back would cost quality on the half of the job
 * that matters more.
 * @param input Path to the normalised reference clip
 * @param outputPath Where the 16kHz copy goes
 * @returns ffmpeg arguments
 */
export const buildTranscribeInputArgs = (
  input: string,
  outputPath: string,
): string[] => [
  "-hide_banner",
  "-nostdin",
  "-y",
  "-loglevel",
  "warning",
  "-i",
  input,
  "-ac",
  "1",
  "-ar",
  String(TRANSCRIBE_SAMPLE_RATE),
  "-vn",
  "-c:a",
  "pcm_s16le",
  outputPath,
];

/**
 * Builds the `whisper-cli` argument list.
 *
 * `-nt` because the transcript goes into a prompt and timestamps would be read
 * as words to say. `-otxt` with `-of` rather than reading stdout, because
 * stdout carries the progress log as well as the text.
 * @param input Path to the 16kHz wav
 * @param outputBase Output path without the `.txt` whisper appends
 * @returns whisper arguments
 */
export const buildWhisperArgs = (
  input: string,
  outputBase: string,
): string[] => [
  "-m",
  whisperModel(),
  "-f",
  input,
  // No timestamps and no progress prints: the file should hold the words and
  // nothing else.
  "-nt",
  "-np",
  "-otxt",
  "-of",
  outputBase,
];

/**
 * Paths the sandbox has to expose for whisper to start.
 * @returns Directories to mount read-only
 */
export const transcribeReadOnlyPaths = (): string[] => {
  const binary = whisperBinary();

  return [
    ...(binary.includes("/") ? [dirname(binary)] : []),
    dirname(whisperModel()),
  ];
};

/**
 * Longest transcript worth keeping.
 *
 * A reference clip is seconds long, so anything past this is whisper looping
 * on silence rather than a transcript - a known failure mode, and one that
 * would put a wall of repeated text into the prompt.
 */
const MAX_TRANSCRIPT_CHARS = 2_000;

/**
 * Transcribes a normalised reference clip.
 *
 * Runs in the same sandbox as everything else. The input is a wav ffmpeg just
 * wrote, so whisper never decodes attacker bytes itself - which matters,
 * because this is another audio decoder in the same process as another set of
 * weights.
 * @param referenceClip Path to the normalised clip, inside the workspace
 * @param workDir The job's workspace, also where the transcript is written
 * @param timeoutMs Hard cap on both passes together
 * @returns Path to the transcript and its text, or undefined if there is none
 */
export const transcribeReference = async (
  referenceClip: string,
  workDir: string,
  timeoutMs: number,
): Promise<{ path: string; text: string } | undefined> => {
  if (!isTranscriptionConfigured()) return undefined;

  const started = Date.now();
  const remaining = () => timeoutMs - (Date.now() - started);

  const input = join(workDir, TRANSCRIBE_INPUT);
  const outputBase = join(workDir, TRANSCRIBE_OUTPUT);
  const outputPath = `${outputBase}.txt`;

  try {
    await runProcess("ffmpeg", buildTranscribeInputArgs(referenceClip, input), {
      timeoutMs: remaining(),
      cwd: workDir,
      sandbox: { workDir, network: false },
    });

    await runProcess(whisperBinary(), buildWhisperArgs(input, outputBase), {
      timeoutMs: remaining(),
      cwd: workDir,
      sandbox: {
        workDir,
        network: false,
        readOnlyPaths: transcribeReadOnlyPaths(),
      },
    });

    const text = normaliseTranscript(await readFile(outputPath, "utf8"));

    // A clip of music or silence transcribes to nothing, and an empty
    // `--ref-text` is rejected by `qwen-tts` outright. No transcript is the
    // right answer here, not an empty one.
    if (!text) return undefined;

    await writeFile(outputPath, text, "utf8");

    return { path: outputPath, text };
  } catch (err) {
    // Deliberately swallowed: a clip that cannot be transcribed can still be
    // spoken, just not as well, and the generation that follows is the part
    // worth failing the command over.
    console.warn("Could not transcribe the reference clip:", { err });

    return undefined;
  }
};

/**
 * Flattens whisper's output into the single line a prompt wants.
 * @param raw The contents of the `.txt` whisper wrote
 * @returns One line of text, capped, or an empty string if there was none
 */
export const normaliseTranscript = (raw: string): string =>
  raw.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_CHARS);
