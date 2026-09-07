import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  REFERENCE_SAMPLE_RATE,
  REFERENCE_SECONDS,
  buildSpeakerClipArgs,
  prepareSpeakerClip,
  stageVoiceSample,
} from "../../modules/tts/speakerClip";
import { runProcess } from "../../modules/media/runProcess";
import { probeMedia } from "../../modules/media/probeMedia";

/**
 * The normalisation pass is where a user-uploaded clip stops being hostile
 * input, so this runs it for real against generated audio rather than only
 * asserting on flags: what matters is that the file `llama-tts` ends up opening
 * is mono, at the model's rate, and no longer than the reference window.
 */

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fini-clip-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Generates a tone of the given length, so there is something real to trim. */
const makeTone = async (
  name: string,
  seconds: number,
  extra: string[] = [],
): Promise<string> => {
  const path = join(dir, name);

  await runProcess(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${seconds}`,
      ...extra,
      path,
    ],
    { timeoutMs: 30_000, cwd: dir },
  );

  return path;
};

describe("buildSpeakerClipArgs", () => {
  it("trims to the reference window and downmixes to the model's rate", () => {
    const args = buildSpeakerClipArgs(
      "/tmp/job/reference.mp3",
      "/tmp/job/s.wav",
    );

    expect(args.slice(args.indexOf("-t"), args.indexOf("-t") + 2)).toEqual([
      "-t",
      String(REFERENCE_SECONDS),
    ]);
    expect(args.slice(args.indexOf("-ac"), args.indexOf("-ac") + 2)).toEqual([
      "-ac",
      "1",
    ]);
    expect(args.slice(args.indexOf("-ar"), args.indexOf("-ar") + 2)).toEqual([
      "-ar",
      String(REFERENCE_SAMPLE_RATE),
    ]);
  });

  it("trims after the input, so the length is measured from decoded audio", () => {
    const args = buildSpeakerClipArgs(
      "/tmp/job/reference.mp3",
      "/tmp/job/s.wav",
    );

    expect(args.indexOf("-t")).toBeGreaterThan(args.indexOf("-i"));
  });

  it("refuses non-local protocols and drops any cover art", () => {
    const args = buildSpeakerClipArgs(
      "/tmp/job/reference.mp3",
      "/tmp/job/s.wav",
    );

    // A crafted container can name remote resources; this is the backstop for
    // a host without bubblewrap.
    expect(args).toContain("-protocol_whitelist");
    expect(args).toContain("file,crypto,data");
    // An mp3 with embedded artwork otherwise makes ffmpeg try to write a video
    // stream into a wav, which fails outright.
    expect(args).toContain("-vn");
  });
});

describe("stageVoiceSample", () => {
  it("copies a sample into the workspace, keeping its extension", async () => {
    const sample = await makeTone("library.mp3", 1);
    const staged = await stageVoiceSample(sample, dir);

    // ffmpeg runs sandboxed with only the workspace mounted, so the sample has
    // to be inside it before the normalisation pass can read it.
    expect(staged).toBe(join(dir, "reference.mp3"));
    expect(await Bun.file(staged).exists()).toBe(true);
  });
});

describe("prepareSpeakerClip", () => {
  it("cuts a long clip down to the reference window", async () => {
    const long = await makeTone("long.wav", REFERENCE_SECONDS + 8);
    const prepared = await prepareSpeakerClip(long, dir, 60_000);
    const probe = await probeMedia(prepared.path);

    expect(probe.durationSeconds).toBeCloseTo(REFERENCE_SECONDS, 1);
  });

  it("leaves a clip shorter than the window alone", async () => {
    const short = await makeTone("short.wav", 3);
    const prepared = await prepareSpeakerClip(short, dir, 60_000);
    const probe = await probeMedia(prepared.path);

    expect(probe.durationSeconds).toBeCloseTo(3, 1);
  });

  it("produces mono audio at the model's sample rate", async () => {
    const stereo = await makeTone("stereo.wav", 2, [
      "-ac",
      "2",
      "-ar",
      "44100",
    ]);
    const prepared = await prepareSpeakerClip(stereo, dir, 60_000);

    const { stdout } = await runProcess(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=channels,sample_rate",
        "-of",
        "default=nw=1",
        prepared.path,
      ],
      { timeoutMs: 30_000, cwd: dir },
    );

    expect(stdout).toContain("channels=1");
    expect(stdout).toContain(`sample_rate=${REFERENCE_SAMPLE_RATE}`);
  });

  it("converts a compressed upload rather than passing it through", async () => {
    const mp3 = await makeTone("upload.mp3", 2);
    const prepared = await prepareSpeakerClip(mp3, dir, 60_000);
    const probe = await probeMedia(prepared.path);

    // The point of the pass: what llama-tts opens is PCM ffmpeg just wrote,
    // not the bytes someone uploaded.
    expect(prepared.path.endsWith(".wav")).toBe(true);
    expect(probe.hasAudio).toBe(true);
  });

  it("fails loudly on something that is not audio at all", async () => {
    const junk = join(dir, "reference.wav");
    await writeFile(junk, "this is not a wav file");

    expect(prepareSpeakerClip(junk, dir, 30_000)).rejects.toThrow();
  });
});
