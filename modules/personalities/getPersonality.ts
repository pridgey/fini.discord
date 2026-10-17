import { PersonalitiesRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

type GetPersonalityByNameParams = {
  userId: string;
  personalityName: string;
  serverId?: string;
};

/**
 * Utility function to fetch all personalities for a user, filtered by personality name.
 */
export const getPersonalityByName = async ({
  userId,
  personalityName,
  serverId,
}: GetPersonalityByNameParams) => {
  // Personalities belong to a server; outside one (a DM) none can match.
  if (!serverId) return [];
  const retrievedPersonalities = await pb
    .collection<PersonalitiesRecord>("personalities")
    .getFullList({
      filter: pb.filter(
        "user_id = {:userId} && personality_name = {:personalityName} && server_id = {:serverId}",
        {
          userId,
          personalityName,
          serverId,
        },
      ),
    });

  return retrievedPersonalities;
};

type PersonalityExistsForUserParams = {
  userId: string;
  personalityName: string;
  serverId?: string;
};

/**
 * Utility function to check if a personality with a given name already exists for a user.
 */
export const personalityExistsForUser = async ({
  userId,
  personalityName,
  serverId,
}: PersonalityExistsForUserParams) => {
  const existingPersonalities = await getPersonalityByName({
    userId,
    personalityName,
    serverId,
  });

  return existingPersonalities.length > 0;
};

type getAllPersonalitiesForUserParams = {
  userId: string;
  serverId?: string;
};

/**
 * Utility function to fetch all personalities for a user.
 */
export const getAllPersonalitiesForUser = async ({
  userId,
  serverId,
}: getAllPersonalitiesForUserParams) => {
  const retrievedPersonalities = await pb
    .collection<PersonalitiesRecord>("personalities")
    .getFullList({
      filter: pb.filter("user_id = {:user_id} && server_id = {:server_id}", {
        user_id: userId,
        server_id: serverId,
      }),
    });

  return retrievedPersonalities;
};
