import { PersonalitiesRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

/** The identity used when a user has no personality set, or when one is deliberately left out. */
export const NEUTRAL_PERSONALITY =
  "You are a helpful discord chat bot named Fini. Drop any personality you have adopted.";

/**
 * Finds the personality a user has switched on for a server, if any.
 * @param userId The user's ID
 * @param serverId The server ID
 * @returns The active personality, or undefined if they have none
 */
export const getActivePersonality = async (
  userId: string,
  serverId: string,
): Promise<PersonalitiesRecord | undefined> => {
  const foundPersonalities = await pb
    .collection<PersonalitiesRecord>("personalities")
    .getFullList({
      filter: pb.filter(
        "user_id = {:user_id} && active = true && server_id = {:server_id}",
        { user_id: userId, server_id: serverId },
      ),
    });

  return foundPersonalities[0];
};

/**
 * The system prompt line that makes the model speak as a personality.
 * @param personality The personality to adopt
 */
export const personalityPrompt = (personality: PersonalitiesRecord): string =>
  `You are ${personality.personality_name} with the personality of ${personality.prompt}. Do not mention other personalities that you have adopted if seen in history. Act only as ${personality.personality_name} and provide helpful and accurate information.`;

/**
 * Help function to determine if a user has a personality set for the AI chat
 * @param userId
 * @param serverId
 * @returns The prompt for their personality, or the neutral one if they have none
 */
export const determinePersonality = async (
  userId: string,
  serverId: string,
) => {
  const personality = await getActivePersonality(userId, serverId);
  return personality ? personalityPrompt(personality) : NEUTRAL_PERSONALITY;
};
