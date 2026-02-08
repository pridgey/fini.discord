import { PersonalitiesRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

/**
 * Help function to determine if a user has a personality set for the AI chat
 * @param userId
 * @param serverId
 * @returns
 */
export const determinePersonality = async (
  userId: string,
  serverId: string,
) => {
  const foundPersonalities = await pb
    .collection<PersonalitiesRecord>("personalities")
    .getFullList({
      filter: `user_id = "${userId}" && active = true && server_id = "${serverId}"`,
    });

  const foundPersonality =
    foundPersonalities.length > 0 ? foundPersonalities[0] : undefined;

  const personalityPrompt = foundPersonality
    ? `You are ${foundPersonality.personality_name} with the personality of ${foundPersonality.prompt}.`
    : "";

  return personalityPrompt;
};
