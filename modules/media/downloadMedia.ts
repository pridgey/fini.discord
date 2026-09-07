import { join } from "path";
import { glob } from "glob";
import type { MediaFormat } from "./mediaFormats";
import { runProcess } from "./runProcess";
import { downloadSectionArg, hasTimeRange, type TimeRange } from "./timeRange";

/**
 * The yt-dlp half of `/ytdlp`.
 *
 * yt-dlp's own config file is deliberately *not* disabled here. Anything that
 * needs credentials to reach - age-gated YouTube, most things behind a login -
 * is configured with `cookiesfrombrowser` or `cookiefile` in
 * `~/.config/yt-dlp/config`, and passing `--ignore-config` would silently
 * break every one of those sites for the sake of tidiness.
 */

/**
 * Longest source accepted.
 *
 * Not about disk - it is about the interaction. A Discord interaction token is
 * dead fifteen minutes after the command runs, so a job that cannot plausibly
 * finish inside that window has nowhere to deliver its result. Half an hour of
 * source is already optimistic if it needs a re-encode.
 */
export const MAX_DURATION_SECONDS = 30 * 60;

/**
 * Hard ceiling on what gets pulled down, well above any upload limit because
 * the file may be squeezed after the fact. This is the guard against someone
 * pointing the bot at a multi-gigabyte archive.
 */
export const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;

/** yt-dlp writes to this name; the extension is whatever it settles on. */
const OUTPUT_BASE = "download";

export type UrlProbe = {
  title: string;
  /** Seconds, or 0 when the site does not report one. */
  durationSeconds: number;
  isLive: boolean;
  /** The extractor yt-dlp matched, e.g. `youtube`. */
  extractor: string;
};

/**
 * Validates a url before it reaches yt-dlp.
 *
 * The scheme check is the point. yt-dlp happily takes `file:///etc/passwd`,
 * and a bare word starting with a dash would be parsed as an option rather
 * than a url - so both are rejected here, and the argument list puts a `--`
 * ahead of the url as a second line of defence.
 * @param raw Whatever was typed into the option
 * @returns The parsed url, or null if it is not an http(s) url
 */
export const parseMediaUrl = (raw: string): URL | null => {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

/**
 * Asks yt-dlp what is at a url without downloading it.
 * @param url The url to inspect
 * @param timeoutMs Cap on the metadata fetch
 * @returns Title, duration, and whether it is a live stream
 * @throws ProcessError if yt-dlp cannot extract the url
 */
export const probeUrl = async (
  url: string,
  timeoutMs: number,
  workDir?: string,
): Promise<UrlProbe> => {
  const { stdout } = await runProcess(
    "yt-dlp",
    [
      "--no-playlist",
      // A url that is both a video and a playlist (a YouTube "watch later"
      // link) still resolves to a playlist for some extractors.
      "-I",
      "1",
      "--no-warnings",
      "--skip-download",
      "--print",
      "%(title)s",
      "--print",
      "%(duration)s",
      "--print",
      "%(is_live)s",
      "--print",
      "%(extractor)s",
      "--",
      url,
    ],
    {
      timeoutMs,
      sandbox: workDir ? { workDir, network: true } : undefined,
    },
  );

  const [title = "", duration = "", isLive = "", extractor = ""] = stdout
    .split("\n")
    .map((line) => line.trim());

  return {
    title: title === "NA" ? "" : title,
    // yt-dlp prints "NA" rather than nothing for fields it could not fill.
    durationSeconds: Number(duration) || 0,
    isLive: isLive === "True",
    extractor: extractor === "NA" ? "" : extractor,
  };
};

export type DownloadRequest = {
  url: string;
  format: MediaFormat;
  /** Cap on source resolution in pixels; omit for the best available. */
  maxHeight?: number;
  /** Fetch only this span of the source rather than all of it. */
  trim?: TimeRange;
  /** The job's workspace, which yt-dlp runs in. */
  dir: string;
  timeoutMs: number;
};

/**
 * Builds the yt-dlp argument list.
 *
 * The format selector does the resolution capping with `[height<=n]` rather
 * than the `-S res:n` sort, because the sort only expresses a preference: on a
 * source with no 720p rendition it will happily hand back 1080p. `-S` is left
 * to steer *codecs*, which is what keeps a merge into mp4 or WebM a remux
 * instead of a re-encode.
 *
 * Exported separately from the run so the selector logic can be tested without
 * touching the network.
 * @param request The download to build
 * @returns The arguments to pass to yt-dlp
 */
export const buildDownloadArgs = (request: DownloadRequest): string[] => {
  const { url, format, maxHeight, trim } = request;

  const args = [
    "--no-playlist",
    "-I",
    "1",
    "--no-warnings",
    // Progress is written as carriage-return updates, which would just fill
    // the captured output buffer.
    "--no-progress",
    // `--print` implies simulate, so without this yt-dlp reports the path it
    // would have written and downloads nothing.
    "--no-simulate",
    "--print",
    "after_move:filepath",
    "--max-filesize",
    String(MAX_DOWNLOAD_BYTES),
    "--retries",
    "3",
    "--socket-timeout",
    "30",
    "-o",
    `${OUTPUT_BASE}.%(ext)s`,
  ];

  if (format.kind === "audio") {
    // No point pulling video down to throw it away; the container it arrives
    // in does not matter because ffmpeg re-encodes it either way.
    args.push("-f", "ba/b");
  } else {
    // The cap belongs on the video stream and on the single-file fallback -
    // not on `ba`, where a height filter matches nothing and the whole
    // selector fails to resolve.
    const cap = maxHeight ? `[height<=${maxHeight}]` : "";
    const capped = format.videoOnly
      ? `bv*${cap}/b${cap}`
      : `bv*${cap}+ba/b${cap}`;
    const uncapped = format.videoOnly ? "bv*/b" : "bv*+ba/b";

    // Falling back to the uncapped selector means a source that only
    // publishes 1080p comes back at 1080p rather than failing outright.
    args.push("-f", cap ? `${capped}/${uncapped}` : uncapped);

    if (format.ytdlpSort) args.push("-S", format.ytdlpSort);

    // Non-native containers still need the streams merged into something
    // before ffmpeg can work on them.
    args.push(
      "--merge-output-format",
      format.nativeContainer ? format.value : "mp4",
    );
  }

  if (hasTimeRange(trim)) {
    // Not `--force-keyframes-at-cuts`: that is exact, but it re-encodes the
    // whole span during the download, which on this box turns a fast fetch
    // into something that races the interaction token. Snapping to the
    // nearest keyframe costs a second or two of slack at the edges, which is
    // the right trade for a clip going into a Discord message.
    args.push("--download-sections", downloadSectionArg(trim!));
  }

  args.push("--", url);

  return args;
};

/**
 * Downloads a url into the job's workspace.
 * @param request The download to run
 * @returns The absolute path to the file yt-dlp produced
 * @throws ProcessError if yt-dlp fails, or Error if it produced no file
 */
export const downloadFromUrl = async (
  request: DownloadRequest,
): Promise<string> => {
  const { stdout } = await runProcess("yt-dlp", buildDownloadArgs(request), {
    timeoutMs: request.timeoutMs,
    cwd: request.dir,
    // Network is unavoidable here, so loopback inside the sandbox is the
    // host's loopback. `urlSafety` is what guards that; this guards the disk.
    sandbox: { workDir: request.dir, network: true },
  });

  const printed = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();

  if (printed) {
    return printed.startsWith("/") ? printed : join(request.dir, printed);
  }

  // `after_move:filepath` is empty for the handful of post-processor paths
  // that do not run a move, so fall back to whatever landed in the workspace.
  // Intermediate per-stream files are named `download.f137.mp4`, and the
  // merged output is the one with a single extension.
  const found = await glob(`${OUTPUT_BASE}.*`, { cwd: request.dir });
  const merged = found.filter((name) => name.split(".").length === 2);
  const chosen = merged[0] ?? found[0];

  if (!chosen) throw new Error("yt-dlp finished but produced no file");

  return join(request.dir, chosen);
};
