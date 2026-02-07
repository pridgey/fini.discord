import { mock } from "bun:test";

/**
 * Mock implementations for utility modules
 * These can be reassigned in beforeEach hooks for test-specific behavior
 */
export let mockSplitBigString: ReturnType<typeof mock>;

/**
 * Initializes utility mocks with default implementations
 * Call this in beforeEach to reset mocks between tests
 */
export const initUtilityMocks = () => {
  mockSplitBigString = mock((str: string) => [str]);
};

/**
 * Sets up all utility module mocks
 * Call this once at the module level, then use initUtilityMocks() in beforeEach
 */
export const setupUtilityModuleMocks = () => {
  mock.module("../../utilities/splitBigString", () => ({
    splitBigString: (...args: any[]) => mockSplitBigString(...args),
  }));
};
