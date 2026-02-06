import { PersonalitiesRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

type CreatePersonalityParams = {
  personalityPrompt: string;
  personalityName: string;
  setActiveNow?: boolean;
  userId: string;
  serverId: string | undefined;
};

/**
 * Utility function to create a new personality record in the database.
 */
export const createNewPersonality = async ({
  personalityPrompt,
  personalityName,
  setActiveNow,
  userId,
  serverId,
}: CreatePersonalityParams) => {
  const newPersonalityRecord = await pb
    .collection<PersonalitiesRecord>("personalities")
    .create({
      user_id: userId,
      prompt: personalityPrompt,
      personality_name: personalityName,
      active: setActiveNow ?? false,
      server_id: serverId ?? "unknown server",
    });

  return newPersonalityRecord;
};
