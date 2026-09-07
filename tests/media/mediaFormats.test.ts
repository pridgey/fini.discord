import { describe, expect, it } from "bun:test";
import {
  MEDIA_FORMATS,
  alphaFormatList,
  findMediaFormat,
  mediaFormatChoices,
} from "../../modules/media/mediaFormats";

describe("the format registry", () => {
  it("has no duplicate option values", () => {
    const values = MEDIA_FORMATS.map((format) => format.value);

    expect(new Set(values).size).toBe(values.length);
  });

  // Discord rejects the whole command registration over this, which shows up
  // as every command silently keeping its old definition.
  it("fits inside Discord's 25 choice limit", () => {
    expect(mediaFormatChoices().length).toBeLessThanOrEqual(25);
  });

  it("labels every choice within Discord's 100 character limit", () => {
    for (const choice of mediaFormatChoices()) {
      expect(choice.name.length).toBeGreaterThan(0);
      expect(choice.name.length).toBeLessThanOrEqual(100);
    }
  });

  it("only claims alpha support for containers that have it", () => {
    const alpha = MEDIA_FORMATS.filter((format) => format.supportsAlpha).map(
      (format) => format.value,
    );

    expect(alpha.sort()).toEqual(["gif", "mov", "webm"]);
  });

  it("never claims alpha support for an audio format", () => {
    for (const format of MEDIA_FORMATS.filter((f) => f.kind === "audio")) {
      expect(format.supportsAlpha).toBe(false);
    }
  });

  // yt-dlp is told to prefer codecs the container can hold, so a sort string
  // on a container it never merges into would be dead configuration.
  it("only carries a yt-dlp sort for containers it merges into", () => {
    for (const format of MEDIA_FORMATS) {
      if (format.ytdlpSort) expect(format.nativeContainer).toBe(true);
    }
  });

  it("offers a bitrate mode for every lossy format that can be squeezed", () => {
    const squeezable = MEDIA_FORMATS.filter((f) => f.bitrateArgs).map(
      (f) => f.value,
    );

    expect(squeezable.sort()).toEqual([
      "m4a",
      "mkv",
      "mp3",
      "mp4",
      "ogg",
      "webm",
    ]);
  });

  it("keeps the alpha pixel format out of a non-keyed encode", () => {
    const webm = findMediaFormat("webm")!;

    expect(webm.encoderArgs(true)).toContain("yuva420p");
    expect(webm.encoderArgs(false)).toContain("yuv420p");
    expect(webm.encoderArgs(false)).not.toContain("yuva420p");
  });

  it("puts a bitrate on every stream it encodes in bitrate mode", () => {
    const mp4 = findMediaFormat("mp4")!;
    const args = mp4.bitrateArgs!(800, 128, false);

    expect(args).toContain("-b:v");
    expect(args[args.indexOf("-b:v") + 1]).toBe("800k");
    expect(args[args.indexOf("-b:a") + 1]).toBe("128k");
  });

  it("filters unknown values out rather than guessing", () => {
    expect(findMediaFormat("mp4")?.value).toBe("mp4");
    expect(findMediaFormat("exe")).toBeUndefined();
    expect(findMediaFormat(undefined)).toBeUndefined();
  });

  it("lists the alpha formats for the error message", () => {
    expect(alphaFormatList()).toBe("webm, mov, gif");
  });
});
