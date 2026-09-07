import { existsSync, realpathSync } from "fs";
import { dirname } from "path";

/**
 * Runs ffmpeg and yt-dlp inside a bubblewrap container.
 *
 * These two parse hostile input for a living. Media demuxers are a long-running
 * source of memory-corruption bugs, and both tools run as the bot's own user -
 * the same user that can read `.env`, `pb_data`, `~/.ssh`, and the Tailscale
 * state directory. The gap between "ffmpeg crashed on a weird file" and "ffmpeg
 * did something interesting with a deliberately weird file" is the entire
 * bot's credentials.
 *
 * The container binds `/usr` and `/etc` read-only, gives the job a private
 * `/tmp`, and binds exactly one writable directory: the job's own workspace.
 * `$HOME` does not exist inside it, so none of the above is reachable even if
 * the process is fully compromised.
 *
 * Best-effort by design. If bubblewrap is missing the tools run unwrapped, with
 * a warning - a bot that works with weaker isolation beats a bot that refuses
 * to convert anything.
 */

/** Set `FINI_DISABLE_SANDBOX=1` to run the tools unwrapped. */
const isDisabled = (): boolean => process.env.FINI_DISABLE_SANDBOX === "1";

let available: boolean | undefined;

/**
 * Whether bubblewrap can be used.
 *
 * Cached, because this is checked on every subprocess and the answer cannot
 * change while the bot is running.
 * @returns True when sandboxing is possible and not disabled
 */
export const isSandboxAvailable = (): boolean => {
  if (isDisabled()) return false;

  if (available === undefined) {
    available = existsSync("/usr/bin/bwrap");

    if (!available) {
      console.warn(
        "bubblewrap not found - ffmpeg and yt-dlp will run unsandboxed. Install it with: sudo apt install bubblewrap",
      );
    }
  }

  return available;
};

/**
 * The mount that makes DNS work inside a networked sandbox.
 *
 * `--share-net` gives the job the host's network namespace, which is enough to
 * reach a nameserver but not enough to find out where one is. That comes from
 * `/etc/resolv.conf`, and on a systemd-resolved host - Ubuntu, Pop!_OS,
 * Debian - it is a symlink to `/run/systemd/resolve/stub-resolv.conf`. `/run`
 * is not mounted in here, so the symlink dangles and every lookup fails with
 * `Name or service not known`, which reads like the network being down rather
 * than a missing file.
 *
 * What gets bound is the directory the real file lives in, not the file over
 * `/etc/resolv.conf` itself. Binding onto the path cannot work: `/etc` is
 * mounted read-only, so bubblewrap cannot create a mountpoint there, and it
 * would have to follow the dangling symlink to try. Mounting the target's
 * directory instead leaves the symlink alone and gives it something to point
 * at, which also keeps this layout-agnostic - `/run/systemd/resolve`,
 * `/run/resolvconf` and anywhere else all work the same way.
 * @returns Bubblewrap arguments, or nothing when `/etc` already covers it
 */
const resolvConfMount = (): string[] => {
  let real: string;

  try {
    real = realpathSync("/etc/resolv.conf");
  } catch {
    // Either there is no resolver config on the host or the symlink is broken
    // out here too. Nothing to bind, and nothing this module can do about it.
    return [];
  }

  const dir = dirname(real);

  // A plain file in `/etc` is already covered by the bind above.
  return dir === "/etc" ? [] : ["--ro-bind", dir, dir];
};

export type SandboxOptions = {
  /** The one directory the job may write to. */
  workDir: string;
  /**
   * Whether the job needs the network.
   *
   * False for ffmpeg, which only ever touches local files here - and denying
   * it closes a real hole rather than a theoretical one. ffmpeg will follow
   * urls embedded in a container it is decoding (HLS playlists especially),
   * so a crafted upload to `/convert` is otherwise its own SSRF, independent
   * of the one in `/ytdlp`.
   *
   * True for yt-dlp, which cannot do its job otherwise. Note that sharing the
   * host's network namespace means loopback inside the sandbox is the host's
   * loopback, so `urlSafety` is what defends that path, not this.
   */
  network: boolean;
  /**
   * Extra paths to mount read-only, on top of `/usr` and `/etc`.
   *
   * ffmpeg and yt-dlp need nothing here: they live in `/usr` and read only the
   * workspace. `qwen-tts` does not - it is installed under `$HOME` and its
   * model weights are gigabytes in the Hugging Face cache, and `$HOME` is
   * deliberately absent inside the container. Binding those two paths
   * read-only is what lets it run confined at all; the alternative was
   * copying two gigabytes into every job's workspace.
   *
   * Read-only, so a compromised decoder cannot rewrite the weights it is
   * about to be handed on the next invocation.
   */
  readOnlyPaths?: string[];
};

/**
 * Builds the bubblewrap prefix for a command.
 * @param options Which directory is writable, whether network is needed, and
 * any extra read-only mounts
 * @returns Arguments to place before the real command, ending in `--`
 */
export const sandboxPrefix = ({
  workDir,
  network,
  readOnlyPaths = [],
}: SandboxOptions): string[] => [
  // Everything the tools need to run, and nothing else.
  "--ro-bind",
  "/usr",
  "/usr",
  "--ro-bind",
  "/etc",
  "/etc",
  // After the `/etc` bind, so it lands on top of the symlink rather than
  // under it. Only for a job that asked for the network - one that did not has
  // no use for a nameserver and should not be told where to find one.
  ...(network ? resolvConfMount() : []),
  // On a merged-/usr system these are symlinks; recreating them keeps the
  // dynamic loader's hardcoded paths working.
  "--symlink",
  "usr/lib",
  "/lib",
  "--symlink",
  "usr/lib64",
  "/lib64",
  "--symlink",
  "usr/bin",
  "/bin",
  "--symlink",
  "usr/sbin",
  "/sbin",
  "--proc",
  "/proc",
  "--dev",
  "/dev",
  // A private /tmp, so the job cannot see other jobs' workspaces or the
  // published files in the share directory.
  "--tmpfs",
  "/tmp",
  "--bind",
  workDir,
  workDir,
  // After the tmpfs, not before: a path mounted underneath `/tmp` earlier in
  // the list would be hidden by it, and silently missing weights look like a
  // model loading bug rather than a mount ordering one.
  ...readOnlyPaths.flatMap((path) => ["--ro-bind", path, path]),
  // Drop every namespace, then hand back only the network and only if asked.
  "--unshare-all",
  ...(network ? ["--share-net"] : []),
  // Kill the sandbox if the bot dies, rather than leaving an orphan holding a
  // workspace that is about to be deleted.
  "--die-with-parent",
  // Detaches the controlling terminal, which is what stops a TIOCSTI style
  // escape back into the parent's tty.
  "--new-session",
  "--setenv",
  "HOME",
  "/tmp",
  "--chdir",
  workDir,
  "--",
];

/**
 * Wraps a command in the sandbox, or returns it unchanged.
 * @param command The executable to run
 * @param args Its arguments
 * @param options Sandbox settings, or undefined to skip sandboxing
 * @returns The command and arguments to actually spawn
 */
export const applySandbox = (
  command: string,
  args: string[],
  options: SandboxOptions | undefined,
): { command: string; args: string[] } => {
  if (!options || !isSandboxAvailable()) return { command, args };

  return {
    command: "bwrap",
    args: [...sandboxPrefix(options), command, ...args],
  };
};
