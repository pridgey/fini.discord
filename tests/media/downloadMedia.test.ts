import { describe, expect, it } from "bun:test";
import {
  buildDownloadArgs,
  parseMediaUrl,
} from "../../modules/media/downloadMedia";
import { findMediaFormat } from "../../modules/media/mediaFormats";

const argsFor = (
  value: string,
  maxHeight?: number,
  trim?: { startSeconds?: number; endSeconds?: number },
) =>
  buildDownloadArgs({
    url: "https://example.com/watch?v=abc",
    format: findMediaFormat(value)!,
    maxHeight,
    trim,
    dir: "/tmp/workspace",
    timeoutMs: 1000,
  });

const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("parseMediaUrl", () => {
  it("accepts http and https, trimming whitespace", () => {
    expect(parseMediaUrl("  https://youtu.be/abc ")?.toString()).toBe(
      "https://youtu.be/abc",
    );
    expect(parseMediaUrl("http://example.com/v")?.protocol).toBe("http:");
  });

  // yt-dlp will happily read a local path, and the bot's working directory
  // holds the .env this process was started with.
  it("rejects schemes that would read the bot's own disk", () => {
    expect(parseMediaUrl("file:///etc/passwd")).toBeNull();
    expect(parseMediaUrl("ftp://example.com/x")).toBeNull();
  });

  // A bare token starting with a dash is parsed by yt-dlp as an option, not a
  // url - `--exec` in particular runs a command.
  it("rejects anything that is not a url at all", () => {
    expect(parseMediaUrl("-x --exec rm -rf /")).toBeNull();
    expect(parseMediaUrl("just some words")).toBeNull();
    expect(parseMediaUrl("")).toBeNull();
  });
});

describe("buildDownloadArgs", () => {
  it("ends the option list before the url", () => {
    const args = argsFor("mp4");

    expect(args[args.length - 2]).toBe("--");
    expect(args[args.length - 1]).toBe("https://example.com/watch?v=abc");
  });

  // Without --no-simulate, --print makes yt-dlp report the path it would have
  // written and download nothing at all.
  it("turns simulation back off, since --print implies it", () => {
    expect(argsFor("mp4")).toContain("--no-simulate");
    expect(valueOf(argsFor("mp4"), "--print")).toBe("after_move:filepath");
  });

  it("caps the video height without capping the audio stream", () => {
    const selector = valueOf(argsFor("mp4", 720), "-f");

    expect(selector).toContain("bv*[height<=720]+ba");
    // A height filter on `ba` matches nothing, so the whole selector fails.
    expect(selector).not.toContain("ba[height");
  });

  it("falls back to an uncapped selector for sources with one rendition", () => {
    expect(valueOf(argsFor("mp4", 720), "-f")).toBe(
      "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b",
    );
  });

  it("omits the cap entirely when asked for the best available", () => {
    expect(valueOf(argsFor("mp4"), "-f")).toBe("bv*+ba/b");
  });

  it("skips the video stream for an audio-only format", () => {
    const args = argsFor("mp3", 720);

    expect(valueOf(args, "-f")).toBe("ba/b");
    expect(args).not.toContain("--merge-output-format");
  });

  it("skips the audio stream for a format that cannot carry one", () => {
    expect(valueOf(argsFor("gif", 480), "-f")).toBe(
      "bv*[height<=480]/b[height<=480]/bv*/b",
    );
  });

  it("merges straight into a native container, and into mp4 otherwise", () => {
    expect(valueOf(argsFor("webm"), "--merge-output-format")).toBe("webm");
    expect(valueOf(argsFor("mkv"), "--merge-output-format")).toBe("mkv");
    // gif and mov get an ffmpeg pass afterwards regardless.
    expect(valueOf(argsFor("gif"), "--merge-output-format")).toBe("mp4");
    expect(valueOf(argsFor("mov"), "--merge-output-format")).toBe("mp4");
  });

  it("steers codec choice so the merge stays a remux", () => {
    expect(valueOf(argsFor("mp4"), "-S")).toBe("vcodec:h264,acodec:aac");
    expect(valueOf(argsFor("webm"), "-S")).toBe("vcodec:vp9,acodec:opus");
  });

  it("asks for only the requested section", () => {
    const args = argsFor("mp4", 720, { startSeconds: 80, endSeconds: 165 });

    expect(valueOf(args, "--download-sections")).toBe("*80-165");
  });

  it("does not ask for a section when none was requested", () => {
    expect(argsFor("mp4", 720)).not.toContain("--download-sections");
    expect(argsFor("mp4", 720, {})).not.toContain("--download-sections");
  });

  // Exact cuts mean --force-keyframes-at-cuts, which re-encodes the whole span
  // during the download and races the interaction token on this box. A second
  // of slack at the edges is the right trade for a Discord clip.
  it("does not force a re-encode for frame-exact cuts", () => {
    const args = argsFor("mp4", 720, { startSeconds: 80, endSeconds: 165 });

    expect(args).not.toContain("--force-keyframes-at-cuts");
  });

  it("keeps a filesize ceiling on every download", () => {
    expect(Number(valueOf(argsFor("mp4"), "--max-filesize"))).toBeGreaterThan(
      0,
    );
  });
});
