import { afterEach, describe, expect, it } from "bun:test";
import {
  MAX_ENCODABLE_HAND,
  assertEncodable,
  buildPickerView,
  decodePicks,
  encodePicks,
} from "../../modules/finicards/lineupPicker";
import { HAND_SIZE } from "../../modules/finicards/draw";
import { RULES } from "../../modules/finicards/rules";
import type { BattleCard } from "../../modules/finicards/types";
import type { CardType } from "../../types/PocketbaseTablesV2";

const card = (id: string, type: CardType = "power"): BattleCard => ({
  instanceId: id,
  definitionId: `def-${id}`,
  name: `Card ${id}`,
  series: "Test",
  rarity: "common",
  type,
  stats: { power: 7, wit: 5, heart: 3 },
  keyword: "",
  foil: false,
  tags: [],
  cost: 2,
});

const hand = () => [
  card("a", "power"),
  card("b", "wit"),
  card("c", "heart"),
  card("d", "power"),
  card("e", "wit"),
];

/** The picker is one Components V2 container; buttons live in its action rows. */
const json = (view: ReturnType<typeof buildPickerView>) =>
  view.components[0].toJSON() as any;

const buttonIds = (view: ReturnType<typeof buildPickerView>) =>
  json(view)
    .components.filter((component: any) => component.type === 1)
    .flatMap((row: any) =>
      row.components.map((button: any) => button.custom_id as string),
    );

const contentOf = (view: ReturnType<typeof buildPickerView>) =>
  json(view)
    .components.filter((component: any) => component.type === 10)
    .map((component: any) => component.content)
    .join("\n");

describe("finicards v2 lineup picker", () => {
  describe("pick encoding", () => {
    it("round-trips", () => {
      expect(decodePicks(encodePicks([2, 0, 4]))).toEqual([2, 0, 4]);
    });

    it("treats an empty string as no picks", () => {
      expect(decodePicks("")).toEqual([]);
    });

    it("guards the single-digit encoding", () => {
      // Progress lives in the button custom id as digits, so a hand of ten or
      // more would silently corrupt a pick.
      expect(() => assertEncodable(HAND_SIZE)).not.toThrow();
      expect(() => assertEncodable(MAX_ENCODABLE_HAND + 1)).toThrow(
        /cannot be encoded/,
      );
    });
  });

  describe("first click", () => {
    const view = buildPickerView("battle1", hand(), []);

    it("offers every card in the hand", () => {
      expect(buttonIds(view)).toHaveLength(5);
    });

    it("asks for slot 1", () => {
      expect(contentOf(view)).toContain("slot 1");
    });

    it("lists no slots until one is filled", () => {
      expect(contentOf(view)).not.toContain("**1.**");
    });

    it("encodes no prior picks", () => {
      for (const id of buttonIds(view)) {
        expect(id).toMatch(/^v2_lineup_pick:battle1::\d$/);
      }
    });

    it("offers no restart button when nothing is picked yet", () => {
      expect(buttonIds(view).some((id) => id.endsWith(":reset"))).toBe(false);
    });
  });

  describe("mid-pick", () => {
    const view = buildPickerView("battle1", hand(), [2]);

    it("stops offering a card that is already placed", () => {
      const ids = buttonIds(view);
      expect(ids.filter((id) => !id.endsWith("reset"))).toHaveLength(4);
      expect(ids.some((id) => id.endsWith(":2"))).toBe(false);
    });

    it("carries the picks so far in every button", () => {
      for (const id of buttonIds(view).filter((i) => !i.endsWith("reset"))) {
        expect(id).toMatch(/^v2_lineup_pick:battle1:2:\d$/);
      }
    });

    it("shows the placed card in its slot", () => {
      expect(contentOf(view)).toContain("Card c");
      expect(contentOf(view)).toContain("**1.**");
    });

    it("asks for the next slot", () => {
      expect(contentOf(view)).toContain("slot 2");
    });

    it("offers a way to start over after a misclick", () => {
      expect(buttonIds(view).some((id) => id.endsWith(":reset"))).toBe(true);
    });
  });

  describe("ordering", () => {
    it("places cards in click order, not hand order", () => {
      const view = buildPickerView("battle1", hand(), [4, 0]);
      const slot1 = contentOf(view).indexOf("Card e");
      const slot2 = contentOf(view).indexOf("Card a");
      expect(slot1).toBeGreaterThan(-1);
      expect(slot2).toBeGreaterThan(slot1);
    });
  });

  describe("stays inside Discord's limits", () => {
    it("uses at most five buttons per row", () => {
      const view = buildPickerView("battle1", hand(), []);
      for (const row of json(view).components.filter((c: any) => c.type === 1)) {
        expect(row.components.length).toBeLessThanOrEqual(5);
      }
    });

    it("keeps custom ids under 100 characters", () => {
      for (const id of buttonIds(buildPickerView("abcdefghijklmno", hand(), [1]))) {
        expect(id.length).toBeLessThanOrEqual(100);
      }
    });

    it("keeps labels under 80 characters", () => {
      const long = [card("a"), card("b"), card("c"), card("d"), card("e")].map(
        (entry) => ({ ...entry, name: "An Extremely Long Card Name That Goes On" }),
      );
      const view = buildPickerView("battle1", long, []);
      for (const row of json(view).components.filter((c: any) => c.type === 1)) {
        for (const button of row.components) {
          expect((button.label as string).length).toBeLessThanOrEqual(80);
        }
      }
    });
  });

  describe("keywords", () => {
    const shipped = RULES.keywordsEnabled;
    afterEach(() => {
      RULES.keywordsEnabled = shipped;
    });

    const withKeyword = (id: string, keyword: string): BattleCard => ({
      ...card(id),
      rarity: "uncommon",
      keyword,
    });

    const keyworded = () => [
      withKeyword("a", "vanguard"),
      withKeyword("b", "last_stand"),
      withKeyword("c", "vanguard"),
      card("d"),
      card("e"),
    ];

    const labels = (view: ReturnType<typeof buildPickerView>) =>
      json(view)
        .components.filter((component: any) => component.type === 1)
        .flatMap((row: any) =>
          row.components.map((button: any) => button.label as string),
        );

    it("says nothing about a keyword that will not fire", () => {
      RULES.keywordsEnabled = false;
      const view = buildPickerView("battle1", keyworded(), [0], {
        opposing: [withKeyword("x", "guard")],
      });
      expect(contentOf(view)).not.toContain("Vanguard");
      expect(contentOf(view)).not.toContain("Guard");
      expect(labels(view).join()).not.toContain("Last Stand");
    });

    it("names the keyword on the button and in the slot", () => {
      RULES.keywordsEnabled = true;
      const view = buildPickerView("battle1", keyworded(), [0]);
      expect(labels(view)).toContain("Card b 7/5/3 · Last Stand");
      expect(contentOf(view)).toContain("_Vanguard_");
    });

    it("explains each keyword once, the opponent's included", () => {
      RULES.keywordsEnabled = true;
      const content = contentOf(
        buildPickerView("battle1", keyworded(), [], {
          opposing: [withKeyword("x", "guard")],
        }),
      );
      expect(content.match(/\*\*Vanguard\*\* —/g)).toHaveLength(1);
      expect(content).toContain("**Last Stand** —");
      expect(content).toContain("**Guard** — Opponents get no type multiplier");
      expect(content).toContain("_Guard_");
    });

    it("explains only its own hand once the two carry too many, and offers the rest", () => {
      RULES.keywordsEnabled = true;
      const mine = ["vanguard", "last_stand", "avenge", "rally", "guard"].map(
        (keyword, index) => withKeyword(`m${index}`, keyword),
      );
      const theirs = ["pierce", "bulwark", "momentum", "guard"].map(
        (keyword, index) => withKeyword(`t${index}`, keyword),
      );
      const view = buildPickerView("battle1", mine, [], {
        opposing: theirs,
        opponentName: "Rho",
      });
      const content = contentOf(view);

      expect(content).toContain("**Avenge** —");
      expect(content).not.toContain("**Pierce** —");
      expect(content).toContain("3 more on Rho's cards");
      expect(buttonIds(view)).toContain("v2_keywords:battle1");
    });

    it("offers no keywords button while the legend fits", () => {
      RULES.keywordsEnabled = true;
      const view = buildPickerView("battle1", keyworded(), [], {
        opposing: [withKeyword("x", "guard")],
      });
      expect(buttonIds(view)).not.toContain("v2_keywords:battle1");
    });

    it("keeps a long name's keyword inside the label limit", () => {
      RULES.keywordsEnabled = true;
      const long = { ...withKeyword("a", "last_stand"), name: "N".repeat(120) };
      const [label] = labels(buildPickerView("battle1", [long, card("b"), card("c")], []));
      expect(label.length).toBeLessThanOrEqual(80);
      expect(label.endsWith("· Last Stand")).toBe(true);
    });
  });
});
