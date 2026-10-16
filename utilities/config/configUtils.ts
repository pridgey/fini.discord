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

/**
 * Applies `updates` to a server's config, creating the record the first time.
 * @param identifier "server-channel", stored on a new record for reading the table by eye
 */
export const saveConfigForServer = async (
  serverId: string,
  updates: Partial<ConfigRecord>,
  identifier: string,
): Promise<void> => {
  const configRecord = await getConfigForServer(serverId);

  if (configRecord?.id) {
    await pb.collection<ConfigRecord>("config").update(configRecord.id, updates);
    return;
  }

  await pb.collection<ConfigRecord>("config").create({
    server_id: serverId,
    bot_channel: updates.bot_channel || "",
    horsey_names: updates.horsey_names || "",
    identifier,
  });
};
