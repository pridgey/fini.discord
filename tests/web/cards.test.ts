import { describe, expect, test } from "bun:test";
import {
  applyFilters,
  autoFill,
  compositionOf,
  deckProblem,
  filtersActive,
  limitedLabel,
  NO_FILTERS,
  rarityCode,
  setLabel,
  gapsApply,
  layoutCollection,
  setProgress,
  tierOf,
} from "../../web/src/lib/cards";
import { DEFAULT_META, type Card, type Definition, type Meta } from "../../web/src/lib/types";

const meta: Meta = {
  ...DEFAULT_META,
  keywords: { vanguard: { name: "Vanguard", grade: "Standard", description: "" } },
  legendary: { cosmos: { tier: 3, blurb: "" } },
};

let next = 0;
const card = (def: Partial<Definition> = {}, copy: Partial<Card> = {}): Card => {
  next += 1;
  return {
    id: `copy${next}`,
    collectionId: "y",
    face: "",
    animation: "",
    owner: "u1",
    server_id: "s1",
    definition: def.id ?? `def${next}`,
    foil: false,
    keyword: "",
    legendary: "",
    serial: 0,
    acquired_from: "pack",
    acquired: `2026-10-${String(next).padStart(2, "0")}`,
    ...copy,
    def: {
      id: `def${next}`,
      collectionId: "x",
      card_name: `Card ${next}`,
      series: "Series",
      rarity: "common",
      card_type: "power",
      power: 7,
      wit: 4,
      heart: 4,
      cost: 2,
      tags: [],
      set: 1,
      number: next,
      set_size: 100,
      population: 0,
      secret_art: false,
      flavour: "",
      artist: "",
      focus_x: 0.5,
      focus_y: 0.3,
      art: "",
      ...def,
    },
  };
};

describe("card facts", () => {
  test("tiers and codes follow the printed card", () => {
    expect(rarityCode(card(), meta)).toBe("C");
    expect(rarityCode(card({}, { foil: true }), meta)).toBe("FC");
    expect(rarityCode(card({ rarity: "uncommon" }, { foil: true }), meta)).toBe("FU");
    expect(rarityCode(card({ rarity: "full_art" }, { foil: true }), meta)).toBe("FA");
    expect(rarityCode(card({ rarity: "full_art", secret_art: true }), meta)).toBe("SA");
    const legendary = card({ rarity: "full_art" }, { legendary: "cosmos" });
    expect(tierOf(legendary)).toBe("legendary");
    expect(rarityCode(legendary, meta)).toBe("L3");
  });

  test("set and limited labels", () => {
    expect(setLabel(card({ set: 3, number: 12, set_size: 240 }))).toBe("S3 12/240");
    expect(setLabel(card({ set: 0 }))).toBe("");
    expect(limitedLabel(card({ population: 3 }, { serial: 2 }))).toBe("2 of 3");
    expect(limitedLabel(card({ population: 50 }, { serial: 2 }))).toBe("");
    expect(limitedLabel(card({ population: 50 }, { legendary: "cosmos" }))).toBe("1 of 1");
  });
});

describe("filtering", () => {
  const cards = [
    card({ card_name: "Aang", card_type: "wit", wit: 9, power: 3, heart: 3, series: "Avatar" }),
    card({ card_name: "Broly", rarity: "full_art", power: 12, wit: 1, heart: 2 }, { foil: true }),
    card({ card_name: "Chopper", card_type: "heart", heart: 8, power: 3, wit: 4, set: 2 }, { keyword: "vanguard" }),
  ];
  const names = (filters: Partial<typeof NO_FILTERS>) =>
    applyFilters(cards, { ...NO_FILTERS, ...filters }, meta).map((entry) => entry.def.card_name);

  test("no filters shows everything, newest first", () => {
    expect(names({})).toEqual(["Chopper", "Broly", "Aang"]);
    expect(filtersActive(NO_FILTERS)).toBe(false);
  });

  test("search reaches name, series and keyword", () => {
    expect(names({ search: "aan" })).toEqual(["Aang"]);
    expect(names({ search: "AVATAR" })).toEqual(["Aang"]);
    expect(names({ search: "vanguard" })).toEqual(["Chopper"]);
  });

  test("duplicates keeps every copy of a card held more than once, foils and all", () => {
    const goku = { id: "goku", card_name: "Goku" };
    const held = [
      card(goku),
      card(goku, { foil: true }),
      card({ id: "vegeta", card_name: "Vegeta" }),
    ];
    const shown = applyFilters(held, { ...NO_FILTERS, duplicates: true }, meta);
    expect(shown.map((entry) => entry.def.card_name)).toEqual(["Goku", "Goku"]);
    expect(filtersActive({ ...NO_FILTERS, duplicates: true })).toBe(true);
    // Counted before anything else narrows the view: the foil Goku is still a duplicate on its own.
    expect(applyFilters(held, { ...NO_FILTERS, duplicates: true, foil: true }, meta)).toHaveLength(1);
  });

  test("chips narrow, and combine", () => {
    expect(names({ types: ["wit", "heart"] })).toEqual(["Chopper", "Aang"]);
    expect(names({ tiers: ["full_art"] })).toEqual(["Broly"]);
    expect(names({ foil: true })).toEqual(["Broly"]);
    expect(names({ keyword: true })).toEqual(["Chopper"]);
    expect(names({ set: 2 })).toEqual(["Chopper"]);
    expect(names({ types: ["wit"], foil: true })).toEqual([]);
  });

  test("sorting", () => {
    expect(names({ sort: "name" })).toEqual(["Aang", "Broly", "Chopper"]);
    expect(names({ sort: "strongest" })).toEqual(["Broly", "Aang", "Chopper"]);
    expect(names({ sort: "heart" })).toEqual(["Chopper", "Aang", "Broly"]);
    expect(names({ sort: "rarity" })[0]).toBe("Broly");
  });

  test("the input is not reordered", () => {
    const before = cards.map((entry) => entry.id);
    applyFilters(cards, { ...NO_FILTERS, sort: "name" }, meta);
    expect(cards.map((entry) => entry.id)).toEqual(before);
  });
});

describe("collection summaries", () => {
  test("set progress counts distinct cards, and Secret Arts apart", () => {
    const shared = { id: "same", set: 1, set_size: 121 };
    const progress = setProgress([
      card(shared),
      card(shared),
      card({ set: 1, set_size: 121 }),
      card({ set: 1, set_size: 121, secret_art: true }),
      card({ set: 3, set_size: 240 }),
      card({ set: 0 }),
    ]);
    expect(progress).toEqual([
      { set: 1, owned: 2, size: 121, secrets: 1 },
      { set: 3, owned: 1, size: 240, secrets: 0 },
    ]);
  });

  test("composition counts by type", () => {
    expect(compositionOf([card(), card({ card_type: "wit" }), card()])).toEqual({ power: 2, wit: 1, heart: 0 });
  });
});

describe("deck building", () => {
  const { limits } = DEFAULT_META;

  test("what stops a deck being saved", () => {
    expect(deckProblem("", 20, limits, [])).toContain("name");
    expect(deckProblem("x".repeat(33), 20, limits, [])).toContain("32");
    expect(deckProblem("Mine", 20, limits, ["mine "])).toContain("already");
    expect(deckProblem("Mine", 17, limits, [])).toBe("Add 3 more to reach 20.");
    expect(deckProblem("Mine", 22, limits, [])).toBe("Remove 2 to get down to 20.");
    expect(deckProblem("Mine", 20, limits, ["Other"])).toBeNull();
  });

  test("auto-fill adds the strongest cards not already chosen", () => {
    const pool = [
      card({ power: 5 }, { id: "weak" }),
      card({ power: 9 }, { id: "strong" }),
      card({ power: 7 }, { id: "mid" }),
      card({ power: 12 }, { id: "chosen" }),
    ];
    expect(autoFill(["chosen"], pool, 3)).toEqual(["chosen", "strong", "mid"]);
    expect(autoFill(["chosen"], pool, 1)).toEqual(["chosen"]);
    expect(autoFill([], pool, 10)).toHaveLength(4);
  });
});

describe("collection layout", () => {
  const two = { id: "two", set: 1, number: 2, set_size: 4 };
  const cards = [
    card(two, { id: "plain" }),
    card(two, { id: "shiny", foil: true }),
    card({ set: 1, number: 4, set_size: 4, card_type: "wit" }, { id: "four" }),
    card({ set: 1, number: 6, set_size: 4, secret_art: true, rarity: "full_art" }, { id: "secret" }),
    card({ set: 2, number: 1, set_size: 3 }, { id: "other" }),
    card({ set: 0, number: 0 }, { id: "loose" }),
  ];
  const bySet = { ...NO_FILTERS, sort: "set" as const };
  const shape = (filters: typeof NO_FILTERS, options: { gaps: boolean; piles: boolean }) =>
    layoutCollection(cards, filters, meta, options).map((section) => [
      section.set,
      section.tiles.map((tile) =>
        tile.kind === "gap" ? `gap${tile.number}` : tile.cards.map((entry) => entry.id).join("+"),
      ),
    ]);

  test("a binder: sets in order, blanks for what is missing, copies piled", () => {
    expect(shape(bySet, { gaps: true, piles: true })).toEqual([
      // The best copy tops its pile. The Secret Art held sits past the end;
      // the one not held (5) leaves no blank.
      [1, ["gap1", "shiny+plain", "gap3", "four", "secret"]],
      [2, ["other", "gap2", "gap3"]],
      [0, ["loose"]],
    ]);
  });

  test("blanks and piles switch off separately", () => {
    expect(shape(bySet, { gaps: false, piles: true })[0]).toEqual([1, ["shiny+plain", "four", "secret"]]);
    expect(shape(bySet, { gaps: true, piles: false })[0][1]).toEqual([
      "gap1",
      "plain",
      "shiny",
      "gap3",
      "four",
      "secret",
    ]);
  });

  test("section headings carry the set's progress", () => {
    const [first] = layoutCollection(cards, bySet, meta, { gaps: true, piles: true });
    expect([first.owned, first.size]).toEqual([2, 4]);
  });

  test("a filter that hides cards turns the blanks off", () => {
    const wit = { ...bySet, types: ["wit" as const] };
    expect(gapsApply(wit)).toBe(false);
    expect(shape(wit, { gaps: true, piles: true })).toEqual([[1, ["four"]]]);
    // Choosing a set is not such a filter.
    expect(gapsApply({ ...bySet, set: 2 })).toBe(true);
    expect(shape({ ...bySet, set: 2 }, { gaps: true, piles: true })).toEqual([[2, ["other", "gap2", "gap3"]]]);
  });

  test("any other order is one run, still piled", () => {
    expect(gapsApply({ ...NO_FILTERS, sort: "name" })).toBe(false);
    const run = shape({ ...NO_FILTERS, sort: "strongest" }, { gaps: true, piles: true });
    expect(run).toHaveLength(1);
    expect(run[0][0]).toBeNull();
    expect(run[0][1]).toContain("shiny+plain");
    expect(layoutCollection([], bySet, meta, { gaps: true, piles: true })).toEqual([]);
  });
});
