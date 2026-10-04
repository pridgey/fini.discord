/**
 * Sets the skin Fini's in-game bot wears.
 *
 *   bun --env-file=.env run scripts/apply-bot-skin.ts account:Dinnerbone
 *   bun --env-file=.env run scripts/apply-bot-skin.ts 'url:https://host/fini.png#slim'
 *
 * Writes the generated KubeJS script into the modpack and reloads it. The
 * generated file is disposable - a pack update deletes `kubejs/`, and running
 * this again puts it back.
 *
 * A caveat worth knowing before wondering why nothing changed: a client that
 * has already resolved this player keeps the skin it first saw, so reconnect
 * to see a change.
 */
import { join } from "path";
import { Rcon } from "rcon-client";
import {
  parseSkinSpec,
  renderSkinScript,
  resolveSkinSpec,
  SkinSpecError,
} from "../utilities/minecraft/botSkin";
import { MINECRAFT_BOT_NAMES, MINECRAFT_SERVER_DIR } from "../utilities/minecraft/minecraft.config";
import { rconConfig } from "../utilities/minecraft/rcon.config";

const SCRIPT_PATH = join(
  MINECRAFT_SERVER_DIR,
  "kubejs/server_scripts/fini_skin.js",
);

const botName = MINECRAFT_BOT_NAMES[0] || "Fini";
const rawSpec = process.argv[2];

if (!rawSpec) {
  console.error(
    "Usage: apply-bot-skin.ts <account:NAME | url:HTTPS_URL[#slim]>\n" +
      '  account:Dinnerbone                    copy a real account\'s skin (signed)\n' +
      "  url:https://host/fini.png#slim        any PNG (unsigned)",
  );
  process.exit(1);
}

const main = async () => {
  const spec = parseSkinSpec(rawSpec);

  /*
   * Only `url` specs need an identity, to build a payload from scratch. The
   * values are cosmetic - the client does not check them against the player -
   * but a real payload carries them, so these match the shape.
   */
  const identity = { id: "00000000000000000000000000000000", name: botName };

  const textures = await resolveSkinSpec(spec, identity);

  const description =
    spec.kind === "account"
      ? `${spec.name}'s account skin (Mojang-signed)`
      : `${spec.url} (${spec.model}, unsigned)`;

  await Bun.write(
    SCRIPT_PATH,
    renderSkinScript({ botName, textures, description }),
  );
  console.log(`Wrote ${SCRIPT_PATH}`);
  console.log(`  skin:   ${description}`);
  console.log(`  signed: ${textures.signature !== null}`);

  // A script-only reload is enough here, and takes about a second - but note
  // ServerEvents.tick only *binds* on a full server start, so the very first
  // install of this script needs a restart
  const rcon = await Rcon.connect(rconConfig);
  const response = await rcon.send("kubejs reload server-scripts");
  await rcon.end();
  console.log(`  reload: ${response.trim() || "ok"}`);

  if (textures.signature === null) {
    console.log(
      "\nThis skin is unsigned. If the bot shows the default skin instead, the\n" +
        "client rejected it and only Mojang-signed textures will render.",
    );
  }
  console.log("\nReconnect to see the change - already-connected clients keep the old skin.");
};

main().catch((error) => {
  if (error instanceof SkinSpecError) {
    console.error(`Bad skin spec: ${error.message}`);
    process.exit(1);
  }
  throw error;
});
