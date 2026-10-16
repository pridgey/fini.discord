import { describe, expect, it } from "bun:test";
import {
  decideEnsure,
  describeOutcome,
  matchesServiceProcess,
  SERVICE_PROCESSES,
} from "../../modules/minecraft/serviceHealth";

describe("decideEnsure", () => {
  it("reports an already-running service without starting anything", () => {
    expect(
      decideEnsure({
        alreadyRunning: true,
        systemdStarted: false,
        detachedStarted: false,
      }),
    ).toBe("already-running");
  });

  it("prefers systemd when it starts the service", () => {
    expect(
      decideEnsure({
        alreadyRunning: false,
        systemdStarted: true,
        detachedStarted: false,
      }),
    ).toBe("started-via-systemd");
  });

  it("falls back to a detached start when systemd declines", () => {
    expect(
      decideEnsure({
        alreadyRunning: false,
        systemdStarted: false,
        detachedStarted: true,
      }),
    ).toBe("started-detached");
  });

  it("reports failure when nothing could start it", () => {
    expect(
      decideEnsure({
        alreadyRunning: false,
        systemdStarted: false,
        detachedStarted: false,
      }),
    ).toBe("failed");
  });

  /*
   * The failure this ordering exists to prevent: two monitors both race to
   * stop the server. An already-running service must win over every start
   * path, so nothing ever launches a second copy.
   */
  it("never starts a second copy when one is already running", () => {
    expect(
      decideEnsure({
        alreadyRunning: true,
        systemdStarted: true,
        detachedStarted: true,
      }),
    ).toBe("already-running");
  });
});

describe("describeOutcome", () => {
  it("flags a detached start as not surviving a reboot", () => {
    const message = describeOutcome("bot", "started-detached");
    expect(message).toContain("won't survive a reboot");
    expect(message).toContain("fini-bot.service");
  });

  it("names the unit to check when a service could not be started", () => {
    expect(describeOutcome("monitor", "failed")).toContain(
      "minecraft-monitor.service",
    );
  });

  it("is quietly positive when things are fine", () => {
    expect(describeOutcome("monitor", "already-running")).toStartWith("✅");
    expect(describeOutcome("bot", "started-via-systemd")).toStartWith("✅");
  });
});

describe("SERVICE_PROCESSES", () => {
  /*
   * Both services are `bun` running a script, so only the script path tells
   * them apart - and the pattern has to be specific or pgrep matches the
   * wrong one.
   */
  it("identifies each service by its script path", () => {
    expect(SERVICE_PROCESSES.monitor.pattern).toBe(
      "minecraft-monitor.service.ts",
    );
    expect(SERVICE_PROCESSES.bot.pattern).toBe("fini-bot.service.ts");
    expect(SERVICE_PROCESSES.monitor.pattern).not.toBe(
      SERVICE_PROCESSES.bot.pattern,
    );
  });
});

describe("matchesServiceProcess", () => {
  const PATTERN = "fini-bot.service.ts";

  // Both real shapes seen on this host
  it("matches a real service process", () => {
    expect(
      matchesServiceProcess(
        "1177384 bun --env-file=.env run services/fini-bot.service.ts",
        PATTERN,
      ),
    ).toBe(true);
    expect(
      matchesServiceProcess(
        "1164907 /home/pridgey/.bun/bin/bun fini-bot.service.ts",
        PATTERN,
      ),
    ).toBe(true);
  });

  /*
   * The false positive that mattered. `pgrep -f` matches whole command lines,
   * so a shell whose own arguments mention the script counts as a hit - this
   * line reported a killed service as "already running", which is precisely
   * the silent failure this module is meant to catch. Captured verbatim.
   */
  it("does not match a shell that merely mentions the script", () => {
    const callersOwnCommandLine =
      "1178565 /bin/bash -c ps -eo pid=,comm=,cmd= | awk '/fini-bot.service.ts/ {print $1}' | xargs -r kill";
    expect(matchesServiceProcess(callersOwnCommandLine, PATTERN)).toBe(false);
  });

  it("does not match pgrep's own shell", () => {
    expect(
      matchesServiceProcess(
        '1178582 /bin/sh -c pgrep -af "fini-bot.service.ts"',
        PATTERN,
      ),
    ).toBe(false);
  });

  // A different service's process must not count as this one
  it("does not match the other service", () => {
    expect(
      matchesServiceProcess("1 bun minecraft-monitor.service.ts", PATTERN),
    ).toBe(false);
  });

  it("ignores lines it cannot parse", () => {
    expect(matchesServiceProcess("", PATTERN)).toBe(false);
    expect(matchesServiceProcess("not a pgrep line", PATTERN)).toBe(false);
  });
});
