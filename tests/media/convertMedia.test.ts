import { describe, expect, it } from "bun:test";
import {
  GIF_FPS,
  GIF_MAX_WIDTH,
  buildConvertArgs,
  buildVideoFilterChain,
  planFitAttempts,
  probeAfterTrim,
  tooLargeMessage,
  type ConvertRequest,
} from "../../modules/media/convertMedia";
import { buildChromaKey } from "../../modules/media/chromaKey";
import { findMediaFormat } from "../../modules/media/mediaFormats";
import type { MediaProbe } from "../../modules/media/probeMedia";

const videoProbe = (overrides: Partial<MediaProbe> = {}): MediaProbe => ({
  durationSeconds: 30,
  hasVideo: true,
  hasAudio: true,
  width: 1920,
  height: 1080,
  fps: 30,
  ...overrides,
});

const request = (
  value: string,
  overrides: Partial<ConvertRequest> = {},
): ConvertRequest => ({
  input: "/tmp/job/input.mp4",
  outputDir: "/tmp/job",
  outputBase: "clip",
  format: findMediaFormat(value)!,
  probe: videoProbe(),
  timeoutMs: 1000,
  ...overrides,
});

const green = buildChromaKey("green")!;

describe("buildVideoFilterChain", () => {
  it("does not filter a straight video transcode", () => {
    expect(buildVideoFilterChain(request("mp4"))).toBe("");
  });

  it("does not filter audio output, even when a key was asked for", () => {
    expect(buildVideoFilterChain(request("mp3", { chromaKey: green }))).toBe(
      "",
    );
  });

  it("keys before anything else in the chain", () => {
    const chain = buildVideoFilterChain(request("gif", { chromaKey: green }));

    // palettegen has to see the transparency to reserve a slot for it, so a
    // key applied after the palette pass would be thrown away.
    expect(chain.indexOf("colorkey")).toBe(0);
    expect(chain.indexOf("colorkey")).toBeLessThan(chain.indexOf("palettegen"));
  });

  it("silently drops a key the container cannot hold", () => {
    // The commands refuse this combination up front; this is the backstop that
    // keeps a keyed mp4 from coming out as a black silhouette.
    expect(buildVideoFilterChain(request("mp4", { chromaKey: green }))).toBe(
      "",
    );
  });

  it("caps gifs at the default frame rate and width", () => {
    const chain = buildVideoFilterChain(request("gif"));

    expect(chain).toContain(`fps=${GIF_FPS}`);
    expect(chain).toContain(`scale=${GIF_MAX_WIDTH}:-2`);
  });

  it("never raises a gif above its caps, whatever is requested", () => {
    const chain = buildVideoFilterChain(
      request("gif", { maxWidth: 4000, maxFps: 60 }),
    );

    expect(chain).toContain(`fps=${GIF_FPS}`);
    expect(chain).toContain(`scale=${GIF_MAX_WIDTH}:-2`);
  });

  it("does not upscale a source already under the cap", () => {
    const chain = buildVideoFilterChain(
      request("gif", {
        probe: videoProbe({ width: 320, height: 240, fps: 10 }),
      }),
    );

    // Split on the filter separator rather than substring matching - the
    // palette pass carries a `bayer_scale=` option that a naive check hits.
    const filters = chain.split(",");

    expect(filters.some((filter) => filter.startsWith("scale="))).toBe(false);
    expect(filters.some((filter) => filter.startsWith("fps="))).toBe(false);
  });

  it("reserves a palette slot only when there is transparency to store", () => {
    expect(
      buildVideoFilterChain(request("gif", { chromaKey: green })),
    ).toContain("reserve_transparent=1");
    expect(buildVideoFilterChain(request("gif"))).not.toContain(
      "reserve_transparent",
    );
  });

  // yuv420p cannot represent an odd dimension, and ffmpeg fails rather than
  // rounding for us. Attachments are the realistic source of these.
  it("rounds odd source dimensions up to something h264 can encode", () => {
    const chain = buildVideoFilterChain(
      request("mp4", { probe: videoProbe({ width: 641, height: 361 }) }),
    );

    expect(chain).toBe("scale=640:360");
  });

  it("keeps a scaled width even", () => {
    const chain = buildVideoFilterChain(request("mp4", { maxWidth: 427 }));

    expect(chain).toContain("scale=426:-2");
  });
});

describe("buildConvertArgs", () => {
  it("writes to the output directory with the format's extension", () => {
    expect(buildConvertArgs(request("webm")).outputPath).toBe(
      "/tmp/job/clip.webm",
    );
  });

  it("passes the filter chain as one filter_complex with a mapped output", () => {
    const { args } = buildConvertArgs(request("gif"));

    expect(args).toContain("-filter_complex");
    expect(args[args.indexOf("-filter_complex") + 1]).toStartWith("[0:v]");
    expect(args[args.indexOf("-filter_complex") + 1]).toEndWith("[vout]");
    expect(args[args.indexOf("-map") + 1]).toBe("[vout]");
  });

  it("does not map audio into a format that cannot hold it", () => {
    expect(buildConvertArgs(request("gif")).args).not.toContain("0:a?");
  });

  // A silent source is a normal thing to convert, and a hard audio map turns
  // it into an ffmpeg error.
  it("maps audio optionally so a silent source still converts", () => {
    expect(buildConvertArgs(request("mp4")).args).toContain("0:a?");
  });

  it("uses constant quality by default and bitrate mode when fitting", () => {
    expect(buildConvertArgs(request("mp4")).args).toContain("-crf");

    const fitted = buildConvertArgs(
      request("mp4", { bitrates: { videoKbps: 700, audioKbps: 128 } }),
    ).args;

    expect(fitted).not.toContain("-crf");
    expect(fitted[fitted.indexOf("-b:v") + 1]).toBe("700k");
  });

  it("ignores a bitrate request for a format with no bitrate mode", () => {
    // flac is lossless; asking for a bitrate has to fall back rather than
    // produce flags the encoder rejects.
    const args = buildConvertArgs(
      request("flac", { bitrates: { videoKbps: null, audioKbps: 64 } }),
    ).args;

    expect(args).toContain("flac");
    expect(args).not.toContain("-b:a");
  });

  it("never leaves ffmpeg waiting on stdin or an overwrite prompt", () => {
    const args = buildConvertArgs(request("mp4")).args;

    expect(args).toContain("-nostdin");
    expect(args).toContain("-y");
  });

  // `-ss` before `-i` seeks the container; after `-i` it decodes and discards
  // everything up to the mark, which on a long source is minutes of work.
  it("seeks before the input, and takes the length after it", () => {
    const { args } = buildConvertArgs(
      request("mp4", { trim: { startSeconds: 80, endSeconds: 165 } }),
    );

    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args[args.indexOf("-ss") + 1]).toBe("80");
    // A duration, not an end timestamp: `-to` alongside an input seek is
    // measured from a different origin depending on ffmpeg version.
    expect(args.indexOf("-t")).toBeGreaterThan(args.indexOf("-i"));
    expect(args[args.indexOf("-t") + 1]).toBe("85");
  });

  it("handles either end of the trim on its own", () => {
    const fromStart = buildConvertArgs(
      request("mp4", { trim: { startSeconds: 80 } }),
    ).args;
    const toEnd = buildConvertArgs(
      request("mp4", { trim: { endSeconds: 30 } }),
    ).args;

    expect(fromStart).toContain("-ss");
    expect(fromStart).not.toContain("-t");

    expect(toEnd).not.toContain("-ss");
    expect(toEnd[toEnd.indexOf("-t") + 1]).toBe("30");
  });

  it("adds no seek at all when nothing was trimmed", () => {
    const args = buildConvertArgs(request("mp4")).args;

    expect(args).not.toContain("-ss");
    expect(args).not.toContain("-t");
  });

  it("puts the output path last", () => {
    const { args, outputPath } = buildConvertArgs(request("mp4"));

    expect(args[args.length - 1]).toBe(outputPath);
  });
});

describe("planFitAttempts", () => {
  const target = 9 * 1024 * 1024;

  it("shrinks a gif by pixels and frames rather than bitrate", () => {
    const attempts = planFitAttempts(
      findMediaFormat("gif")!,
      videoProbe(),
      target,
    );

    expect(attempts.length).toBe(2);
    expect(attempts.every((a) => a.bitrates === undefined)).toBe(true);
    expect(attempts[1].maxWidth!).toBeLessThan(attempts[0].maxWidth!);
    expect(attempts[1].maxFps!).toBeLessThan(attempts[0].maxFps!);
  });

  it("gives up on lossless audio, which has no size knob at all", () => {
    expect(
      planFitAttempts(findMediaFormat("wav")!, videoProbe(), target, 99e6),
    ).toEqual([]);
    expect(
      planFitAttempts(findMediaFormat("flac")!, videoProbe(), target, 99e6),
    ).toEqual([]);
  });

  // qtrle has no bitrate to aim, but it stores whole pixels, so resolution is
  // its size lever. Before this it returned nothing at all and a keyed mov
  // always failed outright.
  it("shrinks lossless video by resolution", () => {
    const attempts = planFitAttempts(
      findMediaFormat("mov")!,
      videoProbe(),
      target,
      90 * 1024 * 1024,
    );

    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.every((attempt) => attempt.bitrates === undefined)).toBe(
      true,
    );
    expect(attempts[0].maxWidth!).toBeLessThan(videoProbe().width);
  });

  // Measured, not assumed: qtrle is run-length coded per scanline and the
  // interpolation that does the scaling puts a gradient through the flat keyed
  // regions that were compressing to nothing, so shrinking saves less than the
  // pixel count suggests. Aiming by area left a 31MB clip at 10.1MB against a
  // 10MB limit - twice, across both rungs.
  it("shrinks harder than the naive area model would", () => {
    const attempts = planFitAttempts(
      findMediaFormat("mov")!,
      videoProbe({ width: 1600, height: 900 }),
      target,
      4 * target,
    );

    // Area alone would say 800px is a quarter of the pixels and so a quarter
    // of the size. It is not, so the first rung has to sit well below that.
    expect(attempts[0].maxWidth!).toBeLessThan(800);
    expect(attempts[0].maxWidth!).toBeGreaterThan(320);
  });

  it("backs off hard between rungs rather than inching down", () => {
    const attempts = planFitAttempts(
      findMediaFormat("mov")!,
      videoProbe(),
      target,
      3 * target,
    );

    expect(attempts.length).toBeGreaterThan(1);
    for (let index = 1; index < attempts.length; index += 1) {
      expect(attempts[index].maxWidth!).toBeLessThan(
        attempts[index - 1].maxWidth!,
      );
    }
  });

  it("will not shrink lossless video into uselessness", () => {
    const attempts = planFitAttempts(
      findMediaFormat("mov")!,
      videoProbe(),
      target,
      100_000 * target,
    );

    for (const attempt of attempts) {
      expect(attempt.maxWidth!).toBeGreaterThanOrEqual(320);
    }
  });

  // The ladder is derived from the size the encode actually produced, so
  // there is nothing to compute before the first attempt has run.
  it("has no lossless plan until it knows what the first attempt produced", () => {
    expect(
      planFitAttempts(findMediaFormat("mov")!, videoProbe(), target),
    ).toEqual([]);
  });

  it("never plans a lossless width at or above the source", () => {
    const attempts = planFitAttempts(
      findMediaFormat("mov")!,
      videoProbe({ width: 320, height: 180 }),
      target,
      target * 1.01,
    );

    expect(attempts).toEqual([]);
  });

  // A bitrate is a size divided by a duration, so a container that does not
  // report one leaves nothing to compute.
  it("gives up when the source duration is unknown", () => {
    const attempts = planFitAttempts(
      findMediaFormat("mp4")!,
      videoProbe({ durationSeconds: 0 }),
      target,
    );

    expect(attempts).toEqual([]);
  });

  it("aims a video at the target and then backs off", () => {
    const attempts = planFitAttempts(
      findMediaFormat("mp4")!,
      videoProbe(),
      target,
    );

    expect(attempts).toHaveLength(2);
    expect(attempts[1].bitrates!.videoKbps!).toBeLessThan(
      attempts[0].bitrates!.videoKbps!,
    );
  });

  it("caps resolution alongside bitrate, so the picture stays watchable", () => {
    // Two hours into 9MB is a few hundred kbps; 1080p at that bitrate spends
    // everything on block edges.
    const attempts = planFitAttempts(
      findMediaFormat("mp4")!,
      videoProbe({ durationSeconds: 7200 }),
      target,
    );

    expect(attempts[0].maxWidth).toBeLessThanOrEqual(640);
  });

  it("leaves resolution alone when the budget is generous", () => {
    const attempts = planFitAttempts(
      findMediaFormat("mp4")!,
      videoProbe({ durationSeconds: 10 }),
      target,
    );

    expect(attempts[0].maxWidth).toBeUndefined();
  });

  it("never plans a video bitrate below a floor", () => {
    const attempts = planFitAttempts(
      findMediaFormat("mp4")!,
      videoProbe({ durationSeconds: 100_000 }),
      target,
    );

    expect(attempts[0].bitrates!.videoKbps!).toBeGreaterThan(0);
  });

  it("spends the whole budget on audio for an audio format", () => {
    const attempts = planFitAttempts(
      findMediaFormat("mp3")!,
      videoProbe(),
      target,
    );

    expect(attempts[0].bitrates!.videoKbps).toBeNull();
    expect(attempts[0].bitrates!.audioKbps).toBeLessThanOrEqual(320);
    expect(attempts[0].bitrates!.audioKbps).toBeGreaterThanOrEqual(64);
  });

  it("describes every attempt, so a degraded result is not a silent one", () => {
    for (const value of ["mp4", "gif", "mp3"]) {
      for (const attempt of planFitAttempts(
        findMediaFormat(value)!,
        videoProbe(),
        target,
      )) {
        expect(attempt.description.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("tooLargeMessage", () => {
  const limit = 10 * 1024 * 1024;

  it("reports the size that actually failed", () => {
    expect(tooLargeMessage(240 * 1024 * 1024, limit)).toContain("240.0MB");
  });

  // The original bug: the command passed its *input* size, so the reply read
  // "that came out to 9.1MB and the limit is 10.0MB" - a failure message
  // naming a size under the limit it says was exceeded.
  it("never names a size that is under the limit it cites", () => {
    const message = tooLargeMessage(240 * 1024 * 1024, limit);

    expect(message).toContain("240.0MB");
    expect(message).toContain("10.0MB");
  });

  it("points someone who wanted transparency at the format that compresses", () => {
    const message = tooLargeMessage(
      240 * 1024 * 1024,
      limit,
      findMediaFormat("mov")!,
    );

    expect(message).toContain("lossless");
    expect(message).toContain("webm");
  });

  it("points lossless audio at the lossy audio formats", () => {
    const message = tooLargeMessage(
      99 * 1024 * 1024,
      limit,
      findMediaFormat("wav")!,
    );

    expect(message).toContain("mp3");
    expect(message).not.toContain("webm");
  });

  it("gives generic advice for a format that was already squeezed", () => {
    const message = tooLargeMessage(
      99 * 1024 * 1024,
      limit,
      findMediaFormat("mp4")!,
    );

    expect(message).not.toContain("lossless");
    expect(message).toContain("shorter clip");
  });
});

describe("probeAfterTrim", () => {
  const probe = {
    durationSeconds: 600,
    hasVideo: true,
    hasAudio: true,
    width: 1920,
    height: 1080,
    fps: 30,
  };

  // The bitrate budget is the target size divided by how long the output runs.
  // Planning against the source length would hand a ten second cut of a ten
  // minute video a sixtieth of the bitrate it can afford.
  it("reports the length of the trim, not of the source", () => {
    expect(
      probeAfterTrim(probe, { startSeconds: 60, endSeconds: 70 })
        .durationSeconds,
    ).toBe(10);
  });

  it("leaves everything but the duration alone", () => {
    const trimmed = probeAfterTrim(probe, { endSeconds: 30 });

    expect(trimmed.width).toBe(probe.width);
    expect(trimmed.height).toBe(probe.height);
    expect(trimmed.fps).toBe(probe.fps);
  });

  it("passes the probe straight through when there is no trim", () => {
    expect(probeAfterTrim(probe, undefined)).toBe(probe);
    expect(probeAfterTrim(probe, {})).toBe(probe);
  });
});
