import { Rcon } from "rcon-client";
import { exec } from "child_process";
import { RconConfig, rconConfig } from "./rcon.config";

type MonitorState =
  | "IDLE"
  | "MONITORING"
  | "EMPTY_COUNTDOWN"
  | "SINGLE_PLAYER_COUNTDOWN";

export class MinecraftMonitor {
  private rconConfig: RconConfig;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private currentState: MonitorState = "IDLE";
  private singlePlayerStartTime: number | null = null;

  constructor(rconConfig: RconConfig) {
    this.rconConfig = rconConfig;
  }

  private async getPlayerCount(): Promise<number | null> {
    try {
      const rcon = await Rcon.connect(this.rconConfig);
      const response = await rcon.send("list");
      await rcon.end();

      // Parse response like "There are 0 of a max of 20 players online:"
      const match = response.match(/There are (\d+)/);
      const playerCount = match ? parseInt(match[1], 10) : 0;

      return playerCount;
    } catch (error) {
      console.error("Failed to check player count:", error);
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
        console.log("Could not get player count, retrying...");
        return;
      }

      console.log(`Current player count: ${playerCount}`);
      await this.handlePlayerCount(playerCount);
    }, 30000); // Check every 30 seconds
  }

  private async handlePlayerCount(playerCount: number): Promise<void> {
    if (playerCount > 1) {
      // More than 1 player - cancel any shutdowns and reset
      if (this.currentState === "SINGLE_PLAYER_COUNTDOWN") {
        console.log("Multiple players detected, canceling shutdown");
        await this.sendMinecraftMessage(
          "§aShutdown canceled! More players have joined.",
        );
        this.cancelShutdown();
      }
      this.currentState = "MONITORING";
      this.singlePlayerStartTime = null;
    } else if (playerCount === 1) {
      // Single player
      if (this.currentState === "EMPTY_COUNTDOWN") {
        // Was empty, now has 1 player
        console.log("Player joined empty server, canceling empty countdown");
        this.cancelShutdown();
      }

      /* No longer handling single player countdown */
      // if (this.currentState !== "SINGLE_PLAYER_COUNTDOWN") {
      //   // Start single player countdown
      //   console.log("Single player detected, starting 1 hour countdown");
      //   this.currentState = "SINGLE_PLAYER_COUNTDOWN";
      //   this.singlePlayerStartTime = Date.now();
      //   await this.sendMinecraftMessage(
      //     "§eYou are the only player online. Server will shut down in 1 hour if no one else joins.",
      //   );

      //   // Schedule shutdown in 1 hour
      //   this.shutdownTimer = setTimeout(() => {
      //     console.log("Single player timeout reached, shutting down server");
      //     this.stopServer(
      //       "Server shutting down - no other players joined in the last hour.",
      //     );
      //   }, 60 * 60 * 1000); // 1 hour
      // } else {
      //   // Already in single player countdown, check for warnings
      //   const elapsed = Date.now() - (this.singlePlayerStartTime ?? 0);
      //   const remaining = 60 * 60 * 1000 - elapsed;

      //   // Send warning at 15, 10, 5, 1 minutes remaining
      //   if (remaining <= 15 * 60 * 1000 && remaining > 14.5 * 60 * 1000) {
      //     await this.sendMinecraftMessage(
      //       "§e15 minutes until server shutdown. Invite friends to keep playing!",
      //     );
      //   } else if (remaining <= 10 * 60 * 1000 && remaining > 9.5 * 60 * 1000) {
      //     await this.sendMinecraftMessage(
      //       "§610 minutes until server shutdown.",
      //     );
      //   } else if (remaining <= 5 * 60 * 1000 && remaining > 4.5 * 60 * 1000) {
      //     await this.sendMinecraftMessage("§c5 minutes until server shutdown!");
      //   } else if (remaining <= 1 * 60 * 1000 && remaining > 0.5 * 60 * 1000) {
      //     await this.sendMinecraftMessage(
      //       "§c§l1 MINUTE until server shutdown!",
      //     );
      //   }
      // }
    } else if (playerCount === 0) {
      // No players
      if (this.currentState === "SINGLE_PLAYER_COUNTDOWN") {
        // Was single player, now empty
        console.log("Last player left, switching to empty countdown");
        this.cancelShutdown();
      }

      if (this.currentState !== "EMPTY_COUNTDOWN") {
        // Start empty countdown
        console.log("Server empty, starting 15 minute countdown");
        this.currentState = "EMPTY_COUNTDOWN";

        // Schedule shutdown in 15 minutes
        this.shutdownTimer = setTimeout(() => {
          console.log("Empty timeout reached, shutting down server");
          this.stopServer();
        }, 15 * 60 * 1000); // 15 minutes
      }
      this.singlePlayerStartTime = null;
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

  public async stopServer(
    message: string = "Server shutting down.",
  ): Promise<void> {
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
    this.stopMonitoring();
  }

  public getState(): MonitorState {
    return this.currentState;
  }
}

// Export singleton instance
export const monitor = new MinecraftMonitor(rconConfig);
