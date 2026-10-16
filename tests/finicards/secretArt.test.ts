import { describe, expect, it } from "bun:test";
import { buildCardSvg, limitedLabel } from "../../modules/finicards/cardArt/generateCardImage";
import { nextSerial, toBattleCard } from "../../modules/finicards/cardStore";
import { availableSecretArts, selectCard } from "../../modules/finicards/packs";
import type { BattleCard, OwnedCard } from "../../modules/finicards/types";
import type { V2CardDefinitionRecord } from "../../types/PocketbaseTablesV2";

/* A Secret Art is a full-art by every rule, found only by its own roll. Cards
   held to a handful of copies say which copy they are. */

const definition = (overrides: Partial<V2CardDefinitionRecord> = {}): V2CardDefinitionRecord => ({
  id: "def1",
  card_name: "Ren Kasugai",
  series: "Beacon",
  rarity: "full_art",
  power: 2,
  wit: 2,
  heart: 11,
  card_type: "heart",
  tags: [],
  keyword: "",
  cost: 3,
  set_piece: "",
  art_url: "",
  legacy_card: "",
  population: 1,
  active: true,
  ...overrides,
});

const card = (overrides: Partial<BattleCard> = {}): BattleCard => ({
  instanceId: "inst123456",
  definitionId: "def1",
  name: "Ren Kasugai",
  series: "Beacon",
  rarity: "full_art",
  type: "heart",
  stats: { power: 2, wit: 2, heart: 11 },
  keyword: "",
  foil: false,
  tags: [],
  cost: 3,
  ...overrides,
});

describe("secret art", () => {
  const plain = definition({ id: "plain" });
  const secret = definition({ id: "secret", secret_art: true, population: 3 });

  it("never comes out of the full-art slot", () => {
    for (let roll = 0; roll < 1; roll += 0.05) {
      expect(selectCard([plain, secret], new Map(), "full_art", () => roll)?.id).toBe("plain");
    }
    // With the only full-art claimed, the slot falls down the ladder rather
    // than reaching for the Secret Art.
    expect(selectCard([plain, secret], new Map([["plain", 1]]), "full_art")).toBeNull();
  });

  it("is on offer to its own roll until its copies are claimed", () => {
    expect(availableSecretArts([plain, secret], new Map()).map((row) => row.id)).toEqual(["secret"]);
    expect(availableSecretArts([plain, secret], new Map([["secret", 2]]))).toHaveLength(1);
    expect(availableSecretArts([plain, secret], new Map([["secret", 3]]))).toHaveLength(0);
  });

  it("prints SA where a full-art prints FA", async () => {
    const svg = await buildCardSvg(card({ secretArt: true, population: 3, serial: 2 }), { withoutArt: true });
    expect(svg).toContain(">SA</text>");
    expect(svg).not.toContain(">FA</text>");
  });

  it("carries the flag, the limit and the copy's number into a battle card", () => {
    const owned: OwnedCard = {
      id: "copy1",
      user_id: "u",
      server_id: "s",
      identifier: "u-s",
      card: "secret",
      foil: false,
      serial: 2,
      acquired_from: "pack",
      definition: secret,
    };
    expect(toBattleCard(owned)).toMatchObject({ secretArt: true, population: 3, serial: 2 });
  });
});

describe("numbered copies", () => {
  it("says which copy a card limited to a few is", () => {
    expect(limitedLabel(card({ population: 3, serial: 2 }))).toBe("2 OF 3");
    expect(limitedLabel(card({ population: 1, serial: 1 }))).toBe("1 OF 1");
    expect(limitedLabel(card({ population: 4, serial: 4 }))).toBe("4 OF 4");
  });

  it("says nothing on a card with room for five or more, or no limit", () => {
    expect(limitedLabel(card({ population: 5, serial: 1 }))).toBe("");
    expect(limitedLabel(card({ population: 20, serial: 3 }))).toBe("");
    expect(limitedLabel(card({ population: 0, serial: 1 }))).toBe("");
    expect(limitedLabel(card())).toBe("");
  });

  it("stands a preview in as the first copy", () => {
    expect(limitedLabel(card({ population: 3 }))).toBe("1 OF 3");
  });

  it("prints on every frame, and leaves no token behind when it does not apply", async () => {
    for (const [rarity, foil] of [["common", false], ["common", true], ["uncommon", false], ["uncommon", true], ["full_art", false]] as const) {
      const limited = await buildCardSvg(card({ rarity, foil, population: 3, serial: 3 }), { withoutArt: true });
      expect(limited).toContain(">3 OF 3</text>");
      const open = await buildCardSvg(card({ rarity, foil, population: 20 }), { withoutArt: true });
      expect(open).not.toContain("{limited}");
      expect(open).not.toContain(" OF ");
    }
  });

  it("gives a new copy the lowest number not in use", () => {
    expect(nextSerial([])).toBe(1);
    expect(nextSerial([1, 2])).toBe(3);
    // The second copy was sold back: the next one made takes its number.
    expect(nextSerial([1, 3])).toBe(2);
    // Copies from before numbering have none, and take up no number.
    expect(nextSerial([undefined, 0, 1])).toBe(2);
  });
});
