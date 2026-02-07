import { pb } from "../../utilities/pocketbase";
import {
  getAllPersonalitiesForUser,
  getPersonalityByName,
} from "./getPersonality";

type SetPersonalityActiveParams = {
  personalityId: string;
  userId: string;
  serverId?: string;
};

/**
 * Utility function to set a specific personality as active for a user, and mark all others as inactive.
 */
export const setPersonalityActive = async ({
  personalityId,
  userId,
  serverId,
}: SetPersonalityActiveParams) => {
  // First mark all of the user's personalities as inactive
  await markAllPersonalitiesInactiveForUser({
    userId,
    serverId,
  });

  // Then mark the selected personality as active
  await pb.collection("personalities").update(personalityId, {
    active: true,
  });
};

type MarkAllPersonalitiesInactiveForUserParams = {
  userId: string;
  serverId?: string;
};

/**
 * Utility function to mark all of a user's personalities as inactive.
 */
export const markAllPersonalitiesInactiveForUser = async ({
  userId,
  serverId,
}: MarkAllPersonalitiesInactiveForUserParams) => {
  const allUserPersonalities = await getAllPersonalitiesForUser({
    userId,
    serverId,
  });

  for (let i = 0; i < allUserPersonalities.length; i++) {
    await pb
      .collection("personalities")
      .update(allUserPersonalities[i].id || "", {
        ...allUserPersonalities[i],
        active: false,
      });
  }
};

type SetPersonalityActiveByNameParams = {
  personalityName: string;
  userId: string;
  serverId?: string;
};

/**
 * Utility function to set a specific personality as active for a user by name.
 */
export const setPersonalityActiveByName = async ({
  personalityName,
  userId,
  serverId,
}: SetPersonalityActiveByNameParams) => {
  const foundPersonality = await getPersonalityByName({
    userId,
    serverId,
    personalityName,
  });

  if (!foundPersonality.length || foundPersonality.at(0) === undefined) {
    throw new Error(
      `Cannot find a personality with the name ${personalityName}.`,
    );
  }

  await setPersonalityActive({
    personalityId: foundPersonality.at(0)?.id ?? "",
    userId,
    serverId,
  });
};
