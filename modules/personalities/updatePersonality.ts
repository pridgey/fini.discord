import { PersonalitiesRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";
import { MAX_PERSONALITY_PROMPT_LENGTH } from "./createPersonality";

type UpdatePersonalityParams = {
  personalityId: string;
  personalityPrompt: string;
};

/**
 * Utility function to update an existing personality record in the database.
 */
export const updatePersonality = async ({
  personalityId,
  personalityPrompt,
}: UpdatePersonalityParams) => {
  if (!personalityId.length || !personalityPrompt.length) {
    throw new Error("Personality ID, name, and prompt are required.");
  }

  if (personalityPrompt.length > MAX_PERSONALITY_PROMPT_LENGTH) {
    throw new Error("Personality name or prompt is too long.");
  }

  const updatedPersonalityRecord = await pb
    .collection<PersonalitiesRecord>("personalities")
    .update(personalityId, {
      prompt: personalityPrompt,
    });

  return updatedPersonalityRecord;
};
