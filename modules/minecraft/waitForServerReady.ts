import { exec } from "child_process";
import { open, stat } from "fs/promises";
import { join } from "path";
import { Rcon } from "rcon-client";
import { MINECRAFT_SERVER_DIR } from "./minecraft.config";
import { rconConfig } from "./rcon.config";

export const SCREEN_SESSION = "minecraft";

const LATEST_LOG = join(MINECRAFT_SERVER_DIR, "logs/latest.log");

const POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
// screen takes a moment to register its socket, so don't trust a missing
// session until the launch has had time to settle
const SCREEN_GRACE_MS = 20000;
// Never pull more than this much of the log in at once
const MAX_LOG_CHUNK = 256 * 1024;

/** The server has finished loading the world and is accepting commands */
export const READY_PATTERN = /Done \([0-9.]+s\)! For help, type/;

/**
 * Hard failures that mean the JVM is going down, most specific first. Matched
 * against log output written by this boot only. `describe` can pull detail out
 * of the match so the Discord message names the actual culprit.
 */
const FAILURE_PATTERNS: {
  pattern: RegExp;
  describe: (match: RegExpMatchArray) => string;
}[] = [
  {
    pattern: /^Duplicated mods:\n(.+)$/m,
    describe: (m) => `Duplicate mods (${m[1].trim()})`,
  },
  {
    pattern: /Unbound values in registry [^:]*:[^[]*\[([^\]]+)\]/,
    describe: (m) => `Missing worldgen content: ${m[1]}`,
  },
  {
    pattern: /Missing or unsupported mandatory dependencies/,
    describe: () => "Missing mod dependencies",
  },
  {
    pattern: /Registry loading errors:/,
    describe: () => "World registry errors",
  },
  { pattern: /Crashing!/, describe: () => "Mod loading error" },
  {
    pattern: /---- Minecraft Crash Report ----/,
    describe: () => "Crash report written",
  },
  {
    pattern: /Failed to start the minecraft server/i,
    describe: () => "Server failed to start",
  },
  { pattern: /Exception in thread "main"/, describe: () => "Fatal JVM error" },
];

/**
 * Best human-readable reason this boot died, or null if the log doesn't say.
 * Falls back to the deepest `Caused by:` line, which is where the JVM puts the
 * root cause of a startup failure.
 */
export const describeFailure = (bootLog: string) => {
  for (const { pattern, describe } of FAILURE_PATTERNS) {
    const match = bootLog.match(pattern);
    if (match) return describe(match);
  }

  const causes = [...bootLog.matchAll(/^Caused by: (?:[\w.$]+: )?(.+)$/gm)];
  const rootCause = causes.at(-1)?.[1]?.trim();

  return rootCause ? rootCause.slice(0, 200) : null;
};

/**
 * Identity of latest.log at a point in time. The inode matters because log4j
 * rolls latest.log into a dated archive on boot and creates a new file, so a
 * byte offset alone can silently skip the start of a fresh run.
 */
export type LogMarker = { inode: number; size: number };

export type ServerBootResult =
  | { status: "ready"; elapsedMs: number }
  | { status: "failed"; elapsedMs: number; reason: string }
  | { status: "timeout"; elapsedMs: number };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `screen -ls` exits non-zero when there are no sessions at all, so the
 * output is what matters rather than the exit code.
 */
const isScreenSessionAlive = () =>
  new Promise<boolean>((resolve) => {
    exec("screen -ls", (_error, stdout) => {
      resolve(new RegExp(`\\.${SCREEN_SESSION}\\s`).test(stdout));
    });
  });

/** RCON only comes up after the server is done loading, so a reply means ready */
const isRconResponding = async () => {
  if (!rconConfig.password) return false;

  try {
    const rcon = await Rcon.connect(rconConfig);
    await rcon.send("list");
    await rcon.end();
    return true;
  } catch {
    return false;
  }
};

export const getLogMarker = async (): Promise<LogMarker> => {
  try {
    const { ino, size } = await stat(LATEST_LOG);
    return { inode: ino, size };
  } catch {
    return { inode: 0, size: 0 };
  }
};

/**
 * Reads whatever latest.log has gained since `marker`. A new inode (rolled) or
 * a file that shrank (truncated in place) both mean every byte in the file
 * belongs to the current run, so we start from the top.
 *
 * Exported because the in-game chat bridge tails the same file: chat never
 * reaches the log on its own (NoChatReports converts it to system messages),
 * so a KubeJS script echoes the lines it cares about and this reads them back.
 */
export const readLogSince = async (marker: LogMarker) => {
  let inode: number;
  let size: number;

  try {
    const stats = await stat(LATEST_LOG);
    inode = stats.ino;
    size = stats.size;
  } catch {
    return { text: "", marker };
  }

  const isFreshFile = inode !== marker.inode || size < marker.size;
  const start = isFreshFile ? 0 : marker.size;
  const next = { inode, size };

  if (size <= start) return { text: "", marker: next };

  const readFrom = Math.max(start, size - MAX_LOG_CHUNK);
  const handle = await open(LATEST_LOG, "r");

  try {
    const buffer = Buffer.alloc(size - readFrom);
    await handle.read(buffer, 0, buffer.length, readFrom);
    return { text: buffer.toString("utf8"), marker: next };
  } finally {
    await handle.close();
  }
};

/**
 * Polls until the server reports itself done loading, dies, or runs out of
 * time. Call this *after* capturing a marker with `getLogMarker()` so a crash
 * from a previous boot can't be mistaken for this one.
 */
export const waitForServerReady = async ({
  logMarker = { inode: 0, size: 0 },
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  logMarker?: LogMarker;
  timeoutMs?: number;
} = {}): Promise<ServerBootResult> => {
  const startedAt = Date.now();
  let marker = logMarker;
  let bootLog = "";

  while (Date.now() - startedAt < timeoutMs) {
    await wait(POLL_INTERVAL_MS);

    const elapsedMs = Date.now() - startedAt;
    const { text, marker: nextMarker } = await readLogSince(marker);
    marker = nextMarker;
    bootLog += text;

    if (READY_PATTERN.test(bootLog)) {
      return { status: "ready", elapsedMs };
    }

    const failure = describeFailure(bootLog);

    if (failure) {
      return { status: "failed", elapsedMs, reason: failure };
    }

    // The JVM exiting takes the screen session with it (the button launches
    // with ATM10_RESTART=false, so nothing restarts it)
    if (elapsedMs > SCREEN_GRACE_MS && !(await isScreenSessionAlive())) {
      return {
        status: "failed",
        elapsedMs,
        reason:
          describeFailure(bootLog) ??
          (bootLog
            ? "Server process exited during startup"
            : "Server process exited before writing any logs"),
      };
    }

    // Fallback for when the log format changes out from under us
    if (await isRconResponding()) {
      return { status: "ready", elapsedMs };
    }
  }

  return { status: "timeout", elapsedMs: Date.now() - startedAt };
};
