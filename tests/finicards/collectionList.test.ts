import { describe, expect, test } from "bun:test";
import { deckNamesByCard } from "../../queries/queryFunctions/finicardCollection.query";
import type { V2DeckRecord } from "../../types/PocketbaseTablesV2";

const deck = (name: string, cards: string[]): V2DeckRecord => ({
  user_id: "u",
  server_id: "s",
  identifier: name.toLowerCase(),
  name,
  cards,
});

describe("collection list deck names", () => {
  test("a card lists every deck it is in", () => {
    const names = deckNamesByCard([deck("Alpha", ["a", "b"]), deck("Beta", ["b", "c"])]);
    expect(names.get("a")).toEqual(["Alpha"]);
    expect(names.get("b")).toEqual(["Alpha", "Beta"]);
    expect(names.get("c")).toEqual(["Beta"]);
    expect(names.get("d")).toBeUndefined();
  });

  test("a deck holding a card twice names it once", () => {
    expect(deckNamesByCard([deck("Alpha", ["a", "a"])]).get("a")).toEqual(["Alpha"]);
  });
});
