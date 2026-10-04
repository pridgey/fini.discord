/**
 * Root of the Minecraft server install (the directory holding startserver.sh,
 * mods/ and logs/). Set MINECRAFT_PATH in .env; the default is where the
 * All the Mons server lives on the Fini host.
 */
export const MINECRAFT_SERVER_DIR =
  process.env.MINECRAFT_PATH || "/opt/minecraft/AllTheMons";
