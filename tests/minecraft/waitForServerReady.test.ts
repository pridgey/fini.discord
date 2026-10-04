import { describe, expect, it } from "bun:test";
import {
  describeFailure,
  READY_PATTERN,
} from "../../utilities/minecraft/waitForServerReady";

// All snippets below are copied verbatim from this server's own logs - the
// boot checker exists because a fixed 10 second wait reported both of these
// crashes as a successful start.
describe("READY_PATTERN", () => {
  it("matches the line the server prints once the world is loaded", () => {
    expect(
      READY_PATTERN.test(
        '[08Apr2026 22:06:45.657] [Server thread/INFO] [net.minecraft.server.dedicated.DedicatedServer/]: Done (2.093s)! For help, type "help"',
      ),
    ).toBe(true);
  });

  // The port binds well before the world finishes loading, so this line must
  // not be mistaken for readiness
  it("does not match the server merely binding its port", () => {
    expect(
      READY_PATTERN.test(
        "[08Apr2026 22:06:43.458] [Server thread/INFO] [net.minecraft.server.dedicated.DedicatedServer/]: Starting Minecraft server on *:56552",
      ),
    ).toBe(false);
  });
});

describe("describeFailure", () => {
  // Extracting a pack update over the old one leaves two copies of every
  // updated mod, and the loader aborts on the first duplicate modid
  it("names the jars when a pack update leaves duplicate mods behind", () => {
    const log = [
      '[04Oct2026 00:55:27.189] [main/ERROR] [CrashAssistantJarInJarHelper/]: Found more than one mod with modid "crash_assistant". Crash Assistant is duplicated. Crashing!',
      "Duplicated mods:",
      "CrashAssistant-neoforge-1.20.6-1.21.4-1.11.12.jar",
      "CrashAssistant-neoforge-1.20.6-1.21.4-1.11.0.jar",
    ].join("\n");

    expect(describeFailure(log)).toBe(
      "Duplicate mods (CrashAssistant-neoforge-1.20.6-1.21.4-1.11.12.jar)",
    );
  });

  it("names the missing content when worldgen registries fail to load", () => {
    const log = [
      "[04Oct2026 01:15:34.086] [main/ERROR] [net.minecraft.resources.RegistryDataLoader/]: Registry loading errors:",
      "java.lang.IllegalStateException: Unbound values in registry ResourceKey[minecraft:root / minecraft:worldgen/template_pool]: [cobblemonextrastructures:pokemon_center]",
    ].join("\n");

    expect(describeFailure(log)).toBe(
      "Missing worldgen content: cobblemonextrastructures:pokemon_center",
    );
  });

  // Anything without a known signature should still surface the JVM's own
  // root cause rather than a shrug
  it("falls back to the deepest Caused by line", () => {
    const log = [
      "java.util.concurrent.ExecutionException: java.lang.IllegalStateException: boom",
      "Caused by: java.lang.RuntimeException: outer problem",
      "Caused by: java.lang.IllegalStateException: Failed to load registries due to above errors",
      "\tat TRANSFORMER/minecraft@1.21.1/net.minecraft.server.Main.main(Main.java:204)",
    ].join("\n");

    expect(describeFailure(log)).toBe(
      "Failed to load registries due to above errors",
    );
  });

  it("returns null when the log shows no failure", () => {
    expect(
      describeFailure(
        '[08Apr2026 22:06:45.657] [Server thread/INFO]: Done (2.093s)! For help, type "help"',
      ),
    ).toBeNull();
  });
});
