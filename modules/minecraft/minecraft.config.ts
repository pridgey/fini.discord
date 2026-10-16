/**
 * Root of the Minecraft server install (the directory holding startserver.sh,
 * mods/ and logs/). Set MINECRAFT_PATH in .env; the default is where the
 * All the Mons server lives on the Fini host.
 */
export const MINECRAFT_SERVER_DIR =
  process.env.MINECRAFT_PATH || "/opt/minecraft/AllTheMons";

/**
 * Names of Fini's own fake players, which must not keep the server alive.
 *
 * These are real `ServerPlayer`s created by SiliconeDolls, so `list` counts
 * them like anyone else. Set MINECRAFT_BOT_NAMES in `.env` as a comma
 * separated list to change it.
 */
export const MINECRAFT_BOT_NAMES: readonly string[] = (
  process.env.MINECRAFT_BOT_NAMES || "Fini"
)
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name.length > 0);

/**
 * What someone types in game to talk to Fini. Matches the Discord trigger so
 * it is the same phrase everywhere.
 */
export const MINECRAFT_CHAT_TRIGGER =
  process.env.MINECRAFT_CHAT_TRIGGER || "hey fini";
