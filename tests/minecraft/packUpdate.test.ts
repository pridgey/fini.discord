import { describe, expect, it } from "bun:test";
import {
  isNewerVersion,
  versionFromFileName,
} from "../../modules/minecraft/packUpdate";

describe("versionFromFileName", () => {
  it.each([
    ["All the Mons-1.3.0.zip", "1.3.0"],
    ["All the Mons-0.13.0-beta.zip", "0.13.0-beta"],
    ["ServerFiles-0.10.0-beta.zip", "0.10.0-beta"],
  ])("reads %p as %p", (fileName, expected) => {
    expect(versionFromFileName(fileName)).toBe(expected);
  });

  it("returns null when there is no version to read", () => {
    expect(versionFromFileName("All the Mons.zip")).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it.each([
    ["1.4.0", "1.3.0"],
    ["1.3.1", "1.3.0"],
    ["2.0.0", "1.99.99"],
    // 13 > 3 numerically, which a plain string compare gets wrong
    ["0.13.0", "0.3.0"],
    // the released build supersedes the beta of the same version
    ["1.3.0", "1.3.0-beta"],
  ])("treats %p as newer than %p", (candidate, current) => {
    expect(isNewerVersion(candidate, current)).toBe(true);
  });

  it.each([
    ["1.3.0", "1.3.0"],
    ["1.2.0", "1.3.0"],
    ["1.3.0-beta", "1.3.0"],
    ["0.3.0", "0.13.0"],
  ])("does not treat %p as newer than %p", (candidate, current) => {
    expect(isNewerVersion(candidate, current)).toBe(false);
  });
});
