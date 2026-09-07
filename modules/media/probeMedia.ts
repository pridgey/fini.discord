import { dirname } from "path";
import { runProcess } from "./runProcess";

/**
 * What ffprobe tells us about a file, reduced to the parts the commands act on.
 *
 * Probing before encoding is what lets every ffmpeg filter here be built from
 * concrete numbers instead of ffmpeg expressions. `scale=min(480\,iw):-2` and
 * friends need comma escaping inside a filter chain that is itself comma
 * delimited, and getting that wrong produces a filter ffmpeg parses as two
 * broken ones. Knowing the source dimensions up front avoids the whole class
 * of bug - and the duration is needed anyway to aim a bitrate at a file size.
 */

export type MediaProbe = {
  /** Seconds, or 0 when the container does not say (some streams). */
  durationSeconds: number;
  hasVideo: boolean;
  hasAudio: boolean;
  /** Pixels, 0 when there is no video stream. */
  width: number;
  height: number;
  /** Frames per second, 0 when unknown. */
  fps: number;
};

const PROBE_TIMEOUT_MS = 30_000;

/** Parses ffprobe's `30000/1001` style rationals. */
const parseFrameRate = (value: unknown): number => {
  if (typeof value !== "string") return 0;

  const [numerator, denominator] = value.split("/").map(Number);
  if (!numerator || !denominator) return 0;

  return numerator / denominator;
};

/**
 * Reads the streams and duration of a media file.
 * @param path Absolute path to the file
 * @param timeoutMs Optional cap, defaults to 30 seconds
 * @returns The probe result
 * @throws ProcessError if ffprobe cannot read the file at all
 */
export const probeMedia = async (
  path: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<MediaProbe> => {
  const { stdout } = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      // A container can name other resources - HLS playlists point at further
      // urls, and some demuxers will read sibling files. Whitelisting the
      // local protocols means a crafted upload cannot make ffprobe fetch
      // anything, which is the same hole `/ytdlp` had.
      "-protocol_whitelist",
      "file,crypto,data",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      path,
    ],
    { timeoutMs, sandbox: { workDir: dirname(path), network: false } },
  );

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: {
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      disposition?: { attached_pic?: number };
    }[];
  };

  const streams = parsed.streams ?? [];

  // Cover art in an mp3 is a video stream as far as ffprobe is concerned, and
  // treating it as one would let an mp3 pass the "has video" check that guards
  // converting to mp4 - producing a one-frame slideshow instead of an error.
  const video = streams.find(
    (stream) =>
      stream.codec_type === "video" && !stream.disposition?.attached_pic,
  );
  const audio = streams.find((stream) => stream.codec_type === "audio");

  return {
    durationSeconds: Math.max(0, Number(parsed.format?.duration) || 0),
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: parseFrameRate(video?.r_frame_rate),
  };
};
