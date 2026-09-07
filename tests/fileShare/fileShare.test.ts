import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { mkdtemp, readdir, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  SHARE_DIR,
  expireSharedFiles,
  expiryTimestamp,
  isSharingEnabled,
  lookupShare,
  publishFile,
  resetShareDir,
  safeAttachmentName,
  shareBaseUrl,
  sharePort,
  sharedBytes,
  tryPublishFile,
} from "../../modules/fileShare/fileShare";

const BASE = "https://friday.polydactyl-duckbill.ts.net/f";

/**
 * Scratch directories to remove when the file finishes.
 *
 * Publishing *moves* the file out, so these are empty afterwards and easy to
 * forget - which is how a test suite quietly leaves dozens of directories in
 * /tmp on every run.
 */
const scratchDirs: string[] = [];

/** A throwaway file in its own directory, standing in for a job workspace. */
const scratchFile = async (name: string, contents = "video bytes") => {
  const dir = await mkdtemp(join(tmpdir(), "fini-share-test-"));
  scratchDirs.push(dir);

  const path = join(dir, name);
  await writeFile(path, contents);

  return path;
};

afterAll(async () => {
  for (const dir of scratchDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

/** The token out of a published url. */
const tokenOf = (url: string) => url.split("/").pop()!;

describe("configuration", () => {
  const original = process.env.FINI_SHARE_BASE_URL;

  afterEach(() => {
    process.env.FINI_SHARE_BASE_URL = original;
  });

  // Publishing puts a file on the public internet. That must never happen
  // because a variable was left unset and something defaulted helpfully.
  it("is off unless a base url is configured", () => {
    delete process.env.FINI_SHARE_BASE_URL;
    expect(isSharingEnabled()).toBe(false);
    expect(shareBaseUrl()).toBeUndefined();

    process.env.FINI_SHARE_BASE_URL = "   ";
    expect(isSharingEnabled()).toBe(false);
  });

  it("trims a trailing slash so urls do not double up", () => {
    process.env.FINI_SHARE_BASE_URL = `${BASE}///`;
    expect(shareBaseUrl()).toBe(BASE);
  });

  it("defaults the port but takes an override", () => {
    const originalPort = process.env.FINI_SHARE_PORT;

    delete process.env.FINI_SHARE_PORT;
    expect(sharePort()).toBe(8787);

    process.env.FINI_SHARE_PORT = "9999";
    expect(sharePort()).toBe(9999);

    process.env.FINI_SHARE_PORT = originalPort;
  });
});

describe("publishFile", () => {
  const original = process.env.FINI_SHARE_BASE_URL;

  beforeEach(() => {
    process.env.FINI_SHARE_BASE_URL = BASE;
  });

  afterEach(async () => {
    process.env.FINI_SHARE_BASE_URL = original;
    await resetShareDir();
  });

  it("returns a url under the configured base", async () => {
    const shared = await publishFile({
      sourcePath: await scratchFile("clip.mp4"),
      name: "clip.mp4",
      contentType: "video/mp4",
    });

    expect(shared.url).toStartWith(`${BASE}/`);
    expect(shared.bytes).toBeGreaterThan(0);
    expect(shared.expiresAt).toBeGreaterThan(Date.now());
  });

  // The workspace is deleted the moment the command returns, so a link into it
  // would 404 within seconds.
  it("moves the file out of the caller's workspace", async () => {
    const source = await scratchFile("clip.mp4");

    const shared = await publishFile({
      sourcePath: source,
      name: "clip.mp4",
      contentType: "video/mp4",
    });

    await expect(stat(source)).rejects.toThrow();
    expect(lookupShare(tokenOf(shared.url))?.path).toStartWith(SHARE_DIR);
  });

  // Nothing a user supplied may become a path component. The real name is
  // carried in the Content-Disposition header instead.
  it("names the file on disk after the token, not the user's title", async () => {
    const shared = await publishFile({
      sourcePath: await scratchFile("clip.mp4"),
      name: "../../etc/passwd.mp4",
      contentType: "video/mp4",
    });

    const share = lookupShare(tokenOf(shared.url))!;

    expect(share.path).toBe(join(SHARE_DIR, `${share.token}.mp4`));
    expect(share.path).not.toContain("passwd");
    // The stored name is scrubbed too - it goes into a response header.
    expect(share.name).toBe(".._.._etc_passwd.mp4");
  });

  // This name is interpolated into Content-Disposition. A newline would be
  // header injection, and Node turns that into a 500 rather than refusing -
  // so the module scrubs it rather than trusting callers to have done it.
  it("scrubs anything that could break out of a response header", async () => {
    const shared = await publishFile({
      sourcePath: await scratchFile("clip.mp4"),
      name: 'evil"\r\nX-Injected: yes\r\n\r\n.mp4',
      contentType: "video/mp4",
    });

    const { name } = lookupShare(tokenOf(shared.url))!;

    expect(name).not.toContain("\r");
    expect(name).not.toContain("\n");
    expect(name).not.toContain('"');
  });

  it("never lets a name grow unbounded", async () => {
    const shared = await publishFile({
      sourcePath: await scratchFile("clip.mp4"),
      name: `${"x".repeat(5000)}.mp4`,
      contentType: "video/mp4",
    });

    expect(lookupShare(tokenOf(shared.url))!.name.length).toBeLessThanOrEqual(
      120,
    );
  });

  it("falls back to a usable name when nothing survives scrubbing", () => {
    expect(safeAttachmentName("///")).toBe("download");
    expect(safeAttachmentName("")).toBe("download");
  });

  it("gives every publish a distinct unguessable token", async () => {
    const tokens = new Set<string>();

    for (let index = 0; index < 5; index += 1) {
      const shared = await publishFile({
        sourcePath: await scratchFile(`clip${index}.mp4`),
        name: `clip${index}.mp4`,
        contentType: "video/mp4",
      });
      const token = tokenOf(shared.url);

      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      tokens.add(token);
    }

    expect(tokens.size).toBe(5);
  });

  it("refuses to publish when sharing is not configured", async () => {
    delete process.env.FINI_SHARE_BASE_URL;

    await expect(
      publishFile({
        sourcePath: await scratchFile("clip.mp4"),
        name: "clip.mp4",
        contentType: "video/mp4",
      }),
    ).rejects.toThrow();
  });
});

describe("lookupShare and expiry", () => {
  const original = process.env.FINI_SHARE_BASE_URL;

  beforeEach(() => {
    process.env.FINI_SHARE_BASE_URL = BASE;
  });

  afterEach(async () => {
    process.env.FINI_SHARE_BASE_URL = original;
    await resetShareDir();
  });

  it("finds a live share", async () => {
    const shared = await publishFile({
      sourcePath: await scratchFile("clip.mp4"),
      name: "clip.mp4",
      contentType: "video/mp4",
    });

    expect(lookupShare(tokenOf(shared.url))?.contentType).toBe("video/mp4");
  });

  it("does not find one that was never issued", () => {
    expect(lookupShare("definitely-not-a-token")).toBeUndefined();
  });

  // Expiry is checked on read as well as on the sweep, so a link dies on time
  // rather than up to a minute late.
  it("stops serving an expired share before the sweep runs", async () => {
    const shared = await publishFile({
      sourcePath: await scratchFile("clip.mp4"),
      name: "clip.mp4",
      contentType: "video/mp4",
      ttlMs: -1,
    });

    expect(lookupShare(tokenOf(shared.url))).toBeUndefined();
  });

  it("deletes expired files from disk and leaves live ones alone", async () => {
    const dead = await publishFile({
      sourcePath: await scratchFile("dead.mp4"),
      name: "dead.mp4",
      contentType: "video/mp4",
      ttlMs: -1,
    });
    const live = await publishFile({
      sourcePath: await scratchFile("live.mp4"),
      name: "live.mp4",
      contentType: "video/mp4",
    });

    expect(await expireSharedFiles()).toBe(1);
    expect(await readdir(SHARE_DIR)).toHaveLength(1);
    expect(lookupShare(tokenOf(live.url))).toBeDefined();
    expect(lookupShare(tokenOf(dead.url))).toBeUndefined();
  });

  // The token map is in memory, so anything on disk after a restart is
  // unreachable by definition and would sit there until the next reboot.
  it("sweeps orphaned files on startup", async () => {
    await publishFile({
      sourcePath: await scratchFile("orphan.mp4"),
      name: "orphan.mp4",
      contentType: "video/mp4",
    });

    expect(await resetShareDir()).toBeGreaterThan(0);
    expect(await readdir(SHARE_DIR)).toHaveLength(0);
  });
});

describe("tryPublishFile", () => {
  const original = process.env.FINI_SHARE_BASE_URL;

  afterEach(async () => {
    process.env.FINI_SHARE_BASE_URL = original;
    await resetShareDir();
  });

  // A link is an improvement on the fallback, not a replacement for it - this
  // must never turn a working command into a broken one.
  it("gives back null instead of throwing when sharing is off", async () => {
    delete process.env.FINI_SHARE_BASE_URL;

    expect(
      await tryPublishFile({
        sourcePath: await scratchFile("clip.mp4"),
        name: "clip.mp4",
        contentType: "video/mp4",
      }),
    ).toBeNull();
  });

  it("gives back null when the source file is missing", async () => {
    process.env.FINI_SHARE_BASE_URL = BASE;

    expect(
      await tryPublishFile({
        sourcePath: "/tmp/does-not-exist-at-all.mp4",
        name: "clip.mp4",
        contentType: "video/mp4",
      }),
    ).toBeNull();
  });
});

describe("expiryTimestamp", () => {
  it("renders Discord's relative timestamp markup in seconds", () => {
    expect(expiryTimestamp(1_700_000_000_000)).toBe("<t:1700000000:R>");
  });
});

describe("the share directory size cap", () => {
  const original = process.env.FINI_SHARE_BASE_URL;
  const originalCap = process.env.FINI_SHARE_MAX_BYTES;

  beforeEach(() => {
    process.env.FINI_SHARE_BASE_URL = BASE;
  });

  afterEach(async () => {
    process.env.FINI_SHARE_BASE_URL = original;
    process.env.FINI_SHARE_MAX_BYTES = originalCap;
    await resetShareDir();
  });

  const publishSized = (bytes: number, ttlMs?: number) =>
    scratchFile("clip.mp4", "x".repeat(bytes)).then((sourcePath) =>
      publishFile({
        sourcePath,
        name: "clip.mp4",
        contentType: "video/mp4",
        ttlMs,
      }),
    );

  // Without a cap the only bound on disk is the 24h TTL, and a full /tmp takes
  // down more than the bot.
  it("evicts old shares rather than growing past the cap", async () => {
    process.env.FINI_SHARE_MAX_BYTES = "2500";

    await publishSized(1000, 1000);
    await publishSized(1000, 2000);
    await publishSized(1000, 3000);

    expect(sharedBytes()).toBeLessThanOrEqual(2500);
    expect(await readdir(SHARE_DIR)).toHaveLength(2);
  });

  // Soonest-expiring goes first, so eviction takes the links closest to dying
  // anyway rather than the file someone is mid-download on.
  it("evicts the soonest to expire first", async () => {
    process.env.FINI_SHARE_MAX_BYTES = "2500";

    const soon = await publishSized(1000, 1000);
    const later = await publishSized(1000, 60_000);
    await publishSized(1000, 60_000);

    expect(lookupShare(tokenOf(soon.url))).toBeUndefined();
    expect(lookupShare(tokenOf(later.url))).toBeDefined();
  });
});
