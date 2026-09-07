import { spawn } from "child_process";
import { applySandbox, type SandboxOptions } from "./sandbox";

/**
 * Thin wrapper around `spawn` for the media tools.
 *
 * Deliberately not `exec`: every argument here is user-supplied (a URL, a
 * colour, a filename), and `exec` hands the whole string to `/bin/sh`. A URL
 * containing a backtick or a semicolon would then run as a shell command on
 * the box the bot lives on. `spawn` with an argument array has no shell to
 * inject into, so the only validation left to do is semantic.
 */

/** How much of each stream to keep. ffmpeg's stderr is per-frame chatter. */
const MAX_CAPTURED_CHARS = 8_000;

export type RunProcessOptions = {
  /** Hard wall-clock cap. The process tree is killed when it elapses. */
  timeoutMs: number;
  /** Working directory, normally the job's temp workspace. */
  cwd?: string;
  /**
   * Run inside bubblewrap with only `workDir` writable. Omit for commands that
   * are not parsing untrusted input.
   */
  sandbox?: SandboxOptions;
};

export type RunProcessResult = {
  stdout: string;
  stderr: string;
};

/**
 * A non-zero exit, a signal, or a timeout.
 *
 * Carries the tail of stderr rather than the whole thing: it is the part that
 * says what went wrong, and it is what gets shown to the user.
 */
export class ProcessError extends Error {
  constructor(
    public readonly command: string,
    public readonly code: number | null,
    public readonly signal: NodeJS.Signals | null,
    public readonly stderr: string,
    public readonly timedOut: boolean,
  ) {
    super(
      timedOut
        ? `${command} timed out`
        : `${command} exited with ${signal ?? code}`,
    );
    this.name = "ProcessError";
  }

  /**
   * The last few lines of stderr, which is the part worth showing a user.
   * @param lines How many trailing lines to keep
   * @returns The tail of stderr, or a placeholder when it wrote nothing
   */
  tail(lines = 3): string {
    const kept = this.stderr
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-lines);

    return kept.length ? kept.join("\n") : "no output";
  }
}

/** Keeps only the last `MAX_CAPTURED_CHARS` of a growing string. */
const appendCapped = (existing: string, chunk: string): string => {
  const combined = existing + chunk;
  return combined.length > MAX_CAPTURED_CHARS
    ? combined.slice(-MAX_CAPTURED_CHARS)
    : combined;
};

/**
 * Runs a command to completion with a timeout.
 *
 * The child is started in its own process group and the timeout kills the
 * group, not just the child. yt-dlp shells out to ffmpeg to merge streams, and
 * killing only yt-dlp leaves that ffmpeg running against a temp directory that
 * is about to be deleted - which on a long stream means a stuck process
 * chewing CPU for as long as the bot is up.
 * @param command Executable to run, resolved from PATH
 * @param args Arguments, passed through without shell interpretation
 * @param options Timeout and working directory
 * @returns The captured stdout and stderr on a clean exit
 * @throws ProcessError on a non-zero exit, a signal, or the timeout
 */
export const runProcess = async (
  command: string,
  args: string[],
  { timeoutMs, cwd, sandbox }: RunProcessOptions,
): Promise<RunProcessResult> =>
  new Promise((resolve, reject) => {
    // The reported command stays the real one, so a ProcessError still says
    // "ffmpeg failed" rather than "bwrap failed".
    const spawned = applySandbox(command, args, sandbox);
    const child = spawn(spawned.command, spawned.args, {
      cwd,
      detached: true,
      // Nothing is ever written to these processes, and leaving stdin open on
      // an inherited terminal lets ffmpeg block forever on its own prompts
      // (it asks before overwriting a file).
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // Already gone, or never got a pid - the exit handler covers both.
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };

    child.stdout?.on("data", (data) => {
      stdout = appendCapped(stdout, data.toString());
    });
    child.stderr?.on("data", (data) => {
      stderr = appendCapped(stderr, data.toString());
    });

    child.on("error", (err) => {
      finish(() =>
        reject(new ProcessError(command, null, null, `${err.message}`, false)),
      );
    });

    child.on("close", (code, signal) => {
      finish(() => {
        if (timedOut || code !== 0) {
          reject(new ProcessError(command, code, signal, stderr, timedOut));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  });
