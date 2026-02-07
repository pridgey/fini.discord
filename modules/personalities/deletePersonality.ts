import { PersonalitiesRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";
import { getPersonalityByName } from "./getPersonality";

type DeletePersonalityParams = {
  personalityId?: string;
};

/**
 * Utility function to delete a personality by its ID.
 */
export const deletePersonality = async ({
  personalityId,
}: DeletePersonalityParams) => {
  if (!personalityId) throw new Error("No personality ID provided to delete.");

  await pb
    .collection<PersonalitiesRecord>("personalities")
    .delete(personalityId);
};

type DeletePersonalityByNameParams = {
  userId: string;
  personalityName: string;
  serverId?: string;
};

/**
 * Utility function to delete a personality by its name.
 */
export const deletePersonalityByName = async ({
  userId,
  personalityName,
  serverId,
}: DeletePersonalityByNameParams) => {
  const foundPersonality = await getPersonalityByName({
    userId,
    personalityName,
    serverId,
  });

  if (!foundPersonality || !foundPersonality.length)
    throw new Error("Personality not found.");

  await deletePersonality({ personalityId: foundPersonality.at(0)?.id });
};
