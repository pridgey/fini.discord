import { describe, expect, test } from "bun:test";
import { buildCollectionQuery } from "../../modules/finicards/collectionFilters";

describe("collection filters and sorts", () => {
  test("nothing asked for is the whole collection, newest first", () => {
    expect(buildCollectionQuery()).toEqual({ filter: "", sort: "-created,id", summary: "", order: "" });
    expect(buildCollectionQuery({ sort: null, type: null, foil: false, search: "  " }).filter).toBe("");
  });

  test("each choice narrows, and they combine", () => {
    const query = buildCollectionQuery({ type: "wit", set: 3, foil: true, keyword: true });
    expect(query.filter).toBe('card.card_type = "wit" && card.set = 3 && foil = true && keyword != ""');
    expect(query.summary).toBe("Wit · Set 3 · foil · with an ability");
  });

  test("Full Art means the plain ones; Secret Arts and Legendaries are their own", () => {
    expect(buildCollectionQuery({ tier: "full_art" }).filter).toContain('card.secret_art != true && legendary = ""');
    expect(buildCollectionQuery({ tier: "secret_art" }).filter).toContain("card.secret_art = true");
    expect(buildCollectionQuery({ tier: "legendary" }).filter).toBe('(legendary != "")');
    expect(buildCollectionQuery({ tier: "legendary" }).summary).toBe("Legendary");
  });

  test("a search looks in name and series, and cannot break out of its quotes", () => {
    const query = buildCollectionQuery({ search: ' x" || user_id != "' });
    expect(query.filter).toBe(
      '(card.card_name ~ "x\\" || user_id != \\"" || card.series ~ "x\\" || user_id != \\"")',
    );
    expect(buildCollectionQuery({ search: "a".repeat(200) }).summary).toHaveLength('matching ""'.length + 60);
  });

  test("every order ends on the copy id, so pages hold still", () => {
    for (const sort of ["newest", "set", "name", "rarest", "power", "wit", "heart"] as const) {
      const query = buildCollectionQuery({ sort });
      expect(query.sort.endsWith(",id")).toBe(true);
      expect(query.order === "").toBe(sort === "newest");
    }
    expect(buildCollectionQuery({ sort: "set" }).sort).toStartWith("card.set,card.number");
  });
});
