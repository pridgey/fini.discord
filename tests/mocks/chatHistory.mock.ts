import { mock } from "bun:test";

/**
 * Mock implementations for chat history utilities
 * These can be reassigned in beforeEach hooks for test-specific behavior
 */
export let mockClearHistory: ReturnType<typeof mock>;
export let mockGetHistory: ReturnType<typeof mock>;
export let mockAddHistory: ReturnType<typeof mock>;

/**
 * Initializes chat history mocks with default implementations
 * Call this in beforeEach to reset mocks between tests
 */
export const initChatHistoryMocks = () => {
  mockClearHistory = mock(() => Promise.resolve());
  mockGetHistory = mock(() => Promise.resolve([]));
  mockAddHistory = mock(() => Promise.resolve());
};

/**
 * Sets up the chat history module mock
 * Call this once at the module level, then use initChatHistoryMocks() in beforeEach
 */
export const setupChatHistoryModuleMock = () => {
  mock.module("../../utilities/chatHistory", () => ({
    clearHistory: (...args: any[]) => mockClearHistory(...args),
    getHistory: (...args: any[]) => mockGetHistory(...args),
    addHistory: (...args: any[]) => mockAddHistory(...args),
  }));
};
