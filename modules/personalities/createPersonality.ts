import { PersonalitiesRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

export const MAX_PERSONALITY_PROMPT_LENGTH = 300;
export const MAX_PERSONALITY_NAME_LENGTH = 100;

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
  if (!personalityPrompt.length || !personalityName.length) {
    throw new Error("Personality name and prompt are required.");
  }

  if (
    personalityPrompt.length > MAX_PERSONALITY_PROMPT_LENGTH ||
    personalityName.length > MAX_PERSONALITY_NAME_LENGTH
  ) {
    throw new Error("Personality name or prompt is too long.");
  }

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
