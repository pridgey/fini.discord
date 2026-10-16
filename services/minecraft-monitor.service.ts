import { MinecraftMonitor } from "../modules/minecraft/minecraftMonitoring";
import { rconConfig } from "../modules/minecraft/rcon.config";

const monitor = new MinecraftMonitor(rconConfig);

/*
 * The poll loop treats an unreachable RCON as "server is down, keep waiting",
 * so there is nothing to probe for up front - start polling and let it find
 * the server whenever it comes up. This service is meant to outlive any number
 * of server boots and shutdowns.
 */
// Host and port only - never log the RCON password
/*
 * Without the password every RCON call fails, which is indistinguishable from
 * "the server is down" - the monitor would poll politely forever and shut
 * nothing down, looking healthy the whole time. The systemd unit supplies it
 * via EnvironmentFile, so this guard is only reachable when the service is run
 * by hand from a directory where bun finds no .env (`services/`, notably).
 * Fail loudly rather than idling.
 */
if (!rconConfig.password) {
  console.error(
    "MINECRAFT_RCON_PASS is not set - RCON cannot authenticate and nothing " +
      "would ever be monitored. Run this service from the project root with " +
      "`bun --env-file=.env run services/minecraft-monitor.service.ts`.",
  );
  process.exit(1);
}

console.log(
  `Starting Minecraft server monitoring service... (rcon ${rconConfig.host}:${rconConfig.port})`,
);
await monitor.startMonitoring();

process.on("SIGINT", () => {
  console.log("Shutting down monitoring service...");
  monitor.stopMonitoring();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down monitoring service...");
  monitor.stopMonitoring();
  process.exit(0);
});
