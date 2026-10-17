import { describe, expect, it } from "bun:test";
import type { User } from "discord.js";
import {
  MAX_CARDS_PER_SIDE,
  offerText,
  parseCardIds,
  sideLines,
} from "../../modules/finicards/tradeFlow";
import type { OwnedCard } from "../../modules/finicards/types";
import type { V2CardDefinitionRecord } from "../../types/PocketbaseTablesV2";

const user = (id: string) =>
  ({ id, toString: () => `<@${id}>` }) as unknown as User;

const copy = (
  id: string,
  name: string,
  overrides: Partial<OwnedCard> = {},
): OwnedCard => ({
  id,
  user_id: "u",
  server_id: "s",
  identifier: "u-s",
  card: `def-${id}`,
  foil: false,
  keyword: "",
  legendary: "",
  serial: 0,
  acquired_from: "pack",
  definition: {
    id: `def-${id}`,
    card_name: name,
    series: "Test",
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
    population: 0,
    active: true,
  } as V2CardDefinitionRecord,
  ...overrides,
});

describe("trades", () => {
  it("read card ids however they're typed, each once", () => {
    expect(parseCardIds("abc123 def456")).toEqual(["abc123", "def456"]);
    expect(parseCardIds(" ABC123,def456 ,abc123 ")).toEqual([
      "abc123",
      "def456",
    ]);
    expect(parseCardIds("")).toEqual([]);
    expect(parseCardIds(null)).toEqual([]);
    expect(MAX_CARDS_PER_SIDE * 2).toBeLessThanOrEqual(10);
  });

  it("list what each side puts up, cards and coin, or nothing", () => {
    const goku = copy("abc123", "Goku", { foil: true });
    expect(sideLines({ user: user("a"), cards: [goku], fc: 50 })).toEqual([
      "• **Goku** (Full Art, foil) `abc123`",
      "• 🪙 **50 fc**",
    ]);
    expect(sideLines({ user: user("b"), cards: [], fc: 0 })).toEqual([
      "• _nothing_",
    ]);
  });

  it("show both sides, and who may answer", () => {
    const text = offerText(
      { user: user("a"), cards: [copy("abc123", "Goku")], fc: 0 },
      { user: user("b"), cards: [copy("def456", "Vegeta")], fc: 25 },
    );
    expect(text).toContain("<@a> ⇄ <@b>");
    expect(text).toContain("**<@a> gives:**\n• **Goku** (Full Art) `abc123`");
    expect(text).toContain(
      "**<@b> gives:**\n• **Vegeta** (Full Art) `def456`\n• 🪙 **25 fc**",
    );
    expect(text).toContain("<@b> can accept or decline");
  });

  it("leave their buttons to the offer's own collector", async () => {
    const { isCollectorButton } = await import("../../buttons/buttonHandler");
    for (const id of ["v2trade-accept", "v2trade-decline", "v2trade-cancel"]) {
      expect(isCollectorButton(id)).toBe(true);
    }
  });
});
