import { mock } from "bun:test";
import type { PersonalitiesRecord } from "../../types/PocketbaseTables";

// Constants from the real module
export const MAX_PERSONALITY_PROMPT_LENGTH = 300;
export const MAX_PERSONALITY_NAME_LENGTH = 100;

/**
 * Mock implementations for personality-related modules
 * These can be reassigned in beforeEach hooks for test-specific behavior
 */
export let mockCreateNewPersonality: ReturnType<typeof mock>;
export let mockPersonalityExistsForUser: ReturnType<typeof mock>;
export let mockSetPersonalityActive: ReturnType<typeof mock>;
export let mockGetActivePersonality: ReturnType<typeof mock>;
export let mockGetAllPersonalities: ReturnType<typeof mock>;
export let mockDeletePersonalityByName: ReturnType<typeof mock>;
export let mockGetPersonalityByName: ReturnType<typeof mock>;
export let mockUpdatePersonality: ReturnType<typeof mock>;
export let mockGetAllPersonalitiesForUser: ReturnType<typeof mock>;
export let mockMarkAllPersonalitiesInactiveForUser: ReturnType<typeof mock>;
export let mockSetPersonalityActiveByName: ReturnType<typeof mock>;

type CreatePersonalityParams = {
  personalityPrompt: string;
  personalityName: string;
  setActiveNow?: boolean;
  userId: string;
  serverId: string | undefined;
};

/**
 * Initializes personality mocks with default implementations
 * Call this in beforeEach to reset mocks between tests
 */
export const initPersonalityMocks = () => {
  mockCreateNewPersonality = mock(
    ({ personalityPrompt, personalityName }: CreatePersonalityParams) => {
      // Implement validation logic from the real function
      if (!personalityPrompt.length || !personalityName.length) {
        return Promise.reject(
          new Error("Personality name and prompt are required."),
        );
      }

      if (
        personalityPrompt.length > MAX_PERSONALITY_PROMPT_LENGTH ||
        personalityName.length > MAX_PERSONALITY_NAME_LENGTH
      ) {
        return Promise.reject(
          new Error("Personality name or prompt is too long."),
        );
      }

      return Promise.resolve({
        id: "test-personality-id",
      } as PersonalitiesRecord);
    },
  );
  mockPersonalityExistsForUser = mock(() => Promise.resolve(false));
  mockSetPersonalityActive = mock(() => Promise.resolve());
  mockGetActivePersonality = mock(() => Promise.resolve(null));
  mockGetAllPersonalities = mock(() => Promise.resolve([]));
  mockDeletePersonalityByName = mock(() => Promise.resolve());
  mockGetPersonalityByName = mock(() => Promise.resolve([]));
  mockUpdatePersonality = mock((params: any) =>
    Promise.resolve({
      id: params.personalityId,
      personality_name: "TestPersonality",
    } as PersonalitiesRecord),
  );
  mockGetAllPersonalitiesForUser = mock(() => Promise.resolve([]));
  mockMarkAllPersonalitiesInactiveForUser = mock(() => Promise.resolve());
  mockSetPersonalityActiveByName = mock(() => Promise.resolve(true));
};

/**
 * Sets up all personality module mocks
 * Call this once at the module level, then use initPersonalityMocks() in beforeEach
 */
export const setupPersonalityModuleMocks = () => {
  mock.module("../../modules/personalities/createPersonality", () => ({
    createNewPersonality: (...args: any[]) => mockCreateNewPersonality(...args),
    MAX_PERSONALITY_PROMPT_LENGTH,
    MAX_PERSONALITY_NAME_LENGTH,
  }));

  mock.module("../../modules/personalities/getPersonality", () => ({
    personalityExistsForUser: (...args: any[]) =>
      mockPersonalityExistsForUser(...args),
    getActivePersonality: (...args: any[]) => mockGetActivePersonality(...args),
    getAllPersonalities: (...args: any[]) => mockGetAllPersonalities(...args),
    getPersonalityByName: (...args: any[]) => mockGetPersonalityByName(...args),
    getAllPersonalitiesForUser: (...args: any[]) =>
      mockGetAllPersonalitiesForUser(...args),
  }));

  mock.module("../../modules/personalities/setPersonalityActive", () => ({
    setPersonalityActive: (...args: any[]) => mockSetPersonalityActive(...args),
    markAllPersonalitiesInactiveForUser: (...args: any[]) =>
      mockMarkAllPersonalitiesInactiveForUser(...args),
    setPersonalityActiveByName: (...args: any[]) =>
      mockSetPersonalityActiveByName(...args),
  }));

  mock.module("../../modules/personalities/deletePersonality", () => ({
    deletePersonalityByName: (...args: any[]) =>
      mockDeletePersonalityByName(...args),
  }));

  mock.module("../../modules/personalities/updatePersonlity", () => ({
    updatePersonality: (...args: any[]) => mockUpdatePersonality(...args),
  }));
};
