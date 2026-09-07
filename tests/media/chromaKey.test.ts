import { describe, expect, it } from "bun:test";
import {
  DEFAULT_BLEND,
  DEFAULT_SIMILARITY,
  NAMED_CHROMA_COLORS,
  buildChromaKey,
  colorkeyFilter,
  parseChromaColor,
} from "../../modules/media/chromaKey";

describe("parseChromaColor", () => {
  it("accepts the named colours", () => {
    expect(parseChromaColor("green")).toBe("0x00FF00");
    expect(parseChromaColor("GREENSCREEN")).toBe("0x00B140");
    expect(parseChromaColor("  blue  ")).toBe("0x0000FF");
  });

  it("accepts hex in the shapes people actually type", () => {
    for (const input of ["#00ff00", "00ff00", "0x00FF00", "#0F0"]) {
      expect(parseChromaColor(input)).toBe("0x00FF00");
    }
  });

  it("rejects anything that is not a colour", () => {
    for (const input of [
      "",
      "   ",
      "chartreuse",
      "#12345",
      "#1234567",
      "gg0000",
    ]) {
      expect(parseChromaColor(input)).toBeNull();
    }
  });

  // The parsed value is interpolated into a comma and colon delimited filter
  // graph. Emitting only 0xRRGGBB is what makes escaping unnecessary, so a
  // colour that smuggles a delimiter through would be a live injection into
  // the ffmpeg filter chain.
  it("never emits a filter delimiter, whatever it is handed", () => {
    for (const input of [
      "green:0.9,drawbox=color=red",
      "#00ff00'",
      "0x00FF00@0.5",
      "red[a];[a]",
    ]) {
      const parsed = parseChromaColor(input);
      expect(parsed === null || /^0x[0-9A-F]{6}$/.test(parsed)).toBe(true);
    }
  });
});

describe("buildChromaKey", () => {
  it("defaults similarity and blend when they are not given", () => {
    expect(buildChromaKey("green")).toEqual({
      color: "0x00FF00",
      similarity: DEFAULT_SIMILARITY,
      blend: DEFAULT_BLEND,
    });
  });

  it("defaults rather than propagating a NaN from an absent option", () => {
    // Commands read the option with Number(undefined), so NaN is the normal
    // "not supplied" value reaching this function - and NaN in the filter
    // string is an ffmpeg parse error rather than a default.
    const key = buildChromaKey("green", Number(undefined), Number(undefined));

    expect(key?.similarity).toBe(DEFAULT_SIMILARITY);
    expect(key?.blend).toBe(DEFAULT_BLEND);
  });

  it("clamps out-of-range tuning to the usable range", () => {
    expect(buildChromaKey("green", 99, 99)).toMatchObject({
      similarity: 1,
      blend: 1,
    });
    expect(buildChromaKey("green", -5, -5)).toMatchObject({
      similarity: 0.01,
      blend: 0,
    });
  });

  it("returns null for a colour it cannot parse", () => {
    expect(buildChromaKey("puce")).toBeNull();
  });
});

describe("colorkeyFilter", () => {
  it("renders a filter ffmpeg can parse", () => {
    expect(colorkeyFilter(buildChromaKey("green", 0.4, 0.2)!)).toBe(
      "colorkey=0x00FF00:0.400:0.200",
    );
  });

  // toFixed rather than the raw number: 1e-7 stringifies to "1e-7", which
  // ffmpeg reads as a malformed option value.
  it("never falls into exponent notation", () => {
    const filter = colorkeyFilter(buildChromaKey("green", 0.0000001, 0)!);

    expect(filter).not.toContain("e-");
  });

  it("covers every named colour", () => {
    for (const [name, hex] of Object.entries(NAMED_CHROMA_COLORS)) {
      expect(parseChromaColor(name)).toBe(hex);
    }
  });
});
