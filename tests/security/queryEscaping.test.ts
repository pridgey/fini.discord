import { describe, expect, it, mock } from "bun:test";
import PocketBase from "pocketbase";

/*
 * Typed text used to be pasted into Pocketbase filters inside quotes, so a
 * name like `x" || name != "` closed the quote and matched every record -
 * /monitor-delete then deleted someone else's monitor. These run the real
 * lookups with a client that records the filter it was given, and check the
 * text stays inside its quotes.
 */

// Both quote styles: the old filters quoted with ", Pocketbase's own with '.
const EXPLOITS = ['x" || name != "', "x' || name != '"];
const real = new PocketBase("http://127.0.0.1:1");
const seen: string[] = [];
const recording = {
  filter: (raw: string, params: Record<string, unknown>) => real.filter(raw, params),
  collection: () => ({
    getFullList: async (options: { filter: string }) => {
      seen.push(options.filter);
      return [];
    },
    getFirstListItem: async (filter: string) => {
      seen.push(filter);
      throw new Error("not found");
    },
    getList: async (_page: number, _perPage: number, options: { filter: string }) => {
      seen.push(options.filter);
      return { items: [], page: 1, perPage: 10, totalItems: 0, totalPages: 0 };
    },
  }),
};
mock.module("../../utilities/pocketbase", () => ({ pb: recording }));

/**
 * The text sits whole inside one quoted string: Pocketbase quotes it with '
 * and escapes any ' within, so nothing after it is read as part of the query.
 */
const contained = (filter: string, typed: string) => {
  expect(filter).toContain(`'${typed.replace(/'/g, "\\'")}'`);
};

describe("typed text in database queries", () => {
  it("can't break out of a personality name", async () => {
    const { getPersonalityByName } = await import("../../modules/personalities/getPersonality");
    for (const typed of EXPLOITS) {
      seen.length = 0;
      await getPersonalityByName({ userId: "u1", personalityName: typed, serverId: "s1" }).catch(() => undefined);
      expect(seen.length).toBeGreaterThan(0);
      for (const filter of seen) contained(filter, typed);
    }
  });

  it("is escaped by Pocketbase the way these lookups rely on", () => {
    for (const typed of EXPLOITS) {
      const filter = real.filter("name = {:name}", { name: typed });
      contained(filter, typed);
      // One string, and no way out of it.
      expect(filter.match(/(?<!\\)'/g)).toHaveLength(2);
    }
  });
});
