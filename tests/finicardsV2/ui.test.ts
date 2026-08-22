import { describe, expect, it } from "bun:test";
import { MessageFlags } from "discord.js";
import { resolveMatch } from "../../modules/finicardsV2/battleEngine";
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

    it("truncates a long name in a chip", () => {
      const chip = cardChip(card("Bartholomew Wintersworth", "power", 9, 3, 3));
      expect(chip.length).toBeLessThan(30);
      expect(chip).toContain("…");
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

    const message = buildResultMessage({
      battleId: "b1",
      result,
      names: { challenger: "Fen", defender: "Rho" },
      userIds: { challenger: "111", defender: "222" },
      split: { pot: 120, jackpotCut: 12, payout: 108 },
    });
    const json = message.components[0].toJSON() as any;
    const text = textOf(json);

    it("leads with the winner and the scoreline", () => {
      expect(text).toContain("Fen wins 2 – 1");
    });

    it("explains why each round's multiplier applied", () => {
      // The whole point: a player should learn the wheel from the result.
      expect(text).toContain("Heart");
      expect(text).toContain("beats");
      expect(text).toContain("×1.5");
    });

    it("still shows the working, in small text", () => {
      expect(text).toContain("7×1.5=10");
      expect(text).toMatch(/− \d+ (Power|Heart|Wit)/);
    });

    it("parenthesises negative damage so a scoreline stays readable", () => {
      // Round 2 of this match has the defender on -4.
      expect(text).toContain("(-4)");
    });

    it("keeps every round in one block, not one section each", () => {
      // Three bordered sections for three rounds reads as three times the work.
      expect(countOf(json, SEPARATOR)).toBe(2);
    });

    it("leads each round with who won it and by how much", () => {
      for (const round of result.rounds) {
        expect(text).toContain(`\`R${round.slot}\``);
      }
      expect(text).toMatch(/Fen \+\d/);
      expect(text).toMatch(/Rho \+\d/);
    });

    it("stays short enough to scan - two lines a round", () => {
      const roundLines = text
        .split("\n")
        .filter((line) => /^`R\d`|^-# .*(vs|·)/.test(line));
      expect(roundLines.length).toBeLessThanOrEqual(result.rounds.length * 2);
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

    it("calls out a damage-decided match explicitly", () => {
      const level = resolveMatch({
        challengerLineup: [card("A", "power", 7, 5, 3), card("B", "wit", 3, 7, 5)],
        defenderLineup: [card("C", "wit", 5, 7, 3), card("D", "power", 7, 5, 3)],
      });
      const built = buildResultMessage({
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

    it("renders a draw without claiming a winner", () => {
      const mirror = () => [card("Mirror", "power", 7, 5, 3)];
      const drawn = resolveMatch({
        challengerLineup: mirror(),
        defenderLineup: mirror(),
      });
      const built = buildResultMessage({
        result: drawn,
        names: { challenger: "Fen", defender: "Rho" },
        userIds: { challenger: "1", defender: "2" },
      });
      // Assert on the headline block specifically: the round explanation legitimately
      // contains the word "wins" ("the higher stat wins"), so scanning the whole
      // message for it proves nothing.
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
});
