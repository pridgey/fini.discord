import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  parseRange,
  resetRateLimit,
  startShareServer,
  stopShareServer,
  tokenFromPath,
} from "../../modules/fileShare/shareServer";
import { publishFile, resetShareDir } from "../../modules/fileShare/fileShare";

describe("tokenFromPath", () => {
  // Funnel can be mounted at the root or under a prefix, and whether it
  // forwards that prefix or strips it depends on how it was set up. Reading
  // from the end works either way.
  it("reads the last segment whatever the prefix", () => {
    expect(tokenFromPath("/f/abc123")).toBe("abc123");
    expect(tokenFromPath("/abc123")).toBe("abc123");
    expect(tokenFromPath("/deeply/nested/abc123")).toBe("abc123");
    expect(tokenFromPath("/f/abc123/")).toBe("abc123");
  });

  it("ignores a query string", () => {
    expect(tokenFromPath("/f/abc123?download=1")).toBe("abc123");
  });

  it("gives back nothing for a pathless request", () => {
    expect(tokenFromPath("/")).toBeUndefined();
    expect(tokenFromPath("")).toBeUndefined();
    expect(tokenFromPath(undefined)).toBeUndefined();
  });
});

describe("parseRange", () => {
  // Safari will not start an HTML5 video at all unless a range request comes
  // back as a 206, so this is playability rather than optimisation.
  it("reads an explicit range", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=500-999", 1000)).toEqual({ start: 500, end: 999 });
  });

  it("runs an open-ended range to the last byte", () => {
    expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
  });

  // `bytes=-500` is the *last* 500 bytes, not the first 500. Getting this
  // backwards serves the wrong part of the file with a 206 that looks fine.
  it("reads a suffix range as counting from the end", () => {
    expect(parseRange("bytes=-500", 1000)).toEqual({ start: 500, end: 999 });
  });

  it("clamps an end past the file", () => {
    expect(parseRange("bytes=0-99999", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("gives back null for absent, malformed or unsatisfiable ranges", () => {
    expect(parseRange(undefined, 1000)).toBeNull();
    expect(parseRange("", 1000)).toBeNull();
    expect(parseRange("items=0-99", 1000)).toBeNull();
    expect(parseRange("bytes=-", 1000)).toBeNull();
    expect(parseRange("bytes=abc-def", 1000)).toBeNull();
    // Multipart ranges are legal but no media player needs them.
    expect(parseRange("bytes=0-99,200-299", 1000)).toBeNull();
    // Start past the end of the file.
    expect(parseRange("bytes=2000-", 1000)).toBeNull();
  });
});

describe("the share server over real HTTP", () => {
  const PORT = 8791;
  const BASE = `http://127.0.0.1:${PORT}/f`;
  const BODY = "0123456789".repeat(50); // 500 bytes

  const originalBase = process.env.FINI_SHARE_BASE_URL;
  const originalPort = process.env.FINI_SHARE_PORT;

  /** Scratch directories to remove at the end - see the fileShare tests. */
  const scratchDirs: string[] = [];

  /** Publishes BODY and returns its token. */
  const publishBody = async (ttlMs?: number) => {
    const dir = await mkdtemp(join(tmpdir(), "fini-serve-test-"));
    scratchDirs.push(dir);

    const path = join(dir, "clip.mp4");
    await writeFile(path, BODY);

    const shared = await publishFile({
      sourcePath: path,
      name: "my clip.mp4",
      contentType: "video/mp4",
      ttlMs,
    });

    return shared.url.split("/").pop()!;
  };

  beforeAll(async () => {
    process.env.FINI_SHARE_BASE_URL = BASE;
    process.env.FINI_SHARE_PORT = String(PORT);
    await resetShareDir();

    expect(await startShareServer()).toBe(true);
  });

  afterAll(async () => {
    await stopShareServer();
    await resetShareDir();

    for (const dir of scratchDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }

    process.env.FINI_SHARE_BASE_URL = originalBase;
    process.env.FINI_SHARE_PORT = originalPort;
  });

  afterEach(async () => {
    await resetShareDir();
    resetRateLimit();
  });

  it("serves a published file whole", async () => {
    const response = await fetch(`${BASE}/${await publishBody()}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe(String(BODY.length));
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(await response.text()).toBe(BODY);
  });

  // The file on disk is named after the token; this header is the only place
  // the real name appears.
  it("carries the original filename in Content-Disposition", async () => {
    const response = await fetch(`${BASE}/${await publishBody()}`);

    expect(response.headers.get("content-disposition")).toContain(
      "my clip.mp4",
    );
    // `inline` so it plays in the browser rather than landing in Downloads.
    expect(response.headers.get("content-disposition")).toStartWith("inline");
  });

  it("answers a range request with a 206 and just those bytes", async () => {
    const response = await fetch(`${BASE}/${await publishBody()}`, {
      headers: { Range: "bytes=10-19" },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(
      `bytes 10-19/${BODY.length}`,
    );
    expect(response.headers.get("content-length")).toBe("10");
    expect(await response.text()).toBe(BODY.slice(10, 20));
  });

  it("answers a suffix range with the tail of the file", async () => {
    const response = await fetch(`${BASE}/${await publishBody()}`, {
      headers: { Range: "bytes=-20" },
    });

    expect(response.status).toBe(206);
    expect(await response.text()).toBe(BODY.slice(-20));
  });

  it("answers HEAD with the size and no body", async () => {
    const response = await fetch(`${BASE}/${await publishBody()}`, {
      method: "HEAD",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(String(BODY.length));
    expect(await response.text()).toBe("");
  });

  it("404s an unknown token", async () => {
    const response = await fetch(`${BASE}/nope-not-a-real-token`);

    expect(response.status).toBe(404);
  });

  it("404s an expired link", async () => {
    const token = await publishBody(-1);

    expect((await fetch(`${BASE}/${token}`)).status).toBe(404);
  });

  it("404s the bare root rather than listing anything", async () => {
    expect((await fetch(`http://127.0.0.1:${PORT}/`)).status).toBe(404);
  });

  // Nothing user-supplied becomes a path, so traversal has nothing to hit -
  // but the whole point is that this stays true.
  it("404s a traversal attempt instead of reading the disk", async () => {
    for (const path of [
      "/f/..%2f..%2f..%2fetc%2fpasswd",
      "/etc/passwd",
      "/f/../../../../etc/hosts",
    ]) {
      const response = await fetch(`http://127.0.0.1:${PORT}${path}`);

      expect(response.status).toBe(404);
    }
  });

  it("refuses methods other than GET and HEAD", async () => {
    const response = await fetch(`${BASE}/${await publishBody()}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(405);
  });
});

describe("rate limiting", () => {
  const PORT = 8792;
  const BASE = `http://127.0.0.1:${PORT}/f`;

  const originalBase = process.env.FINI_SHARE_BASE_URL;
  const originalPort = process.env.FINI_SHARE_PORT;

  beforeAll(async () => {
    process.env.FINI_SHARE_BASE_URL = BASE;
    process.env.FINI_SHARE_PORT = String(PORT);
    resetRateLimit();

    expect(await startShareServer()).toBe(true);
  });

  afterAll(async () => {
    await stopShareServer();
    resetRateLimit();
    process.env.FINI_SHARE_BASE_URL = originalBase;
    process.env.FINI_SHARE_PORT = originalPort;
  });

  // Funnel puts this on the public internet with no auth in front of it, so a
  // flood needs to cost 429s rather than disk reads.
  it("starts refusing once the budget is spent", async () => {
    const statuses: number[] = [];

    for (let index = 0; index < 260; index += 1) {
      statuses.push((await fetch(`${BASE}/never-a-real-token`)).status);
    }

    expect(statuses.filter((status) => status === 404).length).toBeGreaterThan(
      0,
    );
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(
      0,
    );
    // The refusal comes last: the budget runs out and stays out.
    expect(statuses.at(-1)).toBe(429);
  });

  it("tells the caller when to come back", async () => {
    const response = await fetch(`${BASE}/never-a-real-token`);

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
