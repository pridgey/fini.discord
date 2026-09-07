import { randomBytes } from "crypto";
import { copyFile, mkdir, readdir, rename, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";

/**
 * Hands a file out as a link instead of a Discord attachment.
 *
 * Discord caps uploads at 10MB on an unboosted guild, which is about a minute
 * of 720p, and no amount of re-encoding rescues a long clip. This publishes the
 * file at an unguessable url served off the box by Tailscale Funnel, so the
 * commands have somewhere to go when the file genuinely will not fit.
 *
 * Deliberately not one-time links, which is where this started. A one-time
 * link is the right shape for handing someone a file directly, and the wrong
 * shape for posting into a channel: the first person to click - quite possibly
 * Discord's own link crawler generating a preview - burns it for everyone else.
 * Time-to-live is what actually matches "a few friends watch a clip".
 */

/**
 * Where published files live until they expire.
 *
 * Under the system temp dir rather than the repo so a reboot cleans up
 * anything a crash left behind, and on the same filesystem as the job
 * workspaces so publishing is a rename rather than a copy of 200MB.
 */
export const SHARE_DIR = join(tmpdir(), "fini-share");

/**
 * How long a link lives by default.
 *
 * Long enough that someone who was asleep when it was posted still gets the
 * clip, short enough that the box is not a permanent file host.
 */
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Bytes of randomness in a token. 16 is 128 bits, rendered as 22 characters. */
const TOKEN_BYTES = 16;

/**
 * Ceiling on everything held in the share directory at once.
 *
 * Without one, the only bound on disk use is the TTL: two concurrent jobs
 * producing large files for twenty-four hours can fill /tmp, and a full /tmp
 * takes down more than the bot. Oldest-expiring shares are evicted to make
 * room rather than refusing the new one, since the newest link is the one
 * somebody is waiting on.
 */
export const maxShareBytes = (): number =>
  Number(process.env.FINI_SHARE_MAX_BYTES) || 5 * 1024 * 1024 * 1024;

/** Longest filename kept, before the extension is considered. */
const MAX_NAME_LENGTH = 120;

/**
 * Cleans a filename before it is stored.
 *
 * This name is interpolated into a `Content-Disposition` header. Callers do
 * sanitise their own titles, but a module that puts a string into a response
 * header should not be relying on that - a newline here would be header
 * injection, and Node's own guard turns it into a 500 rather than a refusal.
 * @param name The proposed filename
 * @returns A name safe to put in a header
 */
export const safeAttachmentName = (name: string): string => {
  const cleaned = name
    // Control characters, quotes, backslashes and path separators. CR and LF
    // are the ones that matter; the rest just have no business in a filename.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f"\\/]+/g, "_")
    .trim()
    .slice(0, MAX_NAME_LENGTH);

  // A name of nothing but separators is technically a filename and useless as
  // one - "///" scrubs down to "_", which is not an improvement on a default.
  return /[^_.\s]/.test(cleaned) ? cleaned : "download";
};

export type SharedFile = {
  token: string;
  /** Absolute path inside `SHARE_DIR`. Never derived from a request. */
  path: string;
  /** Filename shown to whoever downloads it. */
  name: string;
  contentType: string;
  bytes: number;
  expiresAt: number;
};

/**
 * Live shares, keyed by token.
 *
 * In memory, so a restart invalidates every outstanding link. That is a real
 * limitation and an accepted one: the alternative is a Pocketbase collection
 * and a migration for records whose whole lifetime is a day, and the files
 * themselves are in a temp dir that a reboot clears anyway. `resetShareDir`
 * sweeps the orphans on boot so the two cannot drift apart.
 */
const shares = new Map<string, SharedFile>();

/**
 * The public base url, from `FINI_SHARE_BASE_URL`.
 *
 * Absent means the whole feature is off and the commands fall back to telling
 * the user the file was too large - which is what they did before this
 * existed. Sharing is opt-in on purpose: it publishes to the whole internet,
 * and that should never happen because someone forgot to configure something.
 * @returns The base url without a trailing slash, or undefined when unset
 */
export const shareBaseUrl = (): string | undefined =>
  process.env.FINI_SHARE_BASE_URL?.trim().replace(/\/+$/, "") || undefined;

/**
 * Whether links can be handed out at all.
 * @returns True when a base url is configured
 */
export const isSharingEnabled = (): boolean => Boolean(shareBaseUrl());

/** Port the local share server listens on, loopback only. */
export const sharePort = (): number =>
  Number(process.env.FINI_SHARE_PORT) || 8787;

export type PublishRequest = {
  /** File to publish. It is moved, so the caller must not use it afterwards. */
  sourcePath: string;
  /** Filename for the download. */
  name: string;
  contentType: string;
  ttlMs?: number;
};

export type PublishedFile = {
  url: string;
  expiresAt: number;
  bytes: number;
};

/**
 * Publishes a file and returns its link.
 *
 * The file is moved out of the job workspace, because the workspace is deleted
 * the moment the command finishes and the link has to outlive it by a day.
 * @param request What to publish
 * @returns The public url and when it dies
 * @throws If sharing is not configured
 */
export const publishFile = async ({
  sourcePath,
  name,
  contentType,
  ttlMs = DEFAULT_TTL_MS,
}: PublishRequest): Promise<PublishedFile> => {
  const base = shareBaseUrl();
  if (!base) throw new Error("File sharing is not configured");

  await mkdir(SHARE_DIR, { recursive: true });

  const safeName = safeAttachmentName(name);

  // Hand-rolled base64url rather than `.toString("base64url")`: the runtime
  // supports it but this project's @types/node predates the encoding, so the
  // typed form does not compile.
  const token = randomBytes(TOKEN_BYTES)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  // The stored name is the token, not the user-facing one: nothing a user
  // supplied ever becomes a path component. The real name is served back in
  // the Content-Disposition header instead.
  const path = join(SHARE_DIR, `${token}${extname(safeName)}`);

  try {
    await rename(sourcePath, path);
  } catch {
    // Different filesystems - falls back to a copy. Only happens if TMPDIR and
    // the workspace end up on separate mounts.
    await copyFile(sourcePath, path);
    await rm(sourcePath, { force: true });
  }

  const bytes = (await stat(path)).size;
  const expiresAt = Date.now() + ttlMs;

  await evictToFit(bytes);

  shares.set(token, {
    token,
    path,
    name: safeName,
    contentType,
    bytes,
    expiresAt,
  });

  return { url: `${base}/${token}`, expiresAt, bytes };
};

/**
 * Total bytes currently held.
 * @returns The sum of every live share's size
 */
export const sharedBytes = (): number =>
  [...shares.values()].reduce((total, share) => total + share.bytes, 0);

/**
 * Drops the soonest-expiring shares until a new file fits under the cap.
 *
 * Soonest-expiring rather than largest, so eviction takes the links closest to
 * dying anyway instead of the one big file somebody is actively downloading.
 * @param incomingBytes Size of the file about to be added
 */
const evictToFit = async (incomingBytes: number): Promise<void> => {
  const cap = maxShareBytes();

  const byExpiry = [...shares.values()].sort(
    (left, right) => left.expiresAt - right.expiresAt,
  );

  let total = sharedBytes();

  for (const share of byExpiry) {
    if (total + incomingBytes <= cap) return;

    shares.delete(share.token);
    total -= share.bytes;

    console.log("Evicting shared file to stay under the size cap:", {
      token: share.token,
      bytes: share.bytes,
    });

    try {
      await rm(share.path, { force: true });
    } catch (err) {
      console.error("Error evicting shared file:", { token: share.token, err });
    }
  }
};

/**
 * Looks up a live share.
 * @param token The token from the request path
 * @returns The share, or undefined if unknown or expired
 */
export const lookupShare = (token: string): SharedFile | undefined => {
  const share = shares.get(token);
  if (!share) return undefined;

  // Checked on read as well as on the sweep, so an expired link is dead the
  // moment it expires rather than up to a minute later.
  if (share.expiresAt <= Date.now()) return undefined;

  return share;
};

/**
 * Deletes expired shares and their files. Called from the poll loop.
 * @returns How many shares were removed
 */
export const expireSharedFiles = async (): Promise<number> => {
  const now = Date.now();
  let removed = 0;

  for (const [token, share] of shares) {
    if (share.expiresAt > now) continue;

    shares.delete(token);
    removed += 1;

    try {
      await rm(share.path, { force: true });
    } catch (err) {
      console.error("Error removing expired share:", { token, err });
    }
  }

  return removed;
};

/**
 * Empties the share directory and forgets every token.
 *
 * On startup the map is already empty and this is only about the files: the
 * map does not survive a restart, so anything on disk is unreachable by
 * definition and would sit there until the next reboot.
 *
 * It clears the map as well so the two cannot disagree. Deleting the files
 * while leaving the tokens behind would leave live-looking links pointing at
 * nothing, which is a worse failure than a dead link - the server would 200
 * and then error mid-stream.
 * @returns How many orphaned files were deleted
 */
export const resetShareDir = async (): Promise<number> => {
  shares.clear();

  try {
    await mkdir(SHARE_DIR, { recursive: true });
    const orphans = await readdir(SHARE_DIR);

    for (const orphan of orphans) {
      await rm(join(SHARE_DIR, orphan), { force: true });
    }

    return orphans.length;
  } catch (err) {
    console.error("Error resetting share directory:", { err });
    return 0;
  }
};

/**
 * How many links are currently live, for logging.
 * @returns The count of live shares
 */
export const activeShareCount = (): number => shares.size;

/**
 * Publishes a file, or gives back null if it cannot.
 *
 * The commands use this rather than `publishFile` directly because a link is
 * an improvement on their fallback, not a replacement for it: if sharing is
 * off or the publish fails, the right answer is still the "too large" message,
 * not an error. Nothing here should turn a working command into a broken one.
 * @param request What to publish
 * @returns The published file, or null when sharing is unavailable
 */
export const tryPublishFile = async (
  request: PublishRequest,
): Promise<PublishedFile | null> => {
  if (!isSharingEnabled()) return null;

  try {
    return await publishFile(request);
  } catch (err) {
    console.error("Error publishing shared file:", {
      name: request.name,
      err,
    });
    return null;
  }
};

/**
 * Renders an expiry as a Discord relative timestamp.
 *
 * Discord renders `<t:unix:R>` as "in 24 hours" in each viewer's own locale
 * and keeps counting down, which beats baking a fixed string into a message
 * that people scroll back to hours later.
 * @param expiresAt Epoch milliseconds
 * @returns The Discord timestamp markup
 */
export const expiryTimestamp = (expiresAt: number): string =>
  `<t:${Math.floor(expiresAt / 1000)}:R>`;
