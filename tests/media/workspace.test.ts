import { describe, expect, it } from "bun:test";
import { readdir, writeFile } from "fs/promises";
import { basename, dirname } from "path";
import {
  createMediaWorkspace,
  fileSize,
  safeFileBase,
} from "../../modules/media/workspace";

describe("safeFileBase", () => {
  it("keeps a normal title readable", () => {
    expect(safeFileBase("Rick Astley - Never Gonna Give You Up")).toBe(
      "Rick_Astley_-_Never_Gonna_Give_You_Up",
    );
  });

  // The result is handed to Discord as an attachment name and lands on the
  // disk of everyone who saves it.
  it("strips path separators and traversal", () => {
    const name = safeFileBase("../../etc/passwd");

    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
  });

  it("strips quotes and shell punctuation", () => {
    const name = safeFileBase('a"b`c;d$(e)f g');

    expect(name).toMatch(/^[\p{L}\p{N}\-_]+$/u);
  });

  it("keeps letters from titles that are not in English", () => {
    expect(safeFileBase("ダンス - 踊り")).toBe("ダンス_-_踊り");
  });

  it("falls back when nothing usable survives", () => {
    expect(safeFileBase("///")).toBe("media");
    expect(safeFileBase("", "download")).toBe("download");
  });

  it("stays short enough to be a filename", () => {
    expect(safeFileBase("x".repeat(400)).length).toBeLessThanOrEqual(60);
  });

  it("does not leave a separator dangling off the length cut", () => {
    expect(safeFileBase(`${"x".repeat(59)} tail`)).not.toEndWith("_");
  });
});

describe("createMediaWorkspace", () => {
  it("gives each job its own directory", async () => {
    const first = await createMediaWorkspace();
    const second = await createMediaWorkspace();

    try {
      expect(first.dir).not.toBe(second.dir);
      expect(dirname(first.dir)).toBe(dirname(second.dir));
      expect(basename(first.dir)).toStartWith("fini-media-");
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });

  it("deletes the directory and its contents, and tolerates a second cleanup", async () => {
    const workspace = await createMediaWorkspace();
    await writeFile(`${workspace.dir}/leftover.mp4`, "not really a video");

    expect(await fileSize(`${workspace.dir}/leftover.mp4`)).toBeGreaterThan(0);

    await workspace.cleanup();
    await workspace.cleanup();

    await expect(readdir(workspace.dir)).rejects.toThrow();
  });
});
