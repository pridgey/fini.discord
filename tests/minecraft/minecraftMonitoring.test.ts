import { describe, expect, it } from "bun:test";
import {
  describeRconError,
  MinecraftMonitor,
} from "../../utilities/minecraft/minecraftMonitoring";

/**
 * Drives the state machine directly. `handlePlayerCount` is the whole of the
 * shutdown decision, and it needs no RCON - the counts below stand in for what
 * `list` reported.
 */

/*
 * `stopServer` falls back to `screen -S minecraft -X stuff "stop\n"` when RCON
 * fails, which hits the real server on this host regardless of the config the
 * monitor was constructed with - a test that calls through to it stops the live
 * world. This subclass records the shutdown instead of performing one.
 */
class TestMonitor extends MinecraftMonitor {
  public stopCalls: string[] = [];

  protected async sendStopCommand(message: string): Promise<void> {
    this.stopCalls.push(message);
  }
}

const newMonitor = () =>
  new TestMonitor({ host: "localhost", port: 25575, password: "" });

describe("MinecraftMonitor.handlePlayerCount", () => {
  it("arms the countdown when the server is empty", async () => {
    const monitor = newMonitor();

    await monitor.handlePlayerCount(0);

    expect(monitor.getState()).toBe("EMPTY_COUNTDOWN");
    expect(monitor.hasPendingShutdown()).toBe(true);
    monitor.stopMonitoring();
  });

  it("does not re-arm the countdown while the server stays empty", async () => {
    const monitor = newMonitor();

    await monitor.handlePlayerCount(0);
    await monitor.handlePlayerCount(0);
    await monitor.handlePlayerCount(0);

    expect(monitor.hasPendingShutdown()).toBe(true);
    monitor.stopMonitoring();
  });

  it("cancels the countdown when a player joins", async () => {
    const monitor = newMonitor();

    await monitor.handlePlayerCount(0);
    await monitor.handlePlayerCount(1);

    expect(monitor.getState()).toBe("MONITORING");
    expect(monitor.hasPendingShutdown()).toBe(false);
    monitor.stopMonitoring();
  });

  /*
   * This is what left the server up for eleven hours on 04Oct2026: one player
   * joined the empty server at 01:55 and left at 01:56, and because cancelling
   * the countdown didn't move the state off EMPTY_COUNTDOWN, the server going
   * empty again looked like a countdown that was already running. Nothing was
   * ever scheduled and the server was still up the next morning.
   */
  it("re-arms the countdown after a lone player joins and leaves", async () => {
    const monitor = newMonitor();

    await monitor.handlePlayerCount(0); // boots empty, countdown armed
    await monitor.handlePlayerCount(1); // Pridgey joined the game
    await monitor.handlePlayerCount(0); // Pridgey left the game

    expect(monitor.getState()).toBe("EMPTY_COUNTDOWN");
    expect(monitor.hasPendingShutdown()).toBe(true);
    monitor.stopMonitoring();
  });

  it("re-arms the countdown after a group of players leaves", async () => {
    const monitor = newMonitor();

    await monitor.handlePlayerCount(0);
    await monitor.handlePlayerCount(3);
    await monitor.handlePlayerCount(1);
    await monitor.handlePlayerCount(0);

    expect(monitor.getState()).toBe("EMPTY_COUNTDOWN");
    expect(monitor.hasPendingShutdown()).toBe(true);
    monitor.stopMonitoring();
  });

  it("keeps monitoring armed for a second boot after it stops the server", async () => {
    const monitor = newMonitor();

    await monitor.handlePlayerCount(0);
    await monitor.stopServer();

    expect(monitor.stopCalls).toEqual(["Server shutting down."]);
    expect(monitor.getState()).toBe("MONITORING");
    expect(monitor.hasPendingShutdown()).toBe(false);

    // The server comes back up from the Discord button and empties again
    await monitor.handlePlayerCount(0);
    expect(monitor.hasPendingShutdown()).toBe(true);
    monitor.stopMonitoring();
  });
});

describe("describeRconError", () => {
  it("uses the message when there is one", () => {
    expect(describeRconError(new Error("Authentication failed"))).toBe(
      "Authentication failed",
    );
  });

  /*
   * rcon-client throws this shape when the socket closes mid-command, which
   * logged `RCON is not answering ()` during the 04Oct2026 shutdown test
   */
  it("falls back to the error name when the message is empty", () => {
    expect(describeRconError(new Error(""))).toBe("Error");
  });

  it("handles values that are not errors at all", () => {
    expect(describeRconError("Timeout for packet id 1")).toBe(
      "Timeout for packet id 1",
    );
    expect(describeRconError(undefined)).toBe("undefined");
    expect(describeRconError("")).toBe("unknown error");
  });
});
