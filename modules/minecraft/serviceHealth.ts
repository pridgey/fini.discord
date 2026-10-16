import { exec } from "child_process";

/**
 * Checking on, and if need be starting, Fini's Minecraft helper processes.
 *
 * Both of them are easy to lose: they are separate long-lived processes, and
 * nothing in the bot itself launches them. The empty-server monitor once sat
 * misconfigured for a whole night while looking perfectly healthy, which is
 * why the Start Server button now reports their state rather than assuming it.
 */

export type ServiceName = "monitor" | "bot";

/** How to recognise each service's process, and the unit that should own it. */
export const SERVICE_PROCESSES: Record<
  ServiceName,
  { pattern: string; unit: string; label: string }
> = {
  monitor: {
    pattern: "minecraft-monitor.service.ts",
    unit: "minecraft-monitor.service",
    label: "Empty-server shutdown",
  },
  bot: {
    pattern: "fini-bot.service.ts",
    unit: "fini-bot.service",
    label: "In-game bot",
  },
};

export type EnsureOutcome =
  | "already-running"
  | "started-via-systemd"
  | "started-detached"
  | "failed";

/**
 * Picks what to do from what we found.
 *
 * Starting a second copy alongside systemd's is the failure to avoid: two
 * monitors both race to stop the server. So a detached start is only ever a
 * fallback for when no process exists *and* systemd would not start one.
 */
export const decideEnsure = (args: {
  alreadyRunning: boolean;
  systemdStarted: boolean;
  detachedStarted: boolean;
}): EnsureOutcome => {
  if (args.alreadyRunning) return "already-running";
  if (args.systemdStarted) return "started-via-systemd";
  if (args.detachedStarted) return "started-detached";
  return "failed";
};

/**
 * Whether one line of `pgrep -af` output is really one of our services.
 *
 * `pgrep -f` matches against whole command lines, which means it also matches
 * *the caller* whenever the pattern appears in its own arguments - a shell
 * running `grep fini-bot.service.ts` counts as a hit. That produced a false
 * "already running" for a service that had just been killed, which is exactly
 * the silent-failure this module exists to catch.
 *
 * The discriminator: a real service process *is* bun. A shell merely
 * mentioning the script is not.
 */
export const matchesServiceProcess = (
  pgrepLine: string,
  pattern: string,
): boolean => {
  const match = pgrepLine.match(/^\s*\d+\s+(\S+)\s(.*)$/);
  if (!match) return false;

  const [, executable, args] = match;
  if (!/(^|\/)bun$/.test(executable)) return false;

  return args.includes(pattern);
};

const run = (command: string): Promise<{ ok: boolean; stdout: string }> =>
  new Promise((resolve) => {
    exec(command, { timeout: 10000 }, (error, stdout) => {
      resolve({ ok: !error, stdout: stdout ?? "" });
    });
  });

/** Whether systemd says the unit is running. Needs no privileges to read. */
export const isUnitActive = async (unit: string): Promise<boolean> => {
  const { stdout } = await run(`systemctl is-active ${unit}`);
  return stdout.trim() === "active";
};

/**
 * Whether a process running `pattern` is alive.
 *
 * Used as a fallback when systemd doesn't own the service - a unit that was
 * never installed, or a copy started by hand.
 */
export const isProcessRunning = async (pattern: string): Promise<boolean> => {
  const { stdout } = await run(`pgrep -af ${JSON.stringify(pattern)}`);
  return stdout
    .split("\n")
    .some((line) => matchesServiceProcess(line, pattern));
};

/**
 * Makes sure a service is running, preferring systemd.
 *
 * `systemctl start` needs privileges we usually don't have from the bot
 * process, so it is attempted without `sudo` - it fails fast with
 * "Interactive authentication required" rather than hanging on a prompt - and
 * a detached start is the fallback.
 */
export const ensureService = async (
  name: ServiceName,
  projectRoot: string,
): Promise<EnsureOutcome> => {
  const { pattern, unit } = SERVICE_PROCESSES[name];

  const alreadyRunning =
    (await isUnitActive(unit)) || (await isProcessRunning(pattern));
  if (alreadyRunning) {
    return decideEnsure({
      alreadyRunning,
      systemdStarted: false,
      detachedStarted: false,
    });
  }

  const viaSystemd = await run(`systemctl start ${unit}`);
  if (viaSystemd.ok) {
    return decideEnsure({
      alreadyRunning: false,
      systemdStarted: true,
      detachedStarted: false,
    });
  }

  /*
   * Only reached when nothing is running and systemd declined, so there is no
   * copy to collide with. setsid detaches it from this process, which would
   * otherwise take it down with the bot on restart.
   */
  const detached = await run(
    `cd ${JSON.stringify(projectRoot)} && setsid nohup bun --env-file=.env run services/${name === "bot" ? "fini-bot" : "minecraft-monitor"}.service.ts >> /tmp/fini-${name}.log 2>&1 < /dev/null &`,
  );

  // Give it a moment to appear, then confirm rather than trusting the spawn
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const detachedStarted = detached.ok && (await isProcessRunning(pattern));

  return decideEnsure({
    alreadyRunning: false,
    systemdStarted: false,
    detachedStarted,
  });
};

/** One line per service, for the Start Server reply. */
export const describeOutcome = (
  name: ServiceName,
  outcome: EnsureOutcome,
): string => {
  const { label, unit } = SERVICE_PROCESSES[name];

  switch (outcome) {
    case "already-running":
      return `✅ ${label} is running`;
    case "started-via-systemd":
      return `✅ ${label} started`;
    case "started-detached":
      return `⚠️ ${label} started, but not under systemd - it won't survive a reboot. Install \`${unit}\`.`;
    case "failed":
      return `❌ ${label} is NOT running and couldn't be started. Check \`systemctl status ${unit}\`.`;
  }
};
