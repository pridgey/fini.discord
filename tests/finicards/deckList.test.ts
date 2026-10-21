import { describe, expect, it } from "bun:test";
import { deckListMessage } from "../../modules/finicards/ui/deckList";
import type { V2DeckRecord } from "../../types/PocketbaseTablesV2";

const deck = (name: string, size = 20, active = false): V2DeckRecord => ({
  id: `id-${name}`,
  user_id: "user1",
  server_id: "guild1",
  identifier: "",
  name,
  cards: Array.from({ length: size }, (_, i) => `card${i}`),
  active,
});

const json = (decks: V2DeckRecord[]) =>
  JSON.stringify(deckListMessage(decks, "user1").components[0].toJSON());

/** Every component in the message, nested ones included - Discord caps it at 40. */
const countComponents = (node: unknown): number => {
  if (!node || typeof node !== "object") return 0;
  const { components, accessory } = node as {
    components?: unknown[];
    accessory?: unknown;
  };
  return (
    1 +
    (components ?? []).reduce<number>((sum, c) => sum + countComponents(c), 0) +
    (accessory ? countComponents(accessory) : 0)
  );
};

describe("the deck list", () => {
  it("marks the active deck and gives the others a Set active button", () => {
    const text = json([deck("Aggro"), deck("Main", 20, true)]);

    expect(text).toContain("⭐ **Main** — 20 cards · active");
    expect(text).toContain('"label":"Set active"');
    expect(text).toContain("v2_deck_active:id-Aggro:user1");
    // The active one's button is shown, but can't be pressed again.
    expect(text).toMatch(/"label":"Active"[^}]*"disabled":true/);
    expect(text).toContain("v2_deck_show:id-Main:user1");
    expect(text).toContain("Battles and dungeons bring **Main**");
  });

  it("says what an active deck is for when none is set", () => {
    expect(json([deck("Main")])).toContain(
      "Set a deck active and battles and dungeons bring it",
    );
  });

  it("still flags a deck too small to play", () => {
    expect(json([deck("Short", 12)])).toContain("too small to play");
  });

  it("stays within Discord's 40 components with ten decks", () => {
    for (const count of [9, 10]) {
      const decks = Array.from({ length: count }, (_, i) => deck(`D${i}`));
      const message = deckListMessage(decks, "user1");
      expect(
        countComponents(message.components[0].toJSON()),
      ).toBeLessThanOrEqual(40);
    }
    const ten = json(Array.from({ length: 10 }, (_, i) => deck(`D${i}`)));
    expect(ten).not.toContain("v2_deck_show");
    expect(ten).toContain("/finicard deck show");
  });
});
