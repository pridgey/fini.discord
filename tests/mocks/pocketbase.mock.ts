import { mock } from "bun:test";

/**
 * Creates a mock PocketBase collection with common methods
 */
export const createMockPbCollection = () => {
  return {
    create: mock(() => Promise.resolve({ id: "mock-id" })),
    update: mock(() => Promise.resolve({ id: "mock-id" })),
    delete: mock(() => Promise.resolve(true)),
    getOne: mock(() => Promise.resolve({ id: "mock-id" })),
    getFirstListItem: mock(() => Promise.resolve({ id: "mock-id" })),
    getFullList: mock(() => Promise.resolve([])),
    getList: mock(() =>
      Promise.resolve({
        items: [],
        page: 1,
        perPage: 30,
        totalItems: 0,
        totalPages: 0,
      }),
    ),
  };
};

/**
 * Creates a mock PocketBase instance
 */
export const createMockPb = () => {
  const mockCollection = createMockPbCollection();

  return {
    collection: mock(() => mockCollection),
    authStore: {
      isValid: true,
      token: "mock-token",
      model: null,
      clear: mock(() => {}),
      save: mock(() => {}),
    },
  };
};

/**
 * Helper to setup PocketBase module mock
 * Use this in your test file to mock the pocketbase module
 *
 * @example
 * ```typescript
 * const mockPb = setupPocketbaseMock();
 *
 * // Later in test
 * expect(mockPb.collection).toHaveBeenCalledWith("personalities");
 * ```
 */
export const setupPocketbaseMock = () => {
  const mockPb = createMockPb();

  mock.module("../../utilities/pocketbase/pocketbase", () => ({
    pb: mockPb,
  }));

  return mockPb;
};
