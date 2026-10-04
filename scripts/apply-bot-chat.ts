/**
 * Installs the KubeJS script that lets Fini hear in-game chat.
 *
 *   bun --env-file=.env run scripts/apply-bot-chat.ts
 *
 * In-game chat never reaches the server log on this pack, because
 * NoChatReports converts it to system messages. This script echoes messages
 * beginning with the trigger phrase to the console, where the bot service
 * reads them back out of latest.log.
 *
 * **The first install needs a full server restart.** `PlayerEvents.chat` only
 * binds when the server starts; a script-only reload updates an already-bound
 * handler but will not register a new one.
 */
import { join } from "path";
import { Rcon } from "rcon-client";
import { renderChatScript } from "../utilities/minecraft/botChat";
import {
  MINECRAFT_CHAT_TRIGGER,
  MINECRAFT_SERVER_DIR,
} from "../utilities/minecraft/minecraft.config";
import { rconConfig } from "../utilities/minecraft/rcon.config";

const SCRIPT_PATH = join(
  MINECRAFT_SERVER_DIR,
  "kubejs/server_scripts/fini_chat.js",
);

const main = async () => {
  await Bun.write(
    SCRIPT_PATH,
    renderChatScript({ trigger: MINECRAFT_CHAT_TRIGGER }),
  );
  console.log(`Wrote ${SCRIPT_PATH}`);
  console.log(`  trigger: "${MINECRAFT_CHAT_TRIGGER}"`);

  try {
    const rcon = await Rcon.connect(rconConfig);
    const response = await rcon.send("kubejs reload server-scripts");
    await rcon.end();
    console.log(`  reload:  ${response.trim() || "ok"}`);
  } catch {
    console.log("  reload:  skipped (server not running)");
  }

  console.log(
    "\nIf this is the first install, restart the server - PlayerEvents.chat\n" +
      "only binds at startup, so a reload alone leaves it silently inactive.",
  );
};

await main();
