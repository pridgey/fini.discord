import { Rcon } from "rcon-client";
import { rconConfig } from "./rcon.config";

/**
 * Utility function to get the list of players currently online on the Minecraft server.
 */
export const getServerPlayers = async () => {
  try {
    const rcon = await Rcon.connect(rconConfig);
    const response = await rcon.send("list");
    await rcon.end();
    return response;
  } catch (error) {
    console.error("Error fetching server players:", error);
    return null;
  }
};
