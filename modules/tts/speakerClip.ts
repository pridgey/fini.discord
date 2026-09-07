import { copyFile } from "fs/promises";
import { extname, join } from "path";
import { runProcess } from "../media/runProcess";
import { fileSize } from "../media/workspace";

/**
 * Turns whatever audio we were given into the reference clip `llama-tts` wants.
 *
 * Two jobs, and the second is the important one.
 *
 * The obvious job is format: Qwen3-TTS conditions on a short mono clip, and the
 * library samples run to two and a half minutes of 22kHz stereo. Handing it all
 * of that is slower and no better - the voice is established in the first few
 * seconds.
 *
 * The job worth spelling out is that this is where a user-uploaded clip stops
 * being hostile input. `llama-tts` decodes audio through miniaudio, which is
 * not a hardened decoder and is linked into the same process as the model
 * weights. Normalising through ffmpeg first means the file `llama-tts` opens is
 * always one ffmpeg just wrote - re-encoded PCM, not attacker bytes - and
 * ffmpeg does that decode inside bubblewrap where a crash costs nothing. The
 * uploaded file is copied into the job workspace before this runs, so ffmpeg
 * needs no read access outside its own sandbox.
 */

/**
 * How much reference audio to keep.
 *
 * Ten seconds is comfortably past where the timbre is established and well
 * inside what the model's conditioning window uses. Longer clips measurably
 * cost prompt-eval time without changing the voice.
 */
export const REFERENCE_SECONDS = 10;

/**
 * Sample rate for the reference.
 *
 * 24kHz because that is what the model generates at, so anything higher is
 * resampled away inside the pipeline anyway.
 */
export const REFERENCE_SAMPLE_RATE = 24_000;

/** Filename of the normalised clip inside the workspace. */
const REFERENCE_NAME = "speaker.wav";

/**
 * Copies a preset sample into the job workspace.
 *
 * The samples live outside the workspace, and the ffmpeg sandbox can only read
 * what is bound into it. Copying with the bot's own file handle - a trusted
 * read of a file we shipped - is cheaper than widening ffmpeg's mounts to
 * include the whole voice library.
 * @param samplePath Absolute path to the library sample
 * @param workDir The job's workspace
 * @returns Path to the copy, inside the workspace
 */
export const stageVoiceSample = async (
  samplePath: string,
  workDir: string,
): Promise<string> => {
  // The extension is kept because a few demuxers are picked by it rather than
  // by content sniffing.
  const staged = join(workDir, `reference${extname(samplePath).toLowerCase()}`);
  await copyFile(samplePath, staged);

  return staged;
};

/**
 * Builds the ffmpeg arguments for the normalisation pass.
 *
 * Split out from the run so a test can assert on the trim and the channel
 * layout without encoding anything.
 * @param input Path to the staged clip, inside the workspace
 * @param outputPath Where the normalised wav goes
 * @returns ffmpeg arguments
 */
export const buildSpeakerClipArgs = (
  input: string,
  outputPath: string,
): string[] => [
  "-hide_banner",
  "-nostdin",
  "-y",
  "-loglevel",
  "warning",
  // Same reasoning as `probeMedia`: a crafted container can name remote
  // resources, and this is the backstop for when bubblewrap is unavailable.
  "-protocol_whitelist",
  "file,crypto,data",
  "-i",
  input,
  // `-t` after the input, so the trim is measured from the start of the
  // decoded stream rather than from a container seek.
  "-t",
  String(REFERENCE_SECONDS),
  // A stereo reference gets downmixed inside the pipeline; doing it here means
  // the file on disk is what the model actually conditions on.
  "-ac",
  "1",
  "-ar",
  String(REFERENCE_SAMPLE_RATE),
  // Drop any cover art. An mp3 with an embedded image otherwise makes ffmpeg
  // try to write a video stream into a wav and fail.
  "-vn",
  "-c:a",
  "pcm_s16le",
  outputPath,
];

/**
 * Normalises a clip in the workspace into the model's reference format.
 * @param input Path to the staged clip, inside the workspace
 * @param workDir The job's workspace, also where the result is written
 * @param timeoutMs Hard cap on the ffmpeg pass
 * @returns Path to the normalised wav and its size
 * @throws ProcessError when the clip cannot be decoded at all
 */
export const prepareSpeakerClip = async (
  input: string,
  workDir: string,
  timeoutMs: number,
): Promise<{ path: string; bytes: number }> => {
  const outputPath = join(workDir, REFERENCE_NAME);

  await runProcess("ffmpeg", buildSpeakerClipArgs(input, outputPath), {
    timeoutMs,
    cwd: workDir,
    sandbox: { workDir, network: false },
  });

  return { path: outputPath, bytes: await fileSize(outputPath) };
};
