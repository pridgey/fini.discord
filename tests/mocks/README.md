# Test Utilities

This directory contains shared mock utilities for testing. These mocks help you write tests more efficiently by providing reusable mock implementations.

## Available Mocks

### PocketBase Mocks (`pocketbase.mock.ts`)

Provides mock implementations for PocketBase database operations.

**Usage:**

```typescript
import { setupPocketbaseMock, createMockPb } from "../mocks/pocketbase.mock";

// Setup the module mock (do this before importing modules that use pocketbase)
const mockPb = setupPocketbaseMock();

// Use in tests
mockPb.collection("users").create({ name: "test" });
```

### Personality Mocks (`personalities.mock.ts`)

Provides mocks for all personality-related module functions.

**Usage:**

```typescript
import {
  setupPersonalityModuleMocks,
  initPersonalityMocks,
  mockCreateNewPersonality,
  mockPersonalityExistsForUser,
  mockSetPersonalityActive,
} from "../mocks/personalities.mock";

// Setup module mocks (once, before importing)
setupPersonalityModuleMocks();

// In your beforeEach hook
beforeEach(() => {
  initPersonalityMocks(); // Reset mocks to defaults

  // Customize behavior for specific tests
  mockCreateNewPersonality.mockImplementation(() =>
    Promise.resolve({ id: "custom-id" }),
  );
});
```

### Chat History Mocks (`chatHistory.mock.ts`)

Provides mocks for chat history utilities.

**Usage:**

```typescript
import {
  setupChatHistoryModuleMock,
  initChatHistoryMocks,
  mockClearHistory,
  mockGetHistory,
  mockAddHistory,
} from "../mocks/chatHistory.mock";

// Setup module mock (once, before importing)
setupChatHistoryModuleMock();

// In your beforeEach hook
beforeEach(() => {
  initChatHistoryMocks(); // Reset mocks to defaults
});
```

### Console Mocks (`console.mock.ts`)

Provides mocks for console methods to suppress output during tests. This is especially useful for error handling tests where expected errors would otherwise clutter the test output.

**Usage:**

```typescript
import { mockConsole, restoreConsole } from "../mocks/console.mock";

beforeEach(() => {
  mockConsole(); // Suppress console output
});

afterEach(() => {
  restoreConsole(); // Restore original console
});
```

**Why use this?**

When testing error handling, your code may log errors using `console.error()`. These expected errors create noise in test output. The console mock silences this output while still allowing you to verify error handling behavior.

## Best Practices

1. **Setup module mocks before imports**: Call `setup*ModuleMocks()` functions at the module level, before importing the code you're testing.

2. **Reset mocks in beforeEach**: Always call `init*Mocks()` in your `beforeEach` hook to ensure clean state between tests.

3. **Customize per test**: Override mock implementations in individual tests as needed:

   ```typescript
   mockCreateNewPersonality.mockImplementation(() =>
     Promise.reject(new Error("Test error")),
   );
   ```

4. **Check mock calls**: Verify mocks were called with expected arguments:
   ```typescript
   expect(mockCreateNewPersonality).toHaveBeenCalledWith({
     personalityName: "test",
     // ... other params
   });
   ```

## Adding New Mocks

When adding new reusable mocks:

1. Create a new file in `tests/mocks/` (e.g., `myModule.mock.ts`)
2. Export mock variables using `let` (so they can be reassigned in tests)
3. Provide an `init*Mocks()` function to reset mocks
4. Provide a `setup*ModuleMock()` function to setup the module mock
5. Document usage in this README
