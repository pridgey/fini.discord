import { mock } from "bun:test";
import type { PersonalitiesRecord } from "../../types/PocketbaseTables";

/**
 * Mock implementations for personality-related modules
 * These can be reassigned in beforeEach hooks for test-specific behavior
 */
export let mockCreateNewPersonality: ReturnType<typeof mock>;
export let mockPersonalityExistsForUser: ReturnType<typeof mock>;
export let mockSetPersonalityActive: ReturnType<typeof mock>;
export let mockGetActivePersonality: ReturnType<typeof mock>;
export let mockGetAllPersonalities: ReturnType<typeof mock>;

/**
 * Initializes personality mocks with default implementations
 * Call this in beforeEach to reset mocks between tests
 */
export const initPersonalityMocks = () => {
  mockCreateNewPersonality = mock(() =>
    Promise.resolve({ id: "test-personality-id" } as PersonalitiesRecord),
  );
  mockPersonalityExistsForUser = mock(() => Promise.resolve(false));
  mockSetPersonalityActive = mock(() => Promise.resolve());
  mockGetActivePersonality = mock(() => Promise.resolve(null));
  mockGetAllPersonalities = mock(() => Promise.resolve([]));
};

/**
 * Sets up all personality module mocks
 * Call this once at the module level, then use initPersonalityMocks() in beforeEach
 */
export const setupPersonalityModuleMocks = () => {
  mock.module("../../modules/personalities/createPersonality", () => ({
    createNewPersonality: (...args: any[]) => mockCreateNewPersonality(...args),
  }));

  mock.module("../../modules/personalities/getPersonality", () => ({
    personalityExistsForUser: (...args: any[]) =>
      mockPersonalityExistsForUser(...args),
    getActivePersonality: (...args: any[]) => mockGetActivePersonality(...args),
    getAllPersonalities: (...args: any[]) => mockGetAllPersonalities(...args),
  }));

  mock.module("../../modules/personalities/setPersonalityActive", () => ({
    setPersonalityActive: (...args: any[]) => mockSetPersonalityActive(...args),
  }));
};
