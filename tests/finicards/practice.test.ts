import { describe, expect, it } from "bun:test";
import { resolveMatch } from "../../modules/finicards/battleEngine";
import { buildPickerView } from "../../modules/finicards/lineupPicker";
import {
  dealPracticeHands,
  isPractice,
  practiceNames,
  practiceSideToPlay,
} from "../../modules/finicards/practice";
import {
  buildRevealMessage,
  composeResultMessage,
} from "../../modules/finicards/ui";
import type { BattleCard } from "../../modules/finicards/types";

const card = (id: string): BattleCard => ({
  instanceId: id,
  definitionId: `def-${id}`,
  name: `Card ${id}`,
  series: "Test",
  rarity: "common",
  type: "power",
  stats: { power: 7, wit: 5, heart: 3 },
  keyword: "",
  foil: false,
  tags: [],
  cost: 2,
});

const deck = (prefix: string, size: number) =>
  Array.from({ length: size }, (_, index) => card(`${prefix}${index}`));

const ids = (cards: BattleCard[]) => cards.map((entry) => entry.instanceId);

/** Every text block in a message, containers flattened. */
const textOf = (message: { components: { toJSON(): unknown }[] }) =>
  JSON.stringify(message.components.map((component) => component.toJSON()));

describe("finicards v2 practice battles", () => {
  describe("telling practice from a real battle", () => {
    it("is a battle whose two sides are one user", () => {
      expect(isPractice({ challenger_id: "u1", defender_id: "u1" })).toBe(true);
      expect(isPractice({ challenger_id: "u1", defender_id: "u2" })).toBe(
        false,
      );
    });

    it("plays the challenger's lineup first, then the defender's", () => {
      const battle = { challenger_id: "u1", defender_id: "u1" };
      expect(practiceSideToPlay(battle)).toBe("challenger");
      expect(
        practiceSideToPlay({ ...battle, challenger_lineup: ["a", "b"] }),
      ).toBe("challenger");
      expect(
        practiceSideToPlay({ ...battle, challenger_lineup: ["a", "b", "c"] }),
      ).toBe("defender");
    });
  });

  describe("dealing", () => {
    it("deals each side a full hand from its own deck", () => {
      const hands = dealPracticeHands(deck("a", 12), deck("b", 12), 5);
      expect(hands.challenger).toHaveLength(5);
      expect(hands.defender).toHaveLength(5);
      expect(ids(hands.challenger).every((id) => id.startsWith("a"))).toBe(
        true,
      );
      expect(ids(hands.defender).every((id) => id.startsWith("b"))).toBe(true);
    });

    it("never puts one copy on both sides when a deck faces itself", () => {
      const same = deck("a", 10);
      for (let attempt = 0; attempt < 50; attempt++) {
        const hands = dealPracticeHands(same, same, 5);
        const overlap = ids(hands.defender).filter((id) =>
          ids(hands.challenger).includes(id),
        );
        expect(overlap).toHaveLength(0);
      }
    });

    it("still deals two full hands from a deck too small to split", () => {
      const small = deck("a", 6);
      const hands = dealPracticeHands(small, small, 5);
      expect(hands.challenger).toHaveLength(5);
      expect(hands.defender).toHaveLength(5);
      expect(new Set(ids(hands.defender)).size).toBe(5);
    });
  });

  describe("naming the sides", () => {
    it("uses the deck names", () => {
      expect(practiceNames("Main", "Hearts")).toEqual({
        challenger: "Main",
        defender: "Hearts",
      });
    });

    it("tells a deck apart from itself", () => {
      expect(practiceNames("Main", "Main")).toEqual({
        challenger: "Main A",
        defender: "Main B",
      });
    });
  });

  describe("what the player sees", () => {
    it("says whose lineup the picker is for", () => {
      const view = buildPickerView("battle1", deck("a", 5), [], {
        playingAs: "Main B",
      });
      expect(textOf(view)).toContain("Main B's lineup — pick slot 1");
      expect(textOf(buildPickerView("battle1", deck("a", 5), []))).toContain(
        "Your lineup — pick slot 1",
      );
    });

    it("reveals without mentioning anyone", async () => {
      const text = textOf(
        await buildRevealMessage({
          battleId: "battle1",
          wager: 0,
          practice: true,
          challenger: {
            side: "challenger",
            name: "Main A",
            userId: "u1",
            cards: deck("a", 5),
          },
          defender: {
            side: "defender",
            name: "Main B",
            userId: "u1",
            cards: deck("b", 5),
          },
        }),
      );
      expect(text).toContain("Practice battle");
      expect(text).toContain("Set both lineups");
      expect(text).not.toContain("<@u1>");
    });

    it("reports the result as unrecorded, without mentions", () => {
      const result = resolveMatch({
        challengerLineup: deck("a", 3),
        defenderLineup: deck("b", 3),
      });
      const text = textOf(
        composeResultMessage(
          {
            result,
            names: { challenger: "Main A", defender: "Main B" },
            userIds: { challenger: "u1", defender: "u1" },
            practice: true,
          },
          null,
        ),
      );
      expect(text).toContain("not recorded");
      expect(text).not.toContain("<@u1>");
    });
  });
});
