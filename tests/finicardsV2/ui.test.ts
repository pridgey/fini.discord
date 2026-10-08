import { beforeAll, describe, expect, it } from "bun:test";
import { MessageFlags } from "discord.js";
import { resolveMatch } from "../../modules/finicardsV2/battleEngine";
import { BATTLE_BOARD_FILE } from "../../modules/finicardsV2/cardArt";
import {
  MECHANIC_HINT,
  SIDE_ACCENT,
  buildBreakdown,
  buildLockedInMessage,
  buildResultMessage,
  buildRevealMessage,
  cardChip,
  compositionOf,
  explainMultiplier,
  keywordLegend,
  keywordReport,
} from "../../modules/finicardsV2/ui";
import type { BattleCard } from "../../modules/finicardsV2/types";
import type { CardType } from "../../types/PocketbaseTablesV2";

const card = (
  name: string,
  type: CardType,
  power: number,
  wit: number,
  heart: number,
  options: { rarity?: any; keyword?: string } = {},
): BattleCard => ({
  instanceId: `inst-${name}`,
  definitionId: `def-${name}`,
  name,
  series: "Test",
  rarity: options.rarity ?? "common",
  type,
  stats: { power, wit, heart },
  keyword: options.keyword ?? "",
  foil: false,
  tags: ["a", "b"],
  cost: 2,
});

/** Component type ids from the Discord components spec. */
const TEXT = 10;
const GALLERY = 12;
const SEPARATOR = 14;
const ACTION_ROW = 1;

const textOf = (json: any): string =>
  json.components
    .filter((component: any) => component.type === TEXT)
    .map((component: any) => component.content)
    .join("\n");

const countOf = (json: any, type: number): number =>
  json.components.filter((component: any) => component.type === type).length;

const hand = (prefix: string) => [
  card(`${prefix}1`, "power", 9, 3, 3),
  card(`${prefix}2`, "wit", 3, 9, 3),
  card(`${prefix}3`, "heart", 3, 3, 9),
  card(`${prefix}4`, "power", 7, 5, 3),
  card(`${prefix}5`, "wit", 4, 8, 3),
];

describe("finicards v2 message UI", () => {
  describe("theme", () => {
    it("summarises a hand's shape without implying order", () => {
      expect(compositionOf(hand("a"))).toBe("🔴🔴🔵🔵🟢");
    });

    it("keeps the card name in a chip, so a counter can be identified", () => {
      expect(cardChip(card("Vegeta", "power", 10, 3, 2))).toContain("Vegeta");
      expect(cardChip(card("Vegeta", "power", 10, 3, 2))).toContain("10");
    });

    it("leads a chip with the type stat, padded so a hand lines up", () => {
      expect(cardChip(card("Vegeta", "power", 10, 3, 2))).toContain("`10` Vegeta");
      expect(cardChip(card("Krillin", "power", 6, 3, 2))).toContain("` 6` Krillin");
    });

    it("states the type wheel in the mechanic hint", () => {
      expect(MECHANIC_HINT).toContain("Power");
      expect(MECHANIC_HINT).toContain("Wit");
      expect(MECHANIC_HINT).toContain("Heart");
      expect(MECHANIC_HINT).toContain("×1.5");
    });

    it("explains an advantage by naming both types and the beneficiary", () => {
      const explained = explainMultiplier("heart", "power", 1.5, "Fen");
      expect(explained).toContain("Heart");
      expect(explained).toContain("Power");
      expect(explained).toContain("beats");
      expect(explained).toContain("Fen");
      expect(explained).toContain("1.5");
    });

    it("explains a mirror and a disadvantage differently", () => {
      expect(explainMultiplier("wit", "wit", 1, "Fen")).toContain("mirror");
      expect(explainMultiplier("power", "heart", 1, "Fen")).toContain("loses to");
    });
  });

  describe("reveal", () => {
    it("gives each hand its own block so ownership is unambiguous", async () => {
      const message = await buildRevealMessage({
        battleId: "b1",
        wager: 60,
        challenger: { side: "challenger", name: "Fen", userId: "1", cards: hand("a") },
        defender: { side: "defender", name: "Rho", userId: "2", cards: hand("b") },
      });

      // Header plus one container per player.
      expect(message.components).toHaveLength(3);

      const challengerBlock = message.components[1].toJSON() as any;
      const defenderBlock = message.components[2].toJSON() as any;

      expect(challengerBlock.accent_color).toBe(SIDE_ACCENT.challenger);
      expect(defenderBlock.accent_color).toBe(SIDE_ACCENT.defender);
      expect(challengerBlock.accent_color).not.toBe(defenderBlock.accent_color);
      expect(textOf(challengerBlock)).toContain("Fen's hand");
      expect(textOf(defenderBlock)).toContain("Rho's hand");
    });

    it("sends one wide strip per hand, not one image per card", async () => {
      /* A lone gallery item gets the full message width; five portrait cards
         each get a fifth of it and become unreadable. */
      const message = await buildRevealMessage({
        battleId: "b1",
        wager: 0,
        challenger: { side: "challenger", name: "Fen", userId: "1", cards: hand("a") },
        defender: { side: "defender", name: "Rho", userId: "2", cards: hand("b") },
      });

      const challengerBlock = message.components[1].toJSON() as any;
      expect(countOf(challengerBlock, GALLERY)).toBe(1);

      const gallery = challengerBlock.components.find(
        (component: any) => component.type === GALLERY,
      );
      expect(gallery.items).toHaveLength(1);
      expect(message.files).toHaveLength(2);
    });

    it("names each hand's image after its owner", async () => {
      const message = await buildRevealMessage({
        battleId: "b1",
        wager: 0,
        challenger: { side: "challenger", name: "Fen", userId: "1", cards: hand("a") },
        defender: { side: "defender", name: "Rho", userId: "2", cards: hand("b") },
      });

      const names = message.files.map((file: any) => file.name);
      expect(names.some((name: string) => name.includes("fen"))).toBe(true);
      expect(names.some((name: string) => name.includes("rho"))).toBe(true);
    });

    it("teaches the mechanic and offers the lineup button once", async () => {
      const message = await buildRevealMessage({
        battleId: "b1",
        wager: 0,
        challenger: { side: "challenger", name: "Fen", userId: "1", cards: hand("a") },
        defender: { side: "defender", name: "Rho", userId: "2", cards: hand("b") },
      });

      const header = message.components[0].toJSON() as any;
      expect(textOf(header)).toContain("×1.5");
      expect(countOf(header, ACTION_ROW)).toBe(1);
      expect(message.flags).toEqual([MessageFlags.IsComponentsV2]);
    });

    it("mentions both players so they get notified", async () => {
      const message = await buildRevealMessage({
        battleId: "b1",
        wager: 0,
        challenger: { side: "challenger", name: "Fen", userId: "111", cards: hand("a") },
        defender: { side: "defender", name: "Rho", userId: "222", cards: hand("b") },
      });

      const header = textOf(message.components[0].toJSON());
      expect(header).toContain("<@111>");
      expect(header).toContain("<@222>");
    });
  });

  describe("result", () => {
    const result = resolveMatch({
      challengerLineup: [
        card("Knight", "heart", 4, 4, 7),
        card("Trickster", "wit", 3, 9, 3),
        card("Brawler", "power", 6, 5, 4),
      ],
      defenderLineup: [
        card("Storm Caller", "power", 9, 3, 3),
        card("Scholar", "wit", 5, 5, 5),
        card("Heir", "heart", 1, 2, 12, { rarity: "full_art" }),
      ],
    });

    let message: Awaited<ReturnType<typeof buildResultMessage>>;
    let json: any;
    let text: string;

    beforeAll(async () => {
      message = await buildResultMessage({
        battleId: "b1",
        result,
        names: { challenger: "Fen", defender: "Rho" },
        userIds: { challenger: "111", defender: "222" },
        split: { pot: 120, jackpotCut: 12, payout: 108 },
      });
      json = message.components[0].toJSON();
      text = textOf(json);
    });

    it("leads with the winner and the scoreline", () => {
      expect(text).toContain("Fen wins 2 – 1");
    });

    it("shows the rounds as one battle board image", () => {
      expect(message.files).toHaveLength(1);
      expect(message.files[0].name).toBe(BATTLE_BOARD_FILE);
      const gallery = json.components.find((c: any) => c.type === GALLERY);
      expect(gallery.items[0].media.url).toBe(`attachment://${BATTLE_BOARD_FILE}`);
    });

    it("leaves the per-round text to the board and the breakdown", () => {
      // The text rounds are only a fallback; with the board they'd say it twice.
      expect(text).not.toContain("`R1`");
      expect(text).not.toContain("7×1.5=10");
    });

    it("offers the full working behind a button rather than inline", () => {
      expect(countOf(json, ACTION_ROW)).toBe(1);
      const row = json.components.find((c: any) => c.type === ACTION_ROW);
      expect(row.components[0].custom_id).toContain("v2_breakdown");
    });

    it("reports the pot and the rake", () => {
      expect(text).toContain("120 fc");
      expect(text).toContain("108 to Fen");
      expect(text).toContain("12 raked");
    });

    it("uses the winner's colour", () => {
      expect(json.accent_color).toBe(SIDE_ACCENT.challenger);
    });

    it("calls out a damage-decided match explicitly", async () => {
      const level = resolveMatch({
        challengerLineup: [card("A", "power", 7, 5, 3), card("B", "wit", 3, 7, 5)],
        defenderLineup: [card("C", "wit", 5, 7, 3), card("D", "power", 7, 5, 3)],
      });
      const built = await buildResultMessage({
        result: level,
        names: { challenger: "Fen", defender: "Rho" },
        userIds: { challenger: "1", defender: "2" },
      });
      if (level.decidedBy === "damage") {
        expect(textOf(built.components[0].toJSON())).toContain(
          "Decided on total damage",
        );
      }
    });

    it("renders a draw without claiming a winner", async () => {
      const mirror = () => [card("Mirror", "power", 7, 5, 3)];
      const drawn = resolveMatch({
        challengerLineup: mirror(),
        defenderLineup: mirror(),
      });
      const built = await buildResultMessage({
        result: drawn,
        names: { challenger: "Fen", defender: "Rho" },
        userIds: { challenger: "1", defender: "2" },
      });
      const headline = (built.components[0].toJSON() as any).components[0].content;
      expect(headline).toContain("Draw");
      expect(headline).not.toContain("wins");
    });
  });

  describe("full breakdown", () => {
    const result = resolveMatch({
      challengerLineup: [card("Knight", "heart", 4, 4, 7)],
      defenderLineup: [card("Storm Caller", "power", 9, 3, 3)],
    });
    const breakdown = buildBreakdown(result, {
      challenger: "Fen",
      defender: "Rho",
    });

    it("spells out both attacks in full sentences", () => {
      expect(breakdown).toContain("Fen attacks with");
      expect(breakdown).toContain("Rho attacks with");
    });

    it("names the defending card and the stat that absorbed the hit", () => {
      expect(breakdown).toContain("Storm Caller's");
      expect(breakdown).toContain("Heart");
    });

    it("states the round winner and the margin", () => {
      expect(breakdown).toMatch(/wins the round by \d/);
    });
  });

  describe("locked in", () => {
    it("shows the committed order back, in slot order", () => {
      const chosen = [
        card("First", "power", 9, 3, 3),
        card("Second", "wit", 3, 9, 3),
        card("Third", "heart", 3, 3, 9),
      ];
      const built = buildLockedInMessage(chosen, "Rho");
      const text = textOf(built.components[0].toJSON());

      expect(text.indexOf("First")).toBeLessThan(text.indexOf("Second"));
      expect(text.indexOf("Second")).toBeLessThan(text.indexOf("Third"));
      expect(text).toContain("Waiting on **Rho**");
    });
  });

  describe("keywords", () => {
    const names = { challenger: "Fen", defender: "Rho" };
    const rules = { keywordsEnabled: true };

    it("says what a keyword changed, and lists the ones that sat idle", () => {
      const result = resolveMatch({
        challengerLineup: [
          card("Scout", "heart", 3, 4, 8, { keyword: "avenge" }),
          card("Anchor", "heart", 5, 4, 6, { keyword: "last_stand" }),
        ],
        defenderLineup: [
          card("Wall", "heart", 3, 5, 7),
          card("Pup", "heart", 4, 5, 6, { keyword: "momentum" }),
        ],
        rules,
      });
      const report = keywordReport(result, names).join("\n");

      expect(report).toContain("`R2` **Anchor** — Last Stand +3 · Heart 6 → **9**");
      expect(report).toContain("Didn't trigger: Avenge (Scout) · Momentum (Pup)");
    });

    it("reports a tiebreak keyword and names the side in a round note", () => {
      const result = resolveMatch({
        challengerLineup: [
          card("Herald", "wit", 3, 9, 3, { keyword: "rally" }),
          card("Nova", "wit", 4, 16, 1, { keyword: "overwhelm" }),
        ],
        defenderLineup: [card("A", "heart", 3, 3, 9), card("B", "power", 5, 5, 5)],
        rules,
      });
      const report = keywordReport(result, names).join("\n");

      expect(report).toContain("`R1` **Herald** — Rally: next Fen card gets +2");
      expect(report).toContain("`R2` **Nova** — Rally +2 · Wit 16 → **18**");
      expect(report).toContain("Overwhelm: 13 damage counts as **16**");
      expect(report).not.toContain("Didn't trigger");
    });

    it("reports nothing for a match with no keywords", () => {
      const result = resolveMatch({
        challengerLineup: [card("A", "power", 9, 3, 3)],
        defenderLineup: [card("B", "wit", 3, 9, 3)],
        rules,
      });
      expect(keywordReport(result, names)).toEqual([]);
    });

    it("explains each keyword in a hand once, naming its carriers", () => {
      const legend = keywordLegend([
        card("One", "power", 9, 3, 3, { keyword: "avenge" }),
        card("Two", "wit", 3, 9, 3, { keyword: "avenge" }),
        card("Three", "heart", 3, 3, 9),
      ]);
      expect(legend).toEqual([
        "-# **Avenge** · One, Two — +3 to type stat if the previous round was a loss",
      ]);
    });
  });
});
