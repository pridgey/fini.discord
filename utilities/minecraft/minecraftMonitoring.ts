import { Rcon } from "rcon-client";
import { exec } from "child_process";
import { MINECRAFT_BOT_NAMES } from "./minecraft.config";
import { countHumanPlayers } from "./parsePlayerList";
import { RconConfig, rconConfig } from "./rcon.config";

type MonitorState = "IDLE" | "MONITORING" | "EMPTY_COUNTDOWN";

/** How long the server may sit with nobody on it before it is stopped. */
export const EMPTY_SHUTDOWN_MS = 15 * 60 * 1000;

/** How often the player count is polled. */
export const CHECK_INTERVAL_MS = 30 * 1000;

/**
 * A readable reason for an RCON failure.
 *
 * rcon-client throws errors with an empty `message` when the socket closes
 * under it, which produced the useless log line `RCON is not answering ()`.
 * That line exists to tell "the server is down" apart from "the password is
 * wrong", so it has to say something.
 */
export const describeRconError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message || error.name || "Error with no message";
  }
  const described = String(error);
  return described.length > 0 ? described : "unknown error";
};

export class MinecraftMonitor {
  private rconConfig: RconConfig;
  /** Fake-player names that must not count towards keeping the server alive. */
  private botNames: readonly string[];
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private currentState: MonitorState = "IDLE";
  /** Whether RCON is currently unreachable, so failures are logged once. */
  private rconFailing = false;

  constructor(
    rconConfig: RconConfig,
    botNames: readonly string[] = MINECRAFT_BOT_NAMES,
  ) {
    this.rconConfig = rconConfig;
    this.botNames = botNames;
  }

  private async getPlayerCount(): Promise<number | null> {
    try {
      const rcon = await Rcon.connect(this.rconConfig);
      const response = await rcon.send("list");
      await rcon.end();

      /*
       * Fini's own bots are real ServerPlayers and appear in `list`, so the
       * count that drives the shutdown has to exclude them - otherwise a bot
       * left wandering keeps the server up forever.
       */
      const playerCount = countHumanPlayers(response, this.botNames);

      if (playerCount === null) {
        console.log(`Could not read the player list: ${response}`);
        return null;
      }

      if (this.rconFailing) {
        this.rconFailing = false;
        console.log("RCON is answering again");
      }

      return playerCount;
    } catch (error) {
      /*
       * Usually this just means the server is down, which is a normal state for
       * the monitor to sit in, so it must not spam the journal every 30
       * seconds. But it is also what a wrong RCON password looks like, and the
       * two are worth telling apart, so log the transition into and out of
       * failure with the reason attached rather than swallowing it.
       */
      if (!this.rconFailing) {
        this.rconFailing = true;
        console.log(
          `RCON is not answering (${describeRconError(
            error,
          )}). Treating the server as down until it responds again.`,
        );
      }
      return null;
    }
  }

  private async sendMinecraftMessage(message: string): Promise<void> {
    try {
      const rcon = await Rcon.connect(this.rconConfig);
      await rcon.send(`say ${message}`);
      await rcon.end();
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }

  public async startMonitoring(): Promise<void> {
    console.log("Starting Minecraft server monitoring...");
    this.currentState = "MONITORING";

    this.checkInterval = setInterval(async () => {
      const playerCount = await this.getPlayerCount();

      if (playerCount === null) {
        /*
         * RCON didn't answer, so the server is down - either it was never up or
         * this monitor just stopped it. Drop any armed countdown and wait: when
         * the server is started again the next poll answers and monitoring
         * picks back up without the service needing to be restarted.
         */
        if (this.currentState !== "MONITORING") {
          console.log("Server is down, waiting for it to come back up");
          this.cancelShutdown();
          this.currentState = "MONITORING";
        }
        return;
      }

      console.log(`Current player count: ${playerCount} (bots excluded)`);
      await this.handlePlayerCount(playerCount);
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Drives the state machine from one player-count reading.
   *
   * Public so it can be tested without an RCON server. Every path through it
   * must leave `currentState` consistent with whether a timer is armed -
   * previously a player joining cancelled the countdown but left the state on
   * `EMPTY_COUNTDOWN`, so the server emptying again looked like it was already
   * counting down and no shutdown was ever scheduled again.
   */
  public async handlePlayerCount(playerCount: number): Promise<void> {
    if (playerCount > 0) {
      if (this.currentState === "EMPTY_COUNTDOWN") {
        console.log("Player joined empty server, canceling empty countdown");
        this.cancelShutdown();
      }
      this.currentState = "MONITORING";
      return;
    }

    if (this.currentState !== "EMPTY_COUNTDOWN") {
      console.log("Server empty, starting 15 minute countdown");
      this.currentState = "EMPTY_COUNTDOWN";

      this.shutdownTimer = setTimeout(() => {
        console.log("Empty timeout reached, shutting down server");
        this.stopServer();
      }, EMPTY_SHUTDOWN_MS);
    }
  }

  private cancelShutdown(): void {
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }
  }

  public stopMonitoring(): void {
    console.log("Stopping monitoring");
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.cancelShutdown();
    this.currentState = "IDLE";
  }

  /**
   * Actually takes the server down. Separated from `stopServer` so tests can
   * exercise the state machine by overriding it - the `screen` fallback below
   * reaches the real server on this host no matter what RCON config it was
   * handed, so a test that calls through to it stops the live world.
   */
  protected async sendStopCommand(message: string): Promise<void> {
    try {
      const rcon = await Rcon.connect(this.rconConfig);
      await rcon.send(`say §c${message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
      await rcon.send("stop");
      await rcon.end();
    } catch (error) {
      console.error("Failed to stop server:", error);
      // Fallback to screen command
      exec('screen -S minecraft -X stuff "stop\n"');
    }
  }

  public async stopServer(
    message: string = "Server shutting down.",
  ): Promise<void> {
    await this.sendStopCommand(message);

    /*
     * Keep polling rather than stopping the poll loop. The server can be
     * started again from the Discord button at any time and nothing restarts
     * this service, so tearing down monitoring here would leave every boot
     * after the first one unmonitored.
     */
    this.cancelShutdown();
    this.currentState = "MONITORING";
  }

  public getState(): MonitorState {
    return this.currentState;
  }

  /** Whether a shutdown is currently armed. For tests and diagnostics. */
  public hasPendingShutdown(): boolean {
    return this.shutdownTimer !== null;
  }
}

// Export singleton instance
export const monitor = new MinecraftMonitor(rconConfig);
