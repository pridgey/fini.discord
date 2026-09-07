import { join } from "path";
import { colorkeyFilter, type ChromaKey } from "./chromaKey";
import {
  hasTimeRange,
  rangeDurationSeconds,
  type TimeRange,
} from "./timeRange";
import type { MediaFormat } from "./mediaFormats";
import type { MediaProbe } from "./probeMedia";
import { runProcess } from "./runProcess";
import { fileSize } from "./workspace";
import { formatBytes } from "./uploadLimit";

/**
 * The ffmpeg half of both commands.
 *
 * Filters are built from probed numbers rather than ffmpeg expressions, and
 * the whole command is an argument array - see `probeMedia` and `runProcess`
 * for why each of those matters.
 */

/**
 * GIF defaults.
 *
 * A GIF is a palettised frame per frame with no interframe prediction, so it
 * is roughly two orders of magnitude larger than the h264 it came from. At
 * source resolution and frame rate a ten second clip clears 10MB on its own,
 * which would make the format useless in an unboosted guild. 480px at 15fps
 * is the point where a short clip usually fits without looking like a
 * flipbook.
 */
export const GIF_FPS = 15;
export const GIF_MAX_WIDTH = 480;

export type ConvertRequest = {
  /** Absolute path to the source file. */
  input: string;
  /** Directory to write into. */
  outputDir: string;
  /** Output filename without extension. */
  outputBase: string;
  format: MediaFormat;
  /** Probe of `input`, used to size every filter. */
  probe: MediaProbe;
  /** Applied only if the target format supports alpha. */
  chromaKey?: ChromaKey;
  /** Trim the source to this span before doing anything else. */
  trim?: TimeRange;
  /** Cap the output width, preserving aspect ratio. */
  maxWidth?: number;
  /** Cap the output frame rate. */
  maxFps?: number;
  /** Encode to a bitrate budget instead of constant quality. */
  bitrates?: { videoKbps: number | null; audioKbps: number };
  timeoutMs: number;
};

/** Rounds down to an even number, with a floor of 2. */
const toEven = (value: number): number =>
  Math.max(2, Math.floor(value / 2) * 2);

/**
 * Builds the video filter chain for a conversion.
 *
 * Returns an empty string when the video can pass through untouched, which
 * lets the caller skip `-filter_complex` and its stream mapping entirely.
 * @param request The conversion being built
 * @returns A filter chain, or "" for no video filtering
 */
export const buildVideoFilterChain = (request: ConvertRequest): string => {
  const { format, probe, chromaKey, maxWidth, maxFps } = request;

  if (format.kind === "audio" || !probe.hasVideo) return "";

  const isGif = format.value === "gif";
  const alpha = Boolean(chromaKey) && format.supportsAlpha;
  const filters: string[] = [];

  // Keying first: everything downstream, palette generation especially, needs
  // to see the transparency to preserve it.
  if (alpha && chromaKey) {
    filters.push(colorkeyFilter(chromaKey));
  }

  const fpsCap = isGif ? Math.min(maxFps ?? GIF_FPS, GIF_FPS) : maxFps;
  if (fpsCap && (!probe.fps || probe.fps > fpsCap)) {
    filters.push(`fps=${fpsCap}`);
  }

  const widthCap = isGif
    ? Math.min(maxWidth ?? GIF_MAX_WIDTH, GIF_MAX_WIDTH)
    : maxWidth;

  if (widthCap && probe.width > widthCap) {
    // -2 keeps the derived height even, which yuv420p requires.
    filters.push(`scale=${toEven(widthCap)}:-2:flags=lanczos`);
  } else if (
    !isGif &&
    (probe.width % 2 !== 0 || probe.height % 2 !== 0) &&
    probe.width > 0
  ) {
    // A source with an odd dimension - which attachments occasionally are -
    // cannot be encoded as yuv420p at all, and ffmpeg fails rather than
    // rounding for us.
    filters.push(`scale=${toEven(probe.width)}:${toEven(probe.height)}`);
  }

  if (isGif) {
    // A GIF has a 256 colour palette, so the quality is entirely down to
    // choosing one. Two passes in a single graph: split the stream, build a
    // palette from one branch, apply it to the other.
    // `reserve_transparent` keeps a palette slot for the keyed pixels, and
    // `alpha_threshold` decides which of them land in it.
    filters.push(
      `split[s0][s1];[s0]palettegen=stats_mode=diff${
        alpha ? ":reserve_transparent=1" : ""
      }[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5${
        alpha ? ":alpha_threshold=128" : ""
      }`,
    );
  }

  return filters.join(",");
};

/**
 * Assembles the full ffmpeg argument list.
 *
 * Exported separately from the run so it can be asserted on in tests without
 * encoding anything.
 * @param request The conversion to build
 * @returns The output path and the arguments to run it
 */
export const buildConvertArgs = (
  request: ConvertRequest,
): { outputPath: string; args: string[] } => {
  const { input, outputDir, outputBase, format, probe, chromaKey, bitrates } =
    request;

  const outputPath = join(outputDir, `${outputBase}.${format.value}`);
  const alpha = Boolean(chromaKey) && format.supportsAlpha;
  const chain = buildVideoFilterChain(request);

  const args = [
    "-hide_banner",
    "-nostdin",
    // Overwrite without asking. There is nothing at the output path but a
    // previous failed attempt from this same job.
    "-y",
    // Frame-level chatter would bury the one line that says what broke.
    "-loglevel",
    "warning",
    // Stops a crafted input from making ffmpeg fetch remote resources it found
    // inside the container - see probeMedia for the same reasoning. The
    // sandbox denies ffmpeg the network outright, so this is the backstop for
    // when bubblewrap is unavailable.
    "-protocol_whitelist",
    "file,crypto,data",
  ];

  // `-ss` goes before `-i` so ffmpeg seeks the container instead of decoding
  // and discarding everything up to the mark - the difference between instant
  // and minutes on a long source. The length is then given as `-t` after the
  // input rather than `-to`, because `-to` combined with an input seek is
  // measured from different origins depending on ffmpeg version, and a trim
  // that silently means something else is worse than a slower one.
  if (request.trim?.startSeconds) {
    args.push("-ss", String(request.trim.startSeconds));
  }

  args.push("-i", input);

  if (request.trim?.endSeconds !== undefined) {
    args.push(
      "-t",
      String(request.trim.endSeconds - (request.trim.startSeconds ?? 0)),
    );
  }

  if (chain) {
    args.push("-filter_complex", `[0:v]${chain}[vout]`, "-map", "[vout]");
    // The `?` makes the audio optional, so a silent source is not an error.
    if (!format.videoOnly) args.push("-map", "0:a?");
  } else if (format.kind === "video") {
    if (probe.hasVideo) args.push("-map", "0:v:0");
    if (!format.videoOnly) args.push("-map", "0:a?");
  }

  const encoder =
    bitrates && format.bitrateArgs
      ? format.bitrateArgs(bitrates.videoKbps, bitrates.audioKbps, alpha)
      : format.encoderArgs(alpha);

  args.push(...encoder, outputPath);

  return { outputPath, args };
};

/**
 * The probe as it applies to the *output* rather than the source.
 *
 * Only the duration differs: a trim changes how long the result runs but not
 * its dimensions or frame rate.
 * @param probe Probe of the source file
 * @param trim The requested span, if any
 * @returns A probe describing what the conversion will produce
 */
export const probeAfterTrim = (
  probe: MediaProbe,
  trim: TimeRange | undefined,
): MediaProbe =>
  hasTimeRange(trim)
    ? {
        ...probe,
        durationSeconds: rangeDurationSeconds(trim, probe.durationSeconds),
      }
    : probe;

/**
 * Runs one conversion.
 * @param request The conversion to run
 * @returns The path and size of the file produced
 * @throws ProcessError if ffmpeg fails or runs past the timeout
 */
export const convertMedia = async (
  request: ConvertRequest,
): Promise<{ path: string; bytes: number }> => {
  const { outputPath, args } = buildConvertArgs(request);

  await runProcess("ffmpeg", args, {
    timeoutMs: request.timeoutMs,
    cwd: request.outputDir,
    // No network: ffmpeg only ever touches local files here.
    sandbox: { workDir: request.outputDir, network: false },
  });

  return { path: outputPath, bytes: await fileSize(outputPath) };
};

/**
 * Audio budget when there is video to pay for too. Below this, speech starts
 * to sound like a phone call, and nobody thanks you for a sharper picture with
 * unlistenable audio.
 */
const VIDEO_AUDIO_KBPS = 128;

/**
 * Smallest width a lossless video is scaled down to. Past this the file is
 * small but no longer useful for the thing people want alpha footage for.
 */
const MIN_LOSSLESS_WIDTH = 320;

/**
 * How qtrle's size responds to width, measured rather than assumed.
 *
 * The intuition is that halving the width quarters the pixel count and so
 * quarters the file - an exponent of 2. Measured across a keyed 1280px clip it
 * is about 1.37: qtrle is run-length coded per scanline, and the lanczos
 * interpolation that does the scaling puts a gradient through exactly the flat
 * keyed regions that were compressing to nothing. Shrinking costs more per
 * pixel than it saves in pixels.
 *
 * Using 2 here made the first attempt land at 14.9MB against a 10MB limit and
 * the second at 10.1MB - close enough to look like it should have worked.
 * 1.35 is slightly under the measurement, which biases towards shrinking too
 * far rather than not far enough; a slightly small file uploads, a slightly
 * large one does not.
 */
const LOSSLESS_SIZE_EXPONENT = 1.35;

/**
 * Safety factors for the three rungs of the lossless ladder.
 *
 * The first aims at the target with a little margin, and the rest back off
 * hard, because a model fitted to one clip's content will be wrong on another
 * and there is no point spending a whole re-encode moving five percent.
 */
const LOSSLESS_LADDER = [0.9, 0.7, 0.5];

/** Floors and ceilings for a computed budget. */
const MIN_VIDEO_KBPS = 150;
const MAX_AUDIO_KBPS = 320;
const MIN_AUDIO_KBPS = 64;

/**
 * Resolution ladder for a given video budget.
 *
 * 1080p at 300kbps is a worse picture than 480p at 300kbps - the bitrate goes
 * on encoding blocks rather than detail. Capping width alongside the bitrate
 * is what keeps a squeezed video watchable rather than merely small.
 * @param videoKbps The video budget
 * @returns A width cap, or undefined to leave the resolution alone
 */
const widthCapForBitrate = (videoKbps: number): number | undefined => {
  if (videoKbps < 250) return 426;
  if (videoKbps < 500) return 640;
  if (videoKbps < 1200) return 854;
  if (videoKbps < 2500) return 1280;
  return undefined;
};

export type FitAttempt = {
  maxWidth?: number;
  maxFps?: number;
  bitrates?: { videoKbps: number | null; audioKbps: number };
  /** Shown to the user so a degraded result is not a silent one. */
  description: string;
};

/**
 * Works out how to make a conversion land under a size.
 *
 * Two attempts, not a search: each one is a full re-encode, and a binary
 * search on file size would spend the interaction's fifteen minute token on
 * getting closer to a limit the first attempt is usually already under. The
 * second attempt exists because a bitrate target is an average and a
 * pathological source can still overshoot it.
 * @param format The target format
 * @param probe Probe of the source
 * @param targetBytes The size to come in under
 * @param achievedBytes What the first attempt actually produced, when known
 * @returns Attempts to try in order; empty when the format cannot be squeezed
 */
export const planFitAttempts = (
  format: MediaFormat,
  probe: MediaProbe,
  targetBytes: number,
  achievedBytes?: number,
): FitAttempt[] => {
  // GIF's size lever is frames and pixels, not bitrate.
  if (format.value === "gif") {
    const baseWidth = Math.min(probe.width || GIF_MAX_WIDTH, GIF_MAX_WIDTH);

    return [
      {
        maxWidth: Math.max(160, Math.round(baseWidth / 2)),
        maxFps: 12,
        description: `${Math.max(
          160,
          Math.round(baseWidth / 2),
        )}px wide at 12fps`,
      },
      {
        maxWidth: Math.max(120, Math.round(baseWidth / 3)),
        maxFps: 10,
        description: `${Math.max(
          120,
          Math.round(baseWidth / 3),
        )}px wide at 10fps`,
      },
    ];
  }

  // A lossless video codec has no bitrate to aim, but it does have a
  // resolution: qtrle stores whole pixels, so its size falls with the pixel
  // count. Scaling by the square root of how far over we are is the width
  // that lands on the target, derived from the size the encode actually came
  // out at rather than guessed from the codec.
  if (format.kind === "video" && !format.bitrateArgs) {
    if (!achievedBytes || !probe.width) return [];

    const scale = Math.pow(
      targetBytes / achievedBytes,
      1 / LOSSLESS_SIZE_EXPONENT,
    );
    const widths = LOSSLESS_LADDER.map((safety) =>
      Math.max(MIN_LOSSLESS_WIDTH, Math.round(probe.width * scale * safety)),
    );

    // Deduped because the floor collapses the lower rungs together on a source
    // that is already small, and there is no sense encoding the same width
    // twice to get the same answer.
    return [...new Set(widths)]
      .filter((width) => width < probe.width)
      .map((width) => ({ maxWidth: width, description: `${width}px wide` }));
  }

  // Lossless audio has no size knob at all, and a bitrate cannot be computed
  // for a source whose duration the container does not report.
  if (!format.bitrateArgs || probe.durationSeconds <= 0) return [];

  const totalKbps = (targetBytes * 8) / probe.durationSeconds / 1000;

  if (format.kind === "audio") {
    const audioKbps = Math.floor(
      Math.min(MAX_AUDIO_KBPS, Math.max(MIN_AUDIO_KBPS, totalKbps)),
    );

    return [
      {
        bitrates: { videoKbps: null, audioKbps },
        description: `${audioKbps}kbps audio`,
      },
      {
        bitrates: {
          videoKbps: null,
          audioKbps: Math.max(MIN_AUDIO_KBPS, Math.floor(audioKbps * 0.7)),
        },
        description: `${Math.max(
          MIN_AUDIO_KBPS,
          Math.floor(audioKbps * 0.7),
        )}kbps audio`,
      },
    ];
  }

  const buildVideoAttempt = (scale: number): FitAttempt => {
    const videoKbps = Math.max(
      MIN_VIDEO_KBPS,
      Math.floor((totalKbps - VIDEO_AUDIO_KBPS) * scale),
    );
    const maxWidth = widthCapForBitrate(videoKbps);

    return {
      maxWidth,
      bitrates: { videoKbps, audioKbps: VIDEO_AUDIO_KBPS },
      description: `${videoKbps}kbps${
        maxWidth ? ` at ${maxWidth}px wide` : ""
      }`,
    };
  };

  return [buildVideoAttempt(1), buildVideoAttempt(0.7)];
};

/**
 * The result of a fit attempt.
 *
 * A discriminated union rather than a nullable result, because the size that
 * failed is the one number the "too large" reply needs. Returning null threw
 * it away, and the command then reported the size of its *input* instead -
 * which produced the nonsense of "that came out to 9.1MB and the limit is
 * 10.0MB" on a conversion that was actually far larger than either.
 */
export type FitOutcome =
  | {
      fitted: true;
      path: string;
      bytes: number;
      /** Set when the file had to be degraded to fit; otherwise undefined. */
      squeezedTo?: string;
    }
  | {
      fitted: false;
      /** The smallest output any attempt managed, for the failure message. */
      bytes: number;
      /**
       * The full-quality output, kept on disk for handing out as a link.
       *
       * Squeezing exists to fit Discord's uploader. A link has no such limit,
       * so linking the squeezed file would be the worst of both - degraded
       * *and* the reason it was degraded no longer applies.
       */
      qualityPath: string;
      qualityBytes: number;
    };

/**
 * Converts a file, re-encoding smaller if the result will not upload.
 * @param request The conversion to run
 * @param limitBytes The guild's upload ceiling
 * @param targetBytes The size to aim at when squeezing
 * @returns The file to upload, or the smallest size reached if none fit
 */
export const convertToFit = async (
  request: ConvertRequest,
  limitBytes: number,
  targetBytes: number,
): Promise<FitOutcome> => {
  const first = await convertMedia(request);
  if (first.bytes <= limitBytes) return { fitted: true, ...first };

  console.log("Media too large, attempting to fit:", {
    format: request.format.value,
    bytes: first.bytes,
    limitBytes,
  });

  let smallest = first.bytes;

  // Each attempt writes to its own path so the quality encode survives. They
  // shared one output name before, which meant the last and smallest attempt
  // overwrote it - and that is precisely the file you do not want to link.

  // A bitrate budget is the target size divided by how long the output runs,
  // so a trimmed job has to be planned against the length of the trim. Using
  // the source length would hand a ten second cut of a ten minute video a
  // sixtieth of the bitrate it can actually afford.
  const outputProbe = probeAfterTrim(request.probe, request.trim);

  const attempts = planFitAttempts(
    request.format,
    outputProbe,
    targetBytes,
    first.bytes,
  );

  for (const [index, attempt] of attempts.entries()) {
    const squeezed = await convertMedia({
      ...request,
      outputBase: `${request.outputBase}-fit${index + 1}`,
      maxWidth: attempt.maxWidth ?? request.maxWidth,
      maxFps: attempt.maxFps ?? request.maxFps,
      bitrates: attempt.bitrates,
    });

    if (squeezed.bytes <= limitBytes) {
      return { fitted: true, ...squeezed, squeezedTo: attempt.description };
    }

    smallest = Math.min(smallest, squeezed.bytes);
  }

  return {
    fitted: false,
    bytes: smallest,
    qualityPath: first.path,
    qualityBytes: first.bytes,
  };
};

/**
 * Message for a file that could not be made to fit.
 *
 * The advice is format-specific because "try a smaller format" is useless to
 * someone who picked mov for the transparency - what they need to hear is that
 * WebM also holds an alpha channel and compresses far harder.
 * @param bytes The size it actually came out at
 * @param limitBytes The guild's ceiling
 * @param format The format that was asked for
 * @returns A reply explaining the failure and what to try instead
 */
export const tooLargeMessage = (
  bytes: number,
  limitBytes: number,
  format?: MediaFormat,
): string => {
  const preamble = `That came out to ${formatBytes(
    bytes,
  )} and this server's upload limit is ${formatBytes(limitBytes)}.`;

  if (format && !format.bitrateArgs) {
    const alternatives =
      format.kind === "audio"
        ? "mp3, m4a or ogg"
        : format.supportsAlpha
        ? "webm, which also holds transparency but compresses far harder"
        : "mp4";

    return `${preamble} ${format.value} is lossless, so there's a limit to how far I can shrink it - try ${alternatives}, or a shorter clip.`;
  }

  return `${preamble} Try a shorter clip, a smaller format, or trimming it down first.`;
};
