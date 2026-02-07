# Tests

This directory contains all test files for the project.

## Test Summary

**✅ 23 tests** across 1 file - **All passing!**

## Directory Structure

```
tests/
├── commands/          # Tests for Discord command handlers
│   └── create-personality.command.test.ts (23 tests)
├── mocks/             # Shared mock utilities
│   ├── chatHistory.mock.ts
│   ├── console.mock.ts
│   ├── personalities.mock.ts
│   ├── pocketbase.mock.ts
│   ├── index.ts
│   └── README.md      # Documentation for mock utilities
└── README.md          # This file
```

## Running Tests

Run all tests:
```bash
bun test
```

Run tests in watch mode:
```bash
bun test --watch
```

Run a specific test file:
```bash
bun test tests/commands/create-personality.command.test.ts
```

## Current Test Coverage

### create-personality.command.test.ts (23 tests) ✅

Comprehensive tests for the `/create-personality` Discord command.

**What's tested:**
- ✅ Successful personality creation (with/without activation & history clearing)
- ✅ Input validation (missing/empty/too-long names and prompts)
- ✅ Duplicate personality detection
- ✅ Error handling (database errors, activation errors, etc.)
- ✅ Guild context handling (DMs vs servers)
- ✅ Edge cases (null/undefined values, boolean handling)
- ✅ Response message correctness

**What these tests verify:**
- Input validation logic works correctly
- Data flows correctly to module functions
- Conditional logic (if statements) executes properly
- Error handling catches and reports errors appropriately
- Response messages match expected content

## Writing New Tests

### Test File Naming

- Command tests: `tests/commands/[command-name].command.test.ts`

### Using Shared Mocks

The `tests/mocks/` directory contains reusable mock implementations. See [mocks/README.md](./mocks/README.md) for documentation.

**Example:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { 
  setupPersonalityModuleMocks,
  initPersonalityMocks 
} from "../mocks/personalities.mock";
import { mockConsole, restoreConsole } from "../mocks/console.mock";

// Setup module mocks BEFORE importing
setupPersonalityModuleMocks();

const { execute } = await import("../../commands/my-command");

describe("My command", () => {
  beforeEach(() => {
    initPersonalityMocks(); // Reset mocks
    mockConsole(); // Suppress console
  });

  afterEach(() => {
    restoreConsole(); // Restore console
  });

  it("should work", async () => {
    // Your test
  });
});
```

### Best Practices

- ✅ Use descriptive test names
- ✅ Reset mocks in `beforeEach` for isolation
- ✅ Test success AND error paths
- ✅ Test edge cases and boundaries
- ✅ Use `mockConsole()` to suppress expected error logs
- ✅ Focus on behavior, not implementation details

## Future Test Plans

- [ ] Add tests for other commands (balance, blackjack, slap, etc.)
- [ ] Add integration tests with test database
- [ ] Add test coverage reporting
- [ ] Create more shared mock utilities
