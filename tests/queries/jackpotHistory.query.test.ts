import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockGetList = mock((_page?: number, _perPage?: number, _opts?: any) =>
  Promise.resolve({
    items: [] as any[],
    totalItems: 0,
    totalPages: 0,
    page: 1,
    perPage: 20,
  }),
);
const mockCollection = mock(() => ({ getList: mockGetList }));

mock.module("../../utilities/pocketbase", () => ({
  pb: { collection: mockCollection },
}));

const { jackpotHistoryQuery } =
  await import("../../queries/queryFunctions/JackpotHistory.query");

/** Builds `count` winner rows starting at `start` for the getList mock. */
const rows = (count: number, start = 0) =>
  Array.from({ length: count }, (_, i) => ({
    id: `rec${start + i}`,
    server_id: "guild123",
    user_id: `user${start + i}`,
    username: `winner${start + i}`,
    amount: 1000 + start + i,
    won_at: "2026-01-15T12:00:00.000Z",
    identifier: "x",
  }));

/** Pulls the rendered text out of the container the builder returns. */
const renderedText = (components: any[]) =>
  JSON.stringify(components[0].toJSON());

describe("jackpot history query", () => {
  beforeEach(() => {
    mockGetList.mockClear();
    mockCollection.mockClear();
  });

  describe("query", () => {
    it("should read the jackpot_winners collection newest-win-first", async () => {
      mockGetList.mockResolvedValueOnce({
        items: rows(2),
        totalItems: 2,
        totalPages: 1,
        page: 1,
        perPage: 20,
      });

      await jackpotHistoryQuery.query({
        page: 1,
        perPage: 20,
        filterOption: 'server_id = "guild123"',
      });

      expect(mockCollection).toHaveBeenCalledWith("jackpot_winners");
      expect(mockGetList).toHaveBeenCalledWith(1, 20, {
        sort: "-won_at",
        filter: 'server_id = "guild123"',
      });
    });

    it("should number the first page from 1", async () => {
      mockGetList.mockResolvedValueOnce({
        items: rows(3),
        totalItems: 3,
        totalPages: 1,
        page: 1,
        perPage: 20,
      });

      const result = await jackpotHistoryQuery.query({ page: 1, perPage: 20 });

      expect(result.items.map((i) => i.rank)).toEqual([1, 2, 3]);
    });

    it("should keep numbering running across pages", async () => {
      // Page 3 of a 20-per-page history starts at 41, not at 1. buildResults
      // never sees the page number, so this offset has to survive the query.
      mockGetList.mockResolvedValueOnce({
        items: rows(3, 40),
        totalItems: 49,
        totalPages: 3,
        page: 3,
        perPage: 20,
      });

      const result = await jackpotHistoryQuery.query({ page: 3, perPage: 20 });

      expect(result.items.map((i) => i.rank)).toEqual([41, 42, 43]);
      expect(result.currentPage).toBe(3);
      expect(result.totalPages).toBe(3);
    });

    it("should let an explicit sort override the default", async () => {
      mockGetList.mockResolvedValueOnce({
        items: rows(1),
        totalItems: 1,
        totalPages: 1,
        page: 1,
        perPage: 20,
      });

      await jackpotHistoryQuery.query({
        page: 1,
        perPage: 20,
        sortOption: "-amount",
      });

      expect(mockGetList.mock.calls[0][2].sort).toBe("-amount");
    });
  });

  describe("buildResults", () => {
    it("should show each winner's name, amount and date", async () => {
      const { components } = await jackpotHistoryQuery.buildResults({
        items: [
          {
            server_id: "g",
            user_id: "u1",
            username: "Pridgey",
            amount: 21704.5,
            won_at: "2026-09-13T15:52:42.801Z",
            identifier: "x",
            rank: 1,
          },
        ],
      });

      const text = renderedText(components!);
      expect(text).toContain("Pridgey");
      expect(text).toContain("21,704.5");
      expect(text).toContain("Sep 13, 2026");
      expect(text).toContain("Jackpot Winners");
    });

    it("should read PocketBase's space-separated date format", async () => {
      // PocketBase stores "2024-01-18 23:17:18.878Z", not an ISO "T" string.
      const { components } = await jackpotHistoryQuery.buildResults({
        items: [
          {
            server_id: "g",
            user_id: "u1",
            username: "Pridgey",
            amount: 5952,
            won_at: "2024-01-18 23:17:18.878Z",
            identifier: "x",
            rank: 1,
          },
        ],
      });

      const text = renderedText(components!);
      expect(text).toContain("Jan 18, 2024");
      expect(text).not.toContain("Invalid Date");
    });

    it("should fall back to the user id when no username was captured", async () => {
      const { components } = await jackpotHistoryQuery.buildResults({
        items: [
          {
            server_id: "g",
            user_id: "255016605191241729",
            username: "",
            amount: 100,
            won_at: "2026-09-13T15:52:42.801Z",
            identifier: "x",
            rank: 1,
          },
        ],
      });

      expect(renderedText(components!)).toContain("255016605191241729");
    });

    it("should render one line per winner", async () => {
      const { components } = await jackpotHistoryQuery.buildResults({
        items: rows(20).map((r, i) => ({ ...r, rank: i + 1 })),
      });

      const container = components![0].toJSON() as any;
      const content = container.components[0].content as string;

      // 20 winners plus the heading line.
      expect(content.split("\n")).toHaveLength(21);
      expect(content).toContain("`20.`");
    });

    it("should use components v2 so the container renders", async () => {
      const result = await jackpotHistoryQuery.buildResults({ items: rows(1) });

      expect(result.useComponentsV2).toBe(true);
    });
  });
});
