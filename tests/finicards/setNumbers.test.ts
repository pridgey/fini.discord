import { describe, expect, it } from "bun:test";
import { numberSets, setNumberLabel } from "../../modules/finicards/setNumbers";
import type { CardRarity } from "../../types/PocketbaseTablesV2";

const def = (
  id: string,
  card_name: string,
  rarity: CardRarity,
  set: number,
  secret_art = false,
) => ({ id, card_name, rarity, set, secret_art });

describe("finicards set numbers", () => {
  it("numbers a set by name, then by rarity", () => {
    const numbers = numberSets([
      def("zf", "Zuko", "full_art", 3),
      def("au", "Aang", "uncommon", 3),
      def("ac", "aang", "common", 3),
      def("af", "Aang", "full_art", 3),
    ]);

    expect(numbers.get("ac")).toEqual({ number: 1, setSize: 4 });
    expect(numbers.get("au")).toEqual({ number: 2, setSize: 4 });
    expect(numbers.get("af")).toEqual({ number: 3, setSize: 4 });
    expect(numbers.get("zf")).toEqual({ number: 4, setSize: 4 });
  });

  it("leaves Secret Arts out of the count and numbers them past it", () => {
    const numbers = numberSets([
      def("as", "Aang", "full_art", 3, true),
      def("zs", "Zuko", "full_art", 3, true),
      def("ac", "Aang", "common", 3),
      def("zc", "Zuko", "common", 3),
    ]);

    expect(numbers.get("zc")).toEqual({ number: 2, setSize: 2 });
    expect(numbers.get("as")).toEqual({ number: 3, setSize: 2 });
    expect(numbers.get("zs")).toEqual({ number: 4, setSize: 2 });
  });

  it("numbers each set on its own, and skips a card with no set", () => {
    const numbers = numberSets([
      def("a1", "Aang", "common", 1),
      def("b1", "Brock", "common", 1),
      def("a2", "Aang", "common", 2),
      def("x0", "Nobody", "common", 0),
    ]);

    expect(numbers.get("b1")).toEqual({ number: 2, setSize: 2 });
    expect(numbers.get("a2")).toEqual({ number: 1, setSize: 1 });
    expect(numbers.has("x0")).toBe(false);
  });

  it("keeps two cards of one name and rarity in a fixed order", () => {
    const cards = [
      def("b", "The Doctor", "uncommon", 2),
      def("a", "The Doctor", "uncommon", 2),
    ];
    expect(numberSets(cards).get("a")?.number).toBe(1);
    expect(numberSets([...cards].reverse()).get("a")?.number).toBe(1);
  });

  it("labels a numbered card, and nothing else", () => {
    expect(setNumberLabel(12, 217)).toBe("12/217");
    expect(setNumberLabel(0, 217)).toBe("");
    expect(setNumberLabel(undefined, undefined)).toBe("");
  });
});

describe("shuffled sets", () => {
  const names = [
    "Aang",
    "Brock",
    "Cyborg",
    "Dipper",
    "Eda",
    "Finn",
    "Gandalf",
    "Howl",
    "Ice King",
    "Joy",
  ];
  const rarities: CardRarity[] = ["common", "uncommon", "full_art"];
  const set4 = names.flatMap((name) =>
    rarities.map((rarity) => def(`${name}-${rarity}`, name, rarity, 4)),
  );
  const order = (cards: ReturnType<typeof def>[]) => {
    const numbers = numberSets(cards);
    return [...cards].sort(
      (a, b) => numbers.get(a.id)!.number - numbers.get(b.id)!.number,
    );
  };

  it("doesn't run alphabetically from set 4 on", () => {
    const characters = [...new Set(order(set4).map((card) => card.card_name))];
    expect(characters).not.toEqual(names);
    expect([...characters].sort()).toEqual(names);
  });

  it("keeps a character's cards together, common to full art", () => {
    const ordered = order(set4);
    for (let i = 0; i < ordered.length; i += 3) {
      const [c, u, fa] = ordered.slice(i, i + 3);
      expect([c.card_name, u.card_name]).toEqual([fa.card_name, fa.card_name]);
      expect([c.rarity, u.rarity, fa.rarity]).toEqual(rarities);
    }
  });

  it("gives the same numbers whatever order the cards come in", () => {
    const a = numberSets(set4);
    const b = numberSets([...set4].reverse());
    for (const card of set4) expect(b.get(card.id)).toEqual(a.get(card.id)!);
  });

  it("doesn't reorder the others when a character is added", () => {
    const before = order(set4).map((card) => card.id);
    const after = order([...set4, def("Kiki-common", "Kiki", "common", 4)])
      .map((card) => card.id)
      .filter((id) => id !== "Kiki-common");
    expect(after).toEqual(before);
  });

  it("numbers Secret Arts past the count, in the set's shuffled order", () => {
    const secrets = names.map((name) =>
      def(`${name}-sa`, name, "full_art", 4, true),
    );
    const ordered = order([...set4, ...secrets]);
    const counted = [
      ...new Set(ordered.slice(0, 30).map((card) => card.card_name)),
    ];
    expect(ordered.slice(30).map((card) => card.card_name)).toEqual(counted);
  });

  it("leaves sets 1 to 3 alphabetical", () => {
    const set3 = names.map((name) => def(`${name}-3`, name, "common", 3));
    expect(order(set3).map((card) => card.card_name)).toEqual(names);
  });
});
