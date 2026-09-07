import { describe, expect, it } from "bun:test";
import {
  buildTimeRange,
  describeTimeRange,
  downloadSectionArg,
  formatDuration,
  hasTimeRange,
  parseTimestamp,
  rangeDurationSeconds,
} from "../../modules/media/timeRange";

describe("parseTimestamp", () => {
  it("reads the forms people type", () => {
    expect(parseTimestamp("90")).toBe(90);
    expect(parseTimestamp("1:20")).toBe(80);
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp("0:00")).toBe(0);
    expect(parseTimestamp("  2:30  ")).toBe(150);
  });

  it("keeps a fractional second", () => {
    expect(parseTimestamp("1:20.5")).toBe(80.5);
    expect(parseTimestamp("2.25")).toBe(2.25);
  });

  // ffmpeg would read 1:75 as 2:15. Nobody means that - it is a typo for
  // 1:15, and seeking somewhere else without saying so is the worse failure.
  it("rejects a minute or second past 59 rather than rolling it over", () => {
    expect(parseTimestamp("1:75")).toBeNull();
    expect(parseTimestamp("1:75:00")).toBeNull();
  });

  // A leading dash means "from the end" to yt-dlp, which is a different
  // feature with different semantics than these options promise.
  it("rejects signs, junk and empties", () => {
    for (const input of [
      "",
      "   ",
      "-30",
      "+30",
      "abc",
      "1:",
      ":30",
      "1:2:3:4",
    ]) {
      expect(parseTimestamp(input)).toBeNull();
    }
  });
});

describe("buildTimeRange", () => {
  it("gives an empty range when neither option was used", () => {
    const result = buildTimeRange(undefined, undefined);

    expect(result.ok).toBe(true);
    expect(hasTimeRange(result.ok ? result.range : undefined)).toBe(false);
  });

  it("accepts either end on its own", () => {
    const fromStart = buildTimeRange("1:20", undefined);
    const toEnd = buildTimeRange(undefined, "2:45");

    expect(fromStart.ok && fromStart.range).toEqual({
      startSeconds: 80,
      endSeconds: undefined,
    });
    expect(toEnd.ok && toEnd.range).toEqual({
      startSeconds: undefined,
      endSeconds: 165,
    });
  });

  it("names the option it could not read", () => {
    const result = buildTimeRange("banana", undefined);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("banana");
  });

  it("refuses a range that runs backwards or has no length", () => {
    expect(buildTimeRange("2:00", "1:00").ok).toBe(false);
    expect(buildTimeRange("1:00", "1:00").ok).toBe(false);
  });
});

describe("rangeDurationSeconds", () => {
  // This is the number the duration cap is measured against, so getting it
  // wrong either rejects a small job or lets a huge one through.
  it("measures the span, not the source", () => {
    expect(
      rangeDurationSeconds({ startSeconds: 80, endSeconds: 165 }, 7200),
    ).toBe(85);
  });

  it("runs an open end out to the source length", () => {
    expect(rangeDurationSeconds({ startSeconds: 60 }, 300)).toBe(240);
    expect(rangeDurationSeconds({ endSeconds: 60 }, 300)).toBe(60);
  });

  it("gives back the whole source when nothing was asked for", () => {
    expect(rangeDurationSeconds(undefined, 300)).toBe(300);
    expect(rangeDurationSeconds({}, 300)).toBe(300);
  });

  // Callers already treat zero as "no cap to apply", which is the same thing
  // they do for a source whose container reports no duration.
  it("reports zero when an open range meets an unknown source length", () => {
    expect(rangeDurationSeconds({ startSeconds: 60 }, 0)).toBe(0);
  });

  it("never goes negative", () => {
    expect(rangeDurationSeconds({ startSeconds: 400 }, 300)).toBe(0);
  });

  // The figure is compared against what a download actually returned, so
  // over-reporting it would make an honest short result look like a broken
  // seek. Asking 0:50-2:00 of a one minute video is 10 seconds, not 70.
  it("treats an end past the source as the end of the source", () => {
    expect(
      rangeDurationSeconds({ startSeconds: 50, endSeconds: 120 }, 60),
    ).toBe(10);
  });

  it("leaves the end alone when the source length is unknown", () => {
    expect(rangeDurationSeconds({ startSeconds: 10, endSeconds: 40 }, 0)).toBe(
      30,
    );
  });
});

describe("downloadSectionArg", () => {
  // The `*` is what makes it a time range; without it yt-dlp treats the value
  // as a regex matched against chapter names.
  it("marks the value as a time range", () => {
    expect(downloadSectionArg({ startSeconds: 80, endSeconds: 165 })).toBe(
      "*80-165",
    );
  });

  it("spells an open end as inf and a missing start as zero", () => {
    expect(downloadSectionArg({ startSeconds: 80 })).toBe("*80-inf");
    expect(downloadSectionArg({ endSeconds: 165 })).toBe("*0-165");
  });
});

describe("formatDuration", () => {
  it("only shows hours when there are some", () => {
    expect(formatDuration(85)).toBe("1:25");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(9)).toBe("0:09");
  });
});

describe("describeTimeRange", () => {
  it("reads as a span, or as an open end", () => {
    expect(describeTimeRange({ startSeconds: 80, endSeconds: 165 })).toBe(
      "1:20-2:45",
    );
    expect(describeTimeRange({ startSeconds: 80 })).toBe("from 1:20");
    expect(describeTimeRange({ endSeconds: 165 })).toBe("up to 2:45");
  });
});
