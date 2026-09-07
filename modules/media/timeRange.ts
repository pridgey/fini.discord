/**
 * Timestamp parsing for the `start` and `end` options on `/ytdlp` and
 * `/convert`.
 *
 * Shared because the two commands have to agree on what `1:20` means, but they
 * spend the answer differently: yt-dlp takes a range string and fetches only
 * that span, while ffmpeg takes a seek and a duration. Both are built from the
 * same parsed seconds here so a range cannot mean one thing on a link and
 * another on an upload.
 */

export type TimeRange = {
  /** Seconds from the start, or undefined to begin at the beginning. */
  startSeconds?: number;
  /** Seconds from the start, or undefined to run to the end. */
  endSeconds?: number;
};

/**
 * Parses a timestamp.
 *
 * Accepts plain seconds (`90`), `mm:ss` (`1:20`), and `hh:mm:ss` (`1:02:03`),
 * with an optional fractional part on the seconds.
 *
 * The minute and second parts of the colon forms are required to be under 60.
 * ffmpeg would accept `1:75` and quietly read it as 2:15, but nobody means
 * that - it is a typo for `1:15`, and silently seeking somewhere else is worse
 * than saying so.
 * @param input Whatever was typed into the option
 * @returns Seconds, or null if it is not a timestamp
 */
export const parseTimestamp = (input: string): number | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // No sign: a negative seek is meaningless, and yt-dlp reads a leading dash
  // as counting from the end - a different feature with different semantics
  // than the one these options promise.
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(trimmed)) return null;

  const parts = trimmed.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;

  // Everything but the last part is a whole unit of time, and only the last
  // one may carry a fraction.
  if (parts.length > 1 && parts.slice(1).some((part) => part >= 60))
    return null;

  return parts.reduce((total, part) => total * 60 + part, 0);
};

/**
 * Renders seconds back for a reply.
 * @param seconds The length or offset to render
 * @returns `m:ss`, or `h:mm:ss` past an hour
 */
export const formatDuration = (seconds: number): string => {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  return hours
    ? `${hours}:${`${minutes}`.padStart(2, "0")}:${`${secs}`.padStart(2, "0")}`
    : `${minutes}:${`${secs}`.padStart(2, "0")}`;
};

/**
 * Discriminated on `ok` rather than on the presence of `error`, so callers
 * narrow properly. An optional-`error` union does not narrow under a
 * truthiness check, because the error type `string` includes `""`.
 */
export type TimeRangeResult =
  | { ok: true; range: TimeRange }
  | { ok: false; error: string };

/**
 * Validates the pair of options into a range.
 * @param start The `start` option, if given
 * @param end The `end` option, if given
 * @returns The range, or the message to reply with
 */
export const buildTimeRange = (
  start: string | undefined,
  end: string | undefined,
): TimeRangeResult => {
  const startSeconds = start === undefined ? undefined : parseTimestamp(start);
  const endSeconds = end === undefined ? undefined : parseTimestamp(end);

  if (start !== undefined && startSeconds === null) {
    return {
      ok: false,
      error: `I can't read \`${start}\` as a timestamp. Try \`90\`, \`1:20\` or \`1:02:03\`.`,
    };
  }

  if (end !== undefined && endSeconds === null) {
    return {
      ok: false,
      error: `I can't read \`${end}\` as a timestamp. Try \`90\`, \`1:20\` or \`1:02:03\`.`,
    };
  }

  if (
    startSeconds != null &&
    endSeconds != null &&
    endSeconds <= startSeconds
  ) {
    return { ok: false, error: "The end has to come after the start." };
  }

  return {
    ok: true,
    range: {
      startSeconds: startSeconds ?? undefined,
      endSeconds: endSeconds ?? undefined,
    },
  };
};

/**
 * Whether a range actually asks for anything.
 * @param range The range to check
 * @returns True if either end was given
 */
export const hasTimeRange = (range: TimeRange | undefined): boolean =>
  range?.startSeconds !== undefined || range?.endSeconds !== undefined;

/**
 * How long the requested span is.
 *
 * This is the number the duration cap should be measured against, not the
 * source length: forty seconds out of a two hour stream is a small job, and
 * rejecting it for the length of the thing it was cut from would turn an
 * ordinary request into an error.
 * @param range The requested range
 * @param sourceDuration Length of the whole source, 0 when unknown
 * @returns The span in seconds, or 0 when it cannot be worked out
 */
export const rangeDurationSeconds = (
  range: TimeRange | undefined,
  sourceDuration: number,
): number => {
  const start = range?.startSeconds ?? 0;
  const requestedEnd = range?.endSeconds ?? sourceDuration;

  // An end past the end of the source just means "to the end". Left unclamped
  // this over-reports the span, which matters because the figure is compared
  // against what the download actually produced: asking 0:50-2:00 of a one
  // minute video would look like a seek that silently returned too little.
  const end =
    sourceDuration > 0 ? Math.min(requestedEnd, sourceDuration) : requestedEnd;

  // An open-ended range on a source of unknown length is unknown itself, and
  // guessing zero is the honest answer - callers treat it as "no cap to apply"
  // exactly as they already do for a source with no duration.
  if (!end) return 0;

  return Math.max(0, end - start);
};

/**
 * Renders the range as a yt-dlp `--download-sections` argument.
 *
 * The `*` prefix is what makes it a time range rather than a chapter-name
 * regex, and `inf` is how an open end is spelled.
 * @param range The range to fetch
 * @returns The argument value
 */
export const downloadSectionArg = (range: TimeRange): string => {
  const start = range.startSeconds ?? 0;
  const end = range.endSeconds === undefined ? "inf" : range.endSeconds;

  return `*${start}-${end}`;
};

/**
 * Renders the range for a reply.
 * @param range The range to describe
 * @returns Something like `1:20-2:45`, or `from 1:20`
 */
export const describeTimeRange = (range: TimeRange): string => {
  const { startSeconds, endSeconds } = range;

  if (startSeconds !== undefined && endSeconds !== undefined) {
    return `${formatDuration(startSeconds)}-${formatDuration(endSeconds)}`;
  }
  if (startSeconds !== undefined) return `from ${formatDuration(startSeconds)}`;
  if (endSeconds !== undefined) return `up to ${formatDuration(endSeconds)}`;

  return "the whole thing";
};
