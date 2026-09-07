/**
 * The output formats `/ytdlp` and `/convert` can produce.
 *
 * One registry rather than a switch in each command, because the two commands
 * have to agree on more than a file extension: which containers can carry an
 * alpha channel (chroma keying is pointless without one), which ones yt-dlp
 * can hand us by remuxing instead of re-encoding, and what the encoder flags
 * are. Adding a format here adds it to both commands.
 */

export type MediaFormatKind = "video" | "audio";

export type MediaFormat = {
  /** Slash-command option value, and the output file extension. */
  value: string;
  /** What the user sees in the option picker. */
  label: string;
  kind: MediaFormatKind;
  /**
   * Content type used when the file goes out as a link rather than a Discord
   * attachment. Discord infers this itself for uploads, but a browser hitting
   * the share server downloads rather than plays without it.
   */
  mimeType: string;
  /**
   * Whether the container/codec pair below can carry transparency. Keying a
   * format that cannot means the keyed pixels come out black rather than
   * clear, which looks like a bug, so the commands refuse it instead.
   */
  supportsAlpha: boolean;
  /**
   * True when yt-dlp can produce this container by merging the streams it
   * downloaded, so a download can skip the ffmpeg pass entirely.
   */
  nativeContainer: boolean;
  /**
   * Codec preference appended to yt-dlp's `-S` for a native container. Picking
   * codecs the container actually likes is what keeps the merge a remux: ask
   * for an mp4 of a VP9 stream and yt-dlp has to re-encode it.
   */
  ytdlpSort?: string;
  /** True when the muxer carries no audio stream (gif). */
  videoOnly?: boolean;
  /**
   * Encoder and muxer flags.
   * @param alpha Whether the filter chain is producing transparency
   * @returns ffmpeg arguments, placed after the input and any filters
   */
  encoderArgs: (alpha: boolean) => string[];
  /**
   * The same flags in average-bitrate mode, for encoding to a size budget.
   *
   * Constant quality cannot hit a file size - a CRF encode of a still scene
   * and of confetti differ by an order of magnitude - so squeezing a download
   * under an upload limit needs a second set of flags rather than an extra
   * argument bolted onto the first. Absent means this format cannot be
   * targeted at a size, either because it is lossless (flac, wav, qtrle) or
   * because its size lever is resolution rather than bitrate (gif).
   * @param videoKbps Video budget, null for audio-only formats
   * @param audioKbps Audio budget
   * @param alpha Whether the filter chain is producing transparency
   * @returns ffmpeg arguments, placed after the input and any filters
   */
  bitrateArgs?: (
    videoKbps: number | null,
    audioKbps: number,
    alpha: boolean,
  ) => string[];
};

/**
 * Shared x264 settings. `veryfast` because this runs on the same box as the
 * bot and a slower preset buys a few percent of bitrate at several times the
 * wall clock - and the interaction token expires in fifteen minutes.
 */
const H264_VIDEO = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
];

const AAC_AUDIO = ["-c:a", "aac", "-b:a", "160k"];

/**
 * x264 in average-bitrate mode.
 *
 * The rate cap and buffer are what stop a busy scene from spending the whole
 * budget in ten seconds: without them x264 hits the average over the file but
 * can overshoot locally by enough that the muxed result lands over the limit
 * we were aiming under.
 * @param videoKbps The video budget
 * @returns Video encoder arguments
 */
const h264Bitrate = (videoKbps: number): string[] => [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-b:v",
  `${videoKbps}k`,
  "-maxrate",
  `${Math.round(videoKbps * 1.5)}k`,
  "-bufsize",
  `${videoKbps * 2}k`,
  "-pix_fmt",
  "yuv420p",
];

export const MEDIA_FORMATS: MediaFormat[] = [
  {
    value: "mp4",
    mimeType: "video/mp4",
    label: "MP4 (H.264 video)",
    kind: "video",
    supportsAlpha: false,
    nativeContainer: true,
    ytdlpSort: "vcodec:h264,acodec:aac",
    encoderArgs: () => [
      ...H264_VIDEO,
      ...AAC_AUDIO,
      // Puts the index at the front so Discord's player can start before the
      // whole file has arrived.
      "-movflags",
      "+faststart",
    ],
    bitrateArgs: (videoKbps, audioKbps) => [
      ...h264Bitrate(videoKbps ?? 0),
      "-c:a",
      "aac",
      "-b:a",
      `${audioKbps}k`,
      "-movflags",
      "+faststart",
    ],
  },
  {
    // Worth knowing before "fixing" the alpha here: ffmpeg can *write* VP9
    // alpha but cannot read it back, because WebM stores the alpha plane as
    // per-block side data that ffmpeg's VP9 decoder ignores. `ffprobe` on the
    // result reports plain yuv420p and `alphaextract` fails outright, while
    // the file is fine - browsers, and so Discord, decode it correctly. The
    // container tag `alpha_mode: 1` is the thing to check.
    value: "webm",
    mimeType: "video/webm",
    label: "WebM (VP9 video, supports transparency)",
    kind: "video",
    supportsAlpha: true,
    nativeContainer: true,
    ytdlpSort: "vcodec:vp9,acodec:opus",
    encoderArgs: (alpha) => [
      "-c:v",
      "libvpx-vp9",
      // VP9 has no CRF-only mode; -b:v 0 is what makes -crf constant quality.
      "-crf",
      "33",
      "-b:v",
      "0",
      "-row-mt",
      "1",
      // libvpx defaults to a quality/speed tradeoff that takes minutes per
      // minute of video. `good` at cpu-used 4 is the usual middle setting.
      "-deadline",
      "good",
      "-cpu-used",
      "4",
      "-pix_fmt",
      alpha ? "yuva420p" : "yuv420p",
      // Alternate reference frames are stored without an alpha plane, so
      // leaving them on drops transparency on those frames.
      ...(alpha ? ["-auto-alt-ref", "0"] : []),
      "-c:a",
      "libopus",
      "-b:a",
      "128k",
    ],
    bitrateArgs: (videoKbps, audioKbps, alpha) => [
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      `${videoKbps ?? 0}k`,
      "-row-mt",
      "1",
      "-deadline",
      "good",
      "-cpu-used",
      "4",
      "-pix_fmt",
      alpha ? "yuva420p" : "yuv420p",
      ...(alpha ? ["-auto-alt-ref", "0"] : []),
      "-c:a",
      "libopus",
      "-b:a",
      `${audioKbps}k`,
    ],
  },
  {
    value: "mkv",
    mimeType: "video/x-matroska",
    label: "MKV (H.264 video)",
    kind: "video",
    supportsAlpha: false,
    nativeContainer: true,
    // Matroska takes essentially any codec, so there is nothing to steer.
    encoderArgs: () => [...H264_VIDEO, ...AAC_AUDIO],
    bitrateArgs: (videoKbps, audioKbps) => [
      ...h264Bitrate(videoKbps ?? 0),
      "-c:a",
      "aac",
      "-b:a",
      `${audioKbps}k`,
    ],
  },
  {
    value: "mov",
    mimeType: "video/quicktime",
    label: "MOV (QuickTime RLE, supports transparency)",
    kind: "video",
    supportsAlpha: true,
    // qtrle is lossless and enormous, so this is never worth remuxing into -
    // it is here for handing keyed footage to a video editor.
    nativeContainer: false,
    encoderArgs: (alpha) => [
      "-c:v",
      "qtrle",
      "-pix_fmt",
      alpha ? "argb" : "rgb24",
      "-c:a",
      "pcm_s16le",
    ],
  },
  {
    value: "gif",
    mimeType: "image/gif",
    label: "GIF (animated, supports transparency)",
    kind: "video",
    supportsAlpha: true,
    nativeContainer: false,
    videoOnly: true,
    encoderArgs: () => ["-loop", "0"],
  },
  {
    value: "mp3",
    mimeType: "audio/mpeg",
    label: "MP3 audio",
    kind: "audio",
    supportsAlpha: false,
    nativeContainer: false,
    encoderArgs: () => ["-vn", "-c:a", "libmp3lame", "-q:a", "2"],
    bitrateArgs: (_videoKbps, audioKbps) => [
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      `${audioKbps}k`,
    ],
  },
  {
    value: "m4a",
    mimeType: "audio/mp4",
    label: "M4A audio (AAC)",
    kind: "audio",
    supportsAlpha: false,
    nativeContainer: false,
    encoderArgs: () => ["-vn", "-c:a", "aac", "-b:a", "192k"],
    bitrateArgs: (_videoKbps, audioKbps) => [
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      `${audioKbps}k`,
    ],
  },
  {
    value: "ogg",
    mimeType: "audio/ogg",
    label: "OGG audio (Opus)",
    kind: "audio",
    supportsAlpha: false,
    nativeContainer: false,
    encoderArgs: () => ["-vn", "-c:a", "libopus", "-b:a", "160k"],
    bitrateArgs: (_videoKbps, audioKbps) => [
      "-vn",
      "-c:a",
      "libopus",
      "-b:a",
      `${audioKbps}k`,
    ],
  },
  {
    value: "wav",
    mimeType: "audio/wav",
    label: "WAV audio (uncompressed)",
    kind: "audio",
    supportsAlpha: false,
    nativeContainer: false,
    encoderArgs: () => ["-vn", "-c:a", "pcm_s16le"],
  },
  {
    value: "flac",
    mimeType: "audio/flac",
    label: "FLAC audio (lossless)",
    kind: "audio",
    supportsAlpha: false,
    nativeContainer: false,
    encoderArgs: () => ["-vn", "-c:a", "flac"],
  },
];

/**
 * Looks up a format by its option value.
 * @param value The value sent with the interaction
 * @returns The format, or undefined if it is not one of ours
 */
export const findMediaFormat = (
  value: string | undefined,
): MediaFormat | undefined =>
  MEDIA_FORMATS.find((format) => format.value === value);

/**
 * Builds the choice list for a slash-command string option.
 * @param kind Restrict to video or audio formats; omit for all of them
 * @returns Discord option choices in registry order
 */
export const mediaFormatChoices = (
  kind?: MediaFormatKind,
): { name: string; value: string }[] =>
  MEDIA_FORMATS.filter((format) => !kind || format.kind === kind).map(
    (format) => ({ name: format.label, value: format.value }),
  );

/** The formats that can carry transparency, for error messages. */
export const alphaFormatList = (): string =>
  MEDIA_FORMATS.filter((format) => format.supportsAlpha)
    .map((format) => format.value)
    .join(", ");
