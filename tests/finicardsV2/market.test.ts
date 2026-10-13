import { describe, expect, it } from "bun:test";
import { buybackPrice, FINI_BUYBACK } from "../../modules/finicardsV2/market";

/* What Fini pays for a card depends on what the card is, not on its stats. */

describe("selling to Fini", () => {
  it("pays v1's prices for the three ordinary rarities", () => {
    expect(buybackPrice({ rarity: "common" })).toBe(2);
    expect(buybackPrice({ rarity: "uncommon" })).toBe(5);
    expect(buybackPrice({ rarity: "full_art" })).toBe(10);
    // Foil pays half again, rounded up.
    expect(buybackPrice({ rarity: "common", foil: true })).toBe(3);
    expect(buybackPrice({ rarity: "uncommon", foil: true })).toBe(8);
    expect(buybackPrice({ rarity: "full_art", foil: true })).toBe(15);
    expect(buybackPrice({ rarity: "full_art", secretArt: true, foil: true })).toBe(38);
    expect(buybackPrice({ rarity: "full_art", legendary: "storm", foil: true })).toBe(75);
  });

  it("pays more for a Secret Art, and most for a Legendary", () => {
    expect(buybackPrice({ rarity: "full_art", secretArt: true })).toBe(FINI_BUYBACK.secret_art);
    expect(buybackPrice({ rarity: "full_art", legendary: "storm" })).toBe(FINI_BUYBACK.legendary);
    expect(FINI_BUYBACK.legendary).toBeGreaterThan(FINI_BUYBACK.secret_art);
    expect(FINI_BUYBACK.secret_art).toBeGreaterThan(FINI_BUYBACK.full_art);
  });
});
