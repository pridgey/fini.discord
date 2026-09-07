import { copyFile } from "fs/promises";
import { extname, join } from "path";
import { runProcess } from "../media/runProcess";
import { fileSize } from "../media/workspace";

/**
 * Turns whatever audio we were given into the reference clip `qwen-tts` wants.
 *
 * Two jobs, and the second is the important one.
 *
 * The obvious job is format: the model conditions on a mono 24kHz clip, and an
 * upload can be anything ffmpeg reads - a stereo 48kHz phone recording, an mp3
 * with cover art in it, a five minute song.
 *
 * The job worth spelling out is that this is where a user-uploaded clip stops
 * being hostile input. Both `qwen-tts` and whisper decode audio in the same
 * process as a set of model weights, and neither is a hardened decoder.
 * Normalising through ffmpeg first means the file they open is always one
 * ffmpeg just wrote - re-encoded PCM, not attacker bytes - and ffmpeg does
 * that decode inside bubblewrap where a crash costs nothing. The uploaded file
 * is copied into the job workspace before this runs, so ffmpeg needs no read
 * access outside its own sandbox.
 */

/**
 * How much reference audio to keep.
 *
 * Ten seconds was right when the reference was only ever collapsed into a
 * speaker embedding: timbre is established well inside that, and the rest was
 * prompt-eval time spent on nothing. In-context conditioning reads the clip as
 * an example instead, so the extra seconds are extra example - the upstream
 * cloning sample ships a 17 second reference, and the preset clips here run to
 * 25.
 *
 * Thirty is a cap on the clip rather than a target for it. It bounds how much
 * codec context a generation carries, which matters because that context is
 * prefilled on every invocation, and it is comfortably past every clip we
 * ship.
 */
export const REFERENCE_SECONDS = 30;

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

/** Filename of the staged preset transcript inside the workspace. */
const STAGED_TRANSCRIPT_NAME = "reference.txt";

/**
 * Copies a preset's transcript into the job workspace.
 *
 * Same reason as the clip: `qwen-tts` is sandboxed with only the workspace
 * writable and the binary and weights mounted read-only, so `clips/` is not
 * visible to it. Copying the one file the job needs is cheaper than mounting
 * the library into every generation.
 * @param transcriptPath Absolute path to the shipped transcript
 * @param workDir The job's workspace
 * @returns Path to the copy, inside the workspace
 */
export const stageVoiceTranscript = async (
  transcriptPath: string,
  workDir: string,
): Promise<string> => {
  const staged = join(workDir, STAGED_TRANSCRIPT_NAME);
  await copyFile(transcriptPath, staged);

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
