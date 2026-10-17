import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mockConsole, restoreConsole } from "../mocks/console.mock";
import PocketBase from "pocketbase";

/**
 * The shared page renderer, exercised through the `help_commands` query - the
 * one query function that needs no database, so only the context lookup has to
 * be mocked.
 *
 * This is the code path `next_page`, `prev_page` and the finicards v2 "back to
 * collection" button all now run.
 *
 * The row builder is injected rather than imported. `mock.module` is
 * process-global in Bun, and `tests/commands/jackpot.command.test.ts` stubs
 * `createPaginationRow` out for its own assertions - so whether this file sees
 * the real one depends on which test file loaded first. Injecting a spy both
 * removes that coupling and makes the forwarding assertions direct.
 */

type RowArgs = {
  userId: string;
  currentPage: number;
  totalPages: number;
  contextId: string;
  wrap?: boolean;
};

let storedContext: Record<string, unknown> | null = {
  id: "ctx1",
  user_id: "user1",
  query_id: "help_commands",
  query: "",
  sort: "",
  filter: "",
  current_page: 1,
  per_page: 1,
  wrap: true,
};

const mockUpdate = mock((_id: string, _row: unknown) => Promise.resolve({}));

/** Stands in for `createPaginationRow`, recording what it was handed. */
let rowArgs: RowArgs | null = null;
const buildRow = ((args: RowArgs) => {
  rowArgs = args;
  return { row: true };
}) as never;

mock.module("../../utilities/pocketbase", () => ({
  pb: {
    filter: PocketBase.prototype.filter,
    collection: () => ({
      getOne: async () => {
        if (!storedContext) throw new Error("not found");
        return storedContext;
      },
      update: mockUpdate,
      getList: async () => ({
        items: [],
        totalItems: 0,
        totalPages: 0,
        page: 1,
        perPage: 100,
      }),
      delete: async () => ({}),
    }),
  },
}));

const { renderPaginationPage } =
  await import("../../utilities/pagination/pagination");

describe("renderPaginationPage", () => {
  beforeEach(() => {
    rowArgs = null;
    mockUpdate.mockClear();
    storedContext = {
      id: "ctx1",
      user_id: "user1",
      query_id: "help_commands",
      query: "",
      sort: "",
      filter: "",
      current_page: 1,
      per_page: 1,
      wrap: true,
    };
  });

  it("renders the requested page with a pagination row appended", async () => {
    const page = await renderPaginationPage({
      contextId: "ctx1",
      page: 2,
      buildRow,
    });

    expect(page).not.toBeNull();
    // The query's own container, then the prev/indicator/next row.
    expect(page!.components.length).toBe(2);
    expect(page!.components.at(-1)).toEqual({ row: true } as never);
  });

  it("builds the row against the context it was given", async () => {
    await renderPaginationPage({ contextId: "ctx1", page: 2, buildRow });

    // Only the fields the renderer itself owns. `currentPage` comes back from
    // the query, and QueryHandler is another module a sibling suite stubs
    // process-wide - asserting it here would test that stub.
    expect(rowArgs!.contextId).toBe("ctx1");
    expect(rowArgs!.userId).toBe("user1");
  });

  it("always clears attachments so a stale image can't linger", async () => {
    // A page with an image followed by one without would otherwise keep the
    // old file pinned under the new content.
    const page = await renderPaginationPage({
      contextId: "ctx1",
      page: 1,
      buildRow,
    });

    expect(page!.attachments).toEqual([]);
    expect(page!.files).toEqual([]);
  });

  it("flags Components V2 when the query asks for it", async () => {
    const page = await renderPaginationPage({
      contextId: "ctx1",
      page: 1,
      buildRow,
    });

    expect(page!.flags).toBeDefined();
  });

  it("records the new page on the context", async () => {
    await renderPaginationPage({ contextId: "ctx1", page: 3, buildRow });

    expect(mockUpdate).toHaveBeenCalledWith("ctx1", { current_page: 3 });
  });

  it("forwards wrap, which prev_page used to drop", async () => {
    // The divergence this refactor removes: prev_page never passed `wrap` to
    // the row builder, so Previous stayed disabled on page 1 of a wrapping
    // context. Both buttons go through here now, so one assertion covers both.
    await renderPaginationPage({ contextId: "ctx1", page: 1, buildRow });

    expect(rowArgs!.wrap).toBe(true);
  });

  it("forwards a non-wrapping context too", async () => {
    storedContext = { ...storedContext!, wrap: false };

    await renderPaginationPage({ contextId: "ctx1", page: 1, buildRow });

    expect(rowArgs!.wrap).toBe(false);
  });

  it("prefers the context's page-count override to the query's count", async () => {
    // A query that can't know its own total (an in-memory one) relies on this.
    storedContext = { ...storedContext!, total_pages_override: 42 };

    await renderPaginationPage({ contextId: "ctx1", page: 1, buildRow });

    expect(rowArgs!.totalPages).toBe(42);
  });

  it("returns null for an expired context rather than throwing", async () => {
    storedContext = null;

    // The production code logs the lookup failure; that's the point of the
    // path, so silence it rather than letting it look like a test failure.
    mockConsole();
    try {
      expect(
        await renderPaginationPage({ contextId: "gone", page: 1, buildRow }),
      ).toBeNull();
    } finally {
      restoreConsole();
    }
  });
});
