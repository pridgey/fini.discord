import { describe, expect, it } from "bun:test";
import { rollCopyKeyword, toBattleCard } from "../../modules/finicardsV2/cardStore";
import { findKeyword } from "../../modules/finicardsV2/keywords";
import type { OwnedCard } from "../../modules/finicardsV2/types";

/* A keyword belongs to a copy, rolled when the copy is made. The definition's
   own keyword column is a leftover and must never reach a battle. */

const owned = (overrides: Partial<OwnedCard> = {}): OwnedCard => ({
  id: "copy1",
  user_id: "u",
  server_id: "s",
  identifier: "u-s",
  card: "def1",
  foil: false,
  acquired_from: "pack",
  definition: {
    id: "def1",
    card_name: "Ren Kasugai",
    series: "Beacon",
    rarity: "common",
    power: 4,
    wit: 4,
    heart: 7,
    card_type: "heart",
    tags: [],
    keyword: "adapt",
    cost: 1,
    set_piece: "",
    art_url: "",
    legacy_card: "",
    population: 20,
    active: true,
  },
  ...overrides,
});

describe("copy keywords", () => {
  it("fights with the copy's keyword", () => {
    expect(toBattleCard(owned({ keyword: "vanguard" })).keyword).toBe("vanguard");
  });

  it("ignores a keyword left on the definition", () => {
    expect(toBattleCard(owned()).keyword).toBe("");
  });

  it("lets two copies of one card carry different keywords", () => {
    const first = toBattleCard(owned({ id: "a", keyword: "vanguard" }));
    const second = toBattleCard(owned({ id: "b", keyword: "guard" }));
    expect(first.definitionId).toBe(second.definitionId);
    expect(first.keyword).not.toBe(second.keyword);
  });

  it("rolls a real keyword, or none, from the dice it is given", () => {
    // The first roll picks the grade; 0 lands in the first band with any odds.
    const rolled = rollCopyKeyword("common", () => 0);
    expect(rolled === "" || findKeyword(rolled) !== null).toBe(true);

    // The top of the range falls past every grade for a full-art: no keyword.
    expect(rollCopyKeyword("full_art", () => 0.999999)).toBe("");
  });
});
