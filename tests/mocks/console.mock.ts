import { mock } from "bun:test";

/**
 * Mock implementations for console methods
 */
export let mockConsoleLog: ReturnType<typeof mock>;
export let mockConsoleError: ReturnType<typeof mock>;
export let mockConsoleWarn: ReturnType<typeof mock>;
export let mockConsoleInfo: ReturnType<typeof mock>;

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

/**
 * Initializes console mocks with silent implementations
 * Call this in beforeEach to reset and silence console output in tests
 */
export const initConsoleMocks = () => {
  mockConsoleLog = mock(() => {});
  mockConsoleError = mock(() => {});
  mockConsoleWarn = mock(() => {});
  mockConsoleInfo = mock(() => {});
};

/**
 * Mocks console methods to suppress output during tests
 * Call this in beforeEach to silence console during tests
 */
export const mockConsole = () => {
  initConsoleMocks();
  console.log = mockConsoleLog;
  console.error = mockConsoleError;
  console.warn = mockConsoleWarn;
  console.info = mockConsoleInfo;
};

/**
 * Restores original console methods
 * Call this in afterEach or afterAll to restore console
 */
export const restoreConsole = () => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
};
