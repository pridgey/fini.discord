import { describe, expect, it } from "bun:test";
import {
  DEFAULT_UPLOAD_LIMIT_BYTES,
  fitTargetBytes,
  formatBytes,
  uploadLimitBytes,
} from "../../modules/media/uploadLimit";

const MIB = 1024 * 1024;

describe("uploadLimitBytes", () => {
  it("maps each boost tier to its ceiling", () => {
    expect(uploadLimitBytes(0)).toBe(10 * MIB);
    expect(uploadLimitBytes(1)).toBe(10 * MIB);
    expect(uploadLimitBytes(2)).toBe(50 * MIB);
    expect(uploadLimitBytes(3)).toBe(100 * MIB);
  });

  // Guessing high is the expensive mistake: the upload only fails once the
  // whole file has been sent.
  it("falls back to the smallest ceiling when the tier is unknown", () => {
    expect(uploadLimitBytes(undefined)).toBe(DEFAULT_UPLOAD_LIMIT_BYTES);
    expect(uploadLimitBytes(99)).toBe(DEFAULT_UPLOAD_LIMIT_BYTES);
  });
});

describe("fitTargetBytes", () => {
  it("leaves headroom below the ceiling", () => {
    const limit = 10 * MIB;

    expect(fitTargetBytes(limit)).toBeLessThan(limit);
    expect(fitTargetBytes(limit)).toBeGreaterThan(limit / 2);
  });

  it("never gives back a target at or below zero", () => {
    expect(fitTargetBytes(1024)).toBeGreaterThan(0);
  });
});

describe("formatBytes", () => {
  it("scales the unit to the size", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(2048)).toBe("2KB");
    expect(formatBytes(Math.round(12.4 * MIB))).toBe("12.4MB");
  });
});
