import { mkdtemp, open, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Scratch space for a media job.
 *
 * Every job gets its own directory under the system temp dir and deletes it
 * whole when it is done. Two reasons it is a directory rather than named
 * files: yt-dlp writes intermediate per-stream files next to its output and
 * only cleans them up on a successful merge, and a fixed filename would let
 * two people running the same command at once overwrite each other's work.
 */

export type MediaWorkspace = {
  /** Absolute path to the job's private directory. */
  dir: string;
  /** Deletes the directory and everything in it. Safe to call twice. */
  cleanup: () => Promise<void>;
};

/**
 * Creates a private working directory.
 * @returns The directory and its cleanup function
 */
export const createMediaWorkspace = async (): Promise<MediaWorkspace> => {
  const dir = await mkdtemp(join(tmpdir(), "fini-media-"));

  return {
    dir,
    cleanup: async () => {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch (err) {
        // A failed cleanup leaves a few megabytes in /tmp. Worth a log line,
        // not worth failing a job that already produced its file.
        console.error("Error cleaning media workspace:", { dir, err });
      }
    },
  };
};

/**
 * Turns a title into something safe to hand Discord as an attachment name.
 *
 * Discord shows the name to everyone in the channel and it ends up on disk
 * when someone saves it, so path separators and control characters have to go.
 * @param name The source title, which may be empty or all punctuation
 * @param fallback Used when nothing usable survives
 * @returns A filename base, without an extension, at most 60 characters
 */
export const safeFileBase = (name: string, fallback = "media"): string => {
  const cleaned = name
    // NFC, not NFKD: decomposing splits a Japanese dakuten or a Latin accent
    // into a base character plus a combining mark, and the mark is then
    // stripped as punctuation below - turning a title into a misspelling of
    // itself rather than a transliteration of it.
    .normalize("NFC")
    // Anything that is not a letter, digit, combining mark, dash, underscore
    // or space.
    .replace(/[^\p{L}\p{N}\p{M}\-_ ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "_")
    .slice(0, 60)
    // A trailing separator left by the slice reads as a broken name.
    .replace(/[-_]+$/, "");

  return cleaned || fallback;
};

/**
 * Downloads a Discord attachment to disk.
 *
 * Streamed and size-capped rather than buffered: the bot can be handed a
 * hundred megabytes by a boosted guild, and holding that in a Buffer while
 * ffmpeg also runs is how a small VPS gets OOM-killed. The cap is enforced on
 * bytes seen, not on `content-length`, because that header is a claim.
 * @param url The attachment's CDN url
 * @param destination Absolute path to write to
 * @param maxBytes Refuse anything larger than this
 * @param timeoutMs Abort the transfer if it has not finished by then
 * @returns The number of bytes written
 * @throws If the fetch fails, stalls, or the cap is exceeded
 */
export const downloadToFile = async (
  url: string,
  destination: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<number> => {
  // A CDN that accepts the connection and then stops sending would otherwise
  // hang the job until the interaction token expired, holding one of the two
  // media slots the whole time.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  try {
    return await streamToFile(url, destination, maxBytes, abort.signal);
  } finally {
    clearTimeout(timer);
  }
};

/** The transfer itself, split out so the timeout can wrap it. */
const streamToFile = async (
  url: string,
  destination: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<number> => {
  const response = await fetch(url, { signal });

  if (!response.ok || !response.body) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const claimed = Number(response.headers.get("content-length"));
  if (Number.isFinite(claimed) && claimed > maxBytes) {
    throw new Error("File is too large");
  }

  const handle = await open(destination, "w");
  let written = 0;

  try {
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Counted as it arrives, not from `content-length`: that header is a
      // claim, and checking after the fact means an oversized file has
      // already landed on disk.
      written += value.length;
      if (written > maxBytes) {
        throw new Error("File is too large");
      }

      await handle.write(value);
    }
  } finally {
    await handle.close();
  }

  return written;
};

/**
 * Size of a file on disk.
 * @param path The file to measure
 * @returns The size in bytes
 */
export const fileSize = async (path: string): Promise<number> =>
  (await stat(path)).size;
