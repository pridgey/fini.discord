import { ConfigRecord } from "../../types/PocketbaseTables";
import { pb } from "../pocketbase";

/**
 * Utility function to get configuration for a specific server
 */
export const getConfigForServer = async (
  serverId: string
): Promise<ConfigRecord | null> => {
  const configRecord = await pb
    .collection<ConfigRecord>("config")
    .getFirstListItem(`server_id = "${serverId}"`)
    .catch(() => null);

  return configRecord;
};

/**
 * Utility function to get the bot channel ID for a specific server
 */
export const getBotChannelForServer = async (
  serverId: string
): Promise<string | null> => {
  const configRecord = await getConfigForServer(serverId);

  return configRecord?.bot_channel || null;
};
