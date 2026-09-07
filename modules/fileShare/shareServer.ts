import { createReadStream } from "fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "http";
import {
  isSharingEnabled,
  lookupShare,
  sharePort,
  type SharedFile,
} from "./fileShare";

/**
 * The local half of the share link.
 *
 * Tailscale Funnel terminates TLS and proxies to this, so it binds to loopback
 * only - the public internet reaches it through `tailscaled` or not at all.
 * Binding to 0.0.0.0 would put it on the LAN as well for no benefit, and on
 * the internet outright if the box is ever port-forwarded.
 */

/** Loopback only. Funnel is the only thing that should be able to reach this. */
const BIND_ADDRESS = "127.0.0.1";

/**
 * Sockets held open at once.
 *
 * Slowloris is the attack this closes: open many connections, send headers a
 * byte at a time, and hold every worker. Node has no default connection cap,
 * so an unauthenticated endpoint on the public internet needs one.
 */
const MAX_CONNECTIONS = 64;

/**
 * How long a client may take to finish sending its headers.
 *
 * Ten seconds is generous for a GET. Node's default is a minute, which is a
 * long time to hold a socket doing nothing.
 *
 * Deliberately not paired with `requestTimeout`: that one has a history of
 * being read as covering the response too, and truncating somebody's 200MB
 * download to win a marginal amount of hardening is a bad trade. Headers are
 * where the attack lives.
 */
const HEADERS_TIMEOUT_MS = 10_000;

/** Idle keep-alive. Short, because clients here fetch once and leave. */
const KEEP_ALIVE_TIMEOUT_MS = 5_000;

/**
 * Request budget, applied across all callers rather than per IP.
 *
 * Everything arrives from `tailscaled` on loopback, so every request looks
 * like it came from 127.0.0.1 and per-IP limiting would be limiting one
 * client. A global ceiling is the honest version: generous enough that a
 * handful of people downloading clips never notices, low enough that a flood
 * gets 429s instead of disk reads.
 */
const RATE_LIMIT_REQUESTS = 240;
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Timestamps of requests still inside the window. */
let recentRequests: number[] = [];

/**
 * Records a request and reports whether it is over budget.
 * @returns True when the caller should be turned away
 */
const isRateLimited = (): boolean => {
  const now = Date.now();
  recentRequests = recentRequests.filter(
    (at) => now - at < RATE_LIMIT_WINDOW_MS,
  );

  if (recentRequests.length >= RATE_LIMIT_REQUESTS) return true;

  recentRequests.push(now);
  return false;
};

/** Clears rate limit state, for tests. */
export const resetRateLimit = (): void => {
  recentRequests = [];
};

let server: Server | undefined;

/**
 * Pulls the token out of a request path.
 *
 * The last path segment, whatever the prefix. Funnel can be mounted at the
 * root or under a path with `--set-path`, and whether it forwards the prefix
 * or strips it is a detail of how it was set up - reading from the end works
 * either way. Tokens are 128 bits of randomness, so nothing else collides.
 * @param url The request url
 * @returns The token, or undefined for a pathless request
 */
export const tokenFromPath = (url: string | undefined): string | undefined => {
  const pathname = (url ?? "").split("?")[0];

  return pathname.split("/").filter(Boolean).pop() || undefined;
};

export type ByteRange = { start: number; end: number };

/**
 * Parses a Range header against a known file size.
 *
 * Range support is not an optimisation here, it is what makes the file
 * playable: Safari will not start an HTML5 video at all unless the server
 * answers a range request with a 206, and seeking in any browser needs it.
 * @param header The raw `Range` header
 * @param size Size of the file in bytes
 * @returns The resolved range, or null for absent/unsatisfiable/multi-range
 */
export const parseRange = (
  header: string | undefined,
  size: number,
): ByteRange | null => {
  if (!header) return null;

  // Only `bytes=` with a single range. Multipart ranges are legal and no
  // browser needs them for media playback.
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  // `bytes=-500` means the last 500 bytes, not "up to 500".
  const start = rawStart
    ? Number(rawStart)
    : Math.max(0, size - Number(rawEnd));
  const end = rawStart
    ? rawEnd
      ? Math.min(Number(rawEnd), size - 1)
      : size - 1
    : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size || start < 0) return null;

  return { start, end };
};

/** Headers every response carries. */
const baseHeaders = (share: SharedFile) => ({
  "Content-Type": share.contentType,
  // `inline` so a video plays in the browser instead of landing in Downloads.
  // The name is a token-derived file on disk, so this is the only place the
  // real filename appears.
  "Content-Disposition": `inline; filename="${share.name.replace(/"/g, "")}"`,
  "Accept-Ranges": "bytes",
  // Nothing here is public in the search-engine sense, and a cached copy would
  // outlive the link it came from.
  "Cache-Control": "private, max-age=0, no-store",
  "X-Content-Type-Options": "nosniff",
});

/** 404 for anything we will not serve, with no hint as to which reason. */
const notFound = (response: ServerResponse) => {
  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("Not found");
};

/**
 * Handles one request.
 * @param request The incoming request
 * @param response The response to write
 */
const handle = (request: IncomingMessage, response: ServerResponse) => {
  if (isRateLimited()) {
    response.writeHead(429, {
      "Content-Type": "text/plain",
      "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
    });
    response.end("Too many requests");
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const token = tokenFromPath(request.url);
  const share = token ? lookupShare(token) : undefined;

  // Unknown and expired are the same answer on purpose - there is nothing to
  // learn from the difference.
  if (!share) {
    notFound(response);
    return;
  }

  const range = parseRange(request.headers.range, share.bytes);

  if (request.method === "HEAD") {
    response.writeHead(200, {
      ...baseHeaders(share),
      "Content-Length": String(share.bytes),
    });
    response.end();
    return;
  }

  if (range) {
    response.writeHead(206, {
      ...baseHeaders(share),
      "Content-Range": `bytes ${range.start}-${range.end}/${share.bytes}`,
      "Content-Length": String(range.end - range.start + 1),
    });
  } else {
    response.writeHead(200, {
      ...baseHeaders(share),
      "Content-Length": String(share.bytes),
    });
  }

  const stream = createReadStream(
    share.path,
    range ? { start: range.start, end: range.end } : undefined,
  );

  // A client that closes mid-download - which is every video player that
  // seeks - destroys the stream. Without this the error is unhandled and takes
  // the process with it, and `--kill-others-on-fail` takes pocketbase and
  // llama down too.
  stream.on("error", (err) => {
    console.error("Error streaming shared file:", { token, err });
    response.destroy();
  });
  response.on("close", () => stream.destroy());

  stream.pipe(response);
};

/**
 * Starts the share server if sharing is configured.
 *
 * Never throws. A port collision or a bad config disables sharing rather than
 * taking the bot down with it - the commands already degrade to "that file was
 * too large", which is a worse answer but a working bot.
 * @returns True if the server is listening
 */
export const startShareServer = async (): Promise<boolean> => {
  if (!isSharingEnabled()) {
    console.log("File sharing disabled (no FINI_SHARE_BASE_URL)");
    return false;
  }

  if (server) return true;

  const port = sharePort();

  return new Promise<boolean>((resolve) => {
    const created = createServer(handle);

    created.once("error", (err) => {
      console.error("Share server failed to start:", { port, err });
      server = undefined;
      resolve(false);
    });

    created.maxConnections = MAX_CONNECTIONS;
    created.headersTimeout = HEADERS_TIMEOUT_MS;
    created.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;

    created.listen(port, BIND_ADDRESS, () => {
      server = created;
      console.log(`Share server listening on ${BIND_ADDRESS}:${port}`);
      resolve(true);
    });
  });
};

/**
 * Stops the server, for tests.
 * @returns Once the server has closed
 */
export const stopShareServer = async (): Promise<void> => {
  const running = server;
  if (!running) return;

  server = undefined;
  await new Promise<void>((resolve) => running.close(() => resolve()));
};
