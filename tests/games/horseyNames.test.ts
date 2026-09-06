import { describe, expect, it } from "bun:test";
import {
  DEFAULT_HORSEY_NAMES,
  labelFor,
  parseHorseyNames,
  serializeHorseyNames,
} from "../../modules/games/horsey/horseyNames";
import { HORSE_COUNT } from "../../modules/games/horsey/horseyUtilities";

describe("parseHorseyNames", () => {
  // Callers index this array by horse number, so anything short of a full
  // field means an undefined name appearing mid-race.
  it.each([
    ["unset", undefined],
    ["null", null],
    ["empty", ""],
    ["only separators", ",,,"],
    ["only whitespace", "   ,  , "],
    ["a partial field", "Bojack, Mr Ed"],
    ["an overfull field", "a,b,c,d,e,f,g,h"],
  ])("always returns one name per horse for %s", (_label, raw) => {
    const names = parseHorseyNames(raw);

    expect(names).toHaveLength(HORSE_COUNT);
    for (const name of names) expect(name.length).toBeGreaterThan(0);
  });

  it("uses the defaults when nothing is configured", () => {
    expect(parseHorseyNames()).toEqual(DEFAULT_HORSEY_NAMES);
  });

  it("keeps the configured names in order", () => {
    const names = parseHorseyNames("Alpha,Bravo,Charlie,Delta,Echo");

    expect(names).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
  });

  it("fills only the unnamed horses from the defaults", () => {
    const names = parseHorseyNames("Alpha, Bravo");

    expect(names.slice(0, 2)).toEqual(["Alpha", "Bravo"]);
    expect(names.slice(2)).toEqual(DEFAULT_HORSEY_NAMES.slice(2));
  });

  it("trims whitespace around names", () => {
    expect(parseHorseyNames("  Alpha  ,  Bravo  ")[0]).toBe("Alpha");
  });

  it("drops extras rather than growing the field", () => {
    expect(parseHorseyNames("a,b,c,d,e,f,g")).toHaveLength(HORSE_COUNT);
  });

  it("caps a name that would blow out the track", () => {
    const [first] = parseHorseyNames("x".repeat(500));

    expect(first.length).toBeLessThanOrEqual(32);
  });
});

describe("serializeHorseyNames", () => {
  it("normalises spacing so the stored value round-trips", () => {
    const stored = serializeHorseyNames("  Alpha ,Bravo  ,   Charlie ");

    expect(stored).toBe("Alpha, Bravo, Charlie");
    expect(parseHorseyNames(stored).slice(0, 3)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("stores nothing when given nothing, which resets to the defaults", () => {
    expect(serializeHorseyNames("")).toBe("");
    expect(serializeHorseyNames("  ,  ")).toBe("");
    expect(parseHorseyNames(serializeHorseyNames(""))).toEqual(
      DEFAULT_HORSEY_NAMES,
    );
  });

  it("never stores more names than there are horses", () => {
    const stored = serializeHorseyNames("a,b,c,d,e,f,g,h,i");

    expect(stored.split(", ")).toHaveLength(HORSE_COUNT);
  });

  it("truncates a name rather than letting it break the layout", () => {
    expect(serializeHorseyNames("y".repeat(80)).length).toBeLessThanOrEqual(32);
  });
});

describe("labelFor", () => {
  it("ties the name to the number so the two can't be confused", () => {
    expect(labelFor(["Alpha", "Bravo"], 2)).toBe("#2 Bravo");
  });

  // A stats row for a horse outside the current field shouldn't render
  // "#7 undefined" in the form guide.
  it("falls back when a horse has no name", () => {
    expect(labelFor(["Alpha"], 7)).toBe("#7 Horsey 7");
  });
});
