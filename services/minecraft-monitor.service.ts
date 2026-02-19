import { MinecraftMonitor } from "../utilities/minecraft/minecraftMonitoring";
import { rconConfig } from "../utilities/minecraft/rcon.config";

const monitor = new MinecraftMonitor(rconConfig);

// Check if server is running before starting monitoring
async function checkAndStartMonitoring() {
  console.log("Starting Minecraft server monitoring service...", {
    rconConfig,
  });
  try {
    const playerCount = await monitor["getPlayerCount"]();
    if (playerCount !== null) {
      console.log("Minecraft server detected, starting monitoring...");
      await monitor.startMonitoring();
    } else {
      console.log(
        "Minecraft server not detected, will check again in 30 seconds...",
      );
      setTimeout(checkAndStartMonitoring, 30000);
    }
  } catch (error) {
    console.log("Server not ready, checking again in 30 seconds...");
    setTimeout(checkAndStartMonitoring, 30000);
  }
}

checkAndStartMonitoring();

// Keep the process alive
process.on("SIGINT", () => {
  console.log("Shutting down monitoring service...");
  monitor.stopMonitoring();
  process.exit(0);
});
