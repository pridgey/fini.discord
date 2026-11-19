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

describe("dungeon items in the market", () => {
  const row = (item: string, active = false, id = item) =>
    ({ id, user_id: "u", server_id: "s", item, kind: "piece", active }) as const;

  it("list a side's items with its cards and coin", () => {
    expect(
      sideLines({
        user: user("a"),
        cards: [],
        items: [{ ...row("dragon_ball_4") }],
        fc: 10,
      }),
    ).toEqual(["• 🟠 **4-Star Dragon Ball**", "• 🪙 **10 fc**"]);
  });

  it("find an item by key, name, or a short name only it has", async () => {
    const { findItem } = await import("../../modules/finicards/itemMarket");
    expect(findItem("dragon_ball_4")?.key).toBe("dragon_ball_4");
    expect(findItem("  4-star DRAGON ball ")?.key).toBe("dragon_ball_4");
    expect(findItem("4★")?.key).toBe("dragon_ball_4");
    expect(findItem("Head")?.key).toBe("exodia_head");
    expect(findItem("nothing")).toBeUndefined();
  });

  it("pick a row for each name, a switched-on boon last, none twice", async () => {
    const { pickRows } = await import("../../modules/finicards/itemMarket");
    const rows = [
      { ...row("boon_lucky", true, "on"), kind: "pack_boon" as const },
      { ...row("boon_lucky", false, "off"), kind: "pack_boon" as const },
    ];
    const one = pickRows(rows, ["Four-Leaf Clover"]);
    expect(one.rows.map((r) => r.id)).toEqual(["off"]);
    const three = pickRows(rows, [
      "Four-Leaf Clover",
      "Four-Leaf Clover",
      "Four-Leaf Clover",
    ]);
    expect(three.rows.map((r) => r.id)).toEqual(["off", "on"]);
    expect(three.missing).toEqual(["Four-Leaf Clover"]);
  });

  it("suggest items from a satchel, completing the last of a list", async () => {
    const { itemSuggestions } = await import(
      "../../modules/finicards/itemMarket"
    );
    const rows = [row("dragon_ball_4"), row("dragon_ball_5"), row("exodia_head")];
    expect(itemSuggestions(rows, "dragon").map((s) => s.value)).toEqual([
      "4-Star Dragon Ball",
      "5-Star Dragon Ball",
    ]);
    // In a list, what's already named stays, and isn't offered again.
    const listed = itemSuggestions(rows, "4-Star Dragon Ball, ", true);
    expect(listed.map((s) => s.value)).toEqual([
      "4-Star Dragon Ball, 5-Star Dragon Ball",
      "4-Star Dragon Ball, Exodia the Forbidden One",
    ]);
  });

  it("pay more for scarcer pieces than boons of the same tier", async () => {
    const { itemBuybackPrice } = await import(
      "../../modules/finicards/itemMarket"
    );
    const { itemByKey } = await import("../../modules/finicards/items");
    expect(itemBuybackPrice(itemByKey("exodia_head")!)).toBe(40);
    expect(itemBuybackPrice(itemByKey("boon_grindstone")!)).toBe(20);
    expect(itemBuybackPrice(itemByKey("dragon_ball_1")!)).toBe(10);
  });
});

describe("card suggestions", () => {
  const copies = [
    copy("aaa111aaa111aaa", "Goku", { keyword: "edge", foil: true }),
    copy("bbb222bbb222bbb", "Goku"),
    copy("ccc333ccc333ccc", "Vegeta", {
      definition: { ...copy("x", "Vegeta").definition, rarity: "common" },
    }),
    copy("go0444ddd444ddd", "Bulma", {
      definition: { ...copy("x", "Bulma").definition, rarity: "common" },
    }),
  ];

  it("say what sets each copy apart, and fill in only its id", async () => {
    const { cardSuggestions, copyLabel } = await import(
      "../../modules/finicards/cardSuggestions"
    );
    expect(copyLabel(copies[0])).toBe(
      "Goku · Full Art · Edge · foil · aaa111aaa111aaa",
    );
    const goku = cardSuggestions(copies, "goku");
    expect(goku.map((s) => s.value).sort()).toEqual([
      "aaa111aaa111aaa",
      "bbb222bbb222bbb",
    ]);
  });

  it("match an id from its start, not letters in its middle", async () => {
    const { cardSuggestions } = await import(
      "../../modules/finicards/cardSuggestions"
    );
    // "go" is the start of Bulma's id, and in Goku's name.
    expect(cardSuggestions(copies, "go").map((s) => s.value).sort()).toEqual([
      "aaa111aaa111aaa",
      "bbb222bbb222bbb",
      "go0444ddd444ddd",
    ]);
    expect(cardSuggestions(copies, "222")).toEqual([]);
  });

  it("keep the ids already in a list, and don't offer them again", async () => {
    const { cardSuggestions } = await import(
      "../../modules/finicards/cardSuggestions"
    );
    const next = cardSuggestions(copies, "aaa111aaa111aaa goku", true);
    expect(next).toEqual([
      {
        name: "aaa111aaa111aaa + Goku · Full Art · bbb222bbb222bbb",
        value: "aaa111aaa111aaa bbb222bbb222bbb",
      },
    ]);
  });
});

describe("what a trade or sale warns about", () => {
  it("names a favourite card and a switched-on boon, on either side", async () => {
    const { tradeWarnings, offerText } = await import(
      "../../modules/finicards/tradeFlow"
    );
    const from = {
      user: user("a"),
      cards: [copy("abc123", "Goku", { favorite: true })],
      fc: 0,
    };
    const to = {
      user: user("b"),
      cards: [],
      items: [
        {
          id: "r1",
          user_id: "b",
          server_id: "s",
          item: "boon_lucky",
          kind: "pack_boon" as const,
          active: true,
        },
      ],
      fc: 0,
    };
    expect(tradeWarnings([from, to])).toEqual([
      "⚠️ **Goku** `abc123` is one of <@a>'s favourites.",
      "⚠️ <@b>'s **Four-Leaf Clover** is switched on. Trading it switches it off.",
    ]);
    const text = offerText(from, to);
    expect(text).toContain("`abc123` ⭐");
    expect(text).toContain("(switched on)");
    // Nothing to warn about, no warnings.
    expect(
      tradeWarnings([{ user: user("a"), cards: [copy("x1", "Vegeta")], fc: 0 }]),
    ).toEqual([]);
  });

  it("says when a piece is named more times than it's held", async () => {
    const { missingItems } = await import("../../modules/finicards/tradeFlow");
    const rows = [
      {
        id: "p",
        user_id: "a",
        server_id: "s",
        item: "dragon_ball_4",
        kind: "piece" as const,
      },
    ];
    expect(missingItems(["4★"], rows, "You", "have")).toEqual([
      "You only have 1 **4-Star Dragon Ball**, and it's named more times than that.",
    ]);
    expect(missingItems(["Head"], [], "<@b>", "has")).toEqual([
      "<@b> doesn't have **Exodia the Forbidden One**.",
    ]);
  });
});

describe("who can't be traded or sold to", () => {
  const interaction = (
    sub: "trade" | "sell",
    target: { id: string; bot?: boolean },
  ) => {
    const replies: string[] = [];
    return {
      replies,
      user: { id: "me", username: "me" },
      client: { user: { id: "fini" } },
      options: {
        getUser: () => ({ ...target, bot: !!target.bot, username: "x" }),
        getString: (name: string) =>
          sub === "sell" && name === "card" ? "abc123" : null,
        getInteger: () => null,
      },
      editReply: async (reply: string) => void replies.push(reply),
    };
  };

  it("refuses a trade with yourself or a bot", async () => {
    const { runTrade } = await import("../../modules/finicards/tradeFlow");
    for (const target of [{ id: "me" }, { id: "robot", bot: true }]) {
      const fake = interaction("trade", target);
      await runTrade(fake as never, { serverId: "s", serverName: "S" });
      expect(fake.replies).toEqual(["Pick another player to trade with."]);
    }
  });

  it("refuses a sale to yourself or a bot that isn't Fini", async () => {
    const { runSell } = await import("../../modules/finicards/sellFlow");
    for (const target of [{ id: "me" }, { id: "robot", bot: true }]) {
      const fake = interaction("sell", target);
      await runSell(fake as never, { serverId: "s", serverName: "S" });
      expect(fake.replies[0]).toContain("Pick another player to sell to");
    }
  });
});
