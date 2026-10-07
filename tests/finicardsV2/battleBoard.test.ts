import { describe, expect, it } from "bun:test";
import { resolveMatch } from "../../modules/finicardsV2/battleEngine";
import { renderBattleBoard } from "../../modules/finicardsV2/cardArt";
import type { BattleCard } from "../../modules/finicardsV2/types";
import type { CardType } from "../../types/PocketbaseTablesV2";

const card = (
  name: string,
  type: CardType,
  stats = { power: 7, wit: 5, heart: 3 },
): BattleCard => ({
  instanceId: `inst-${name}`,
  definitionId: `def-${name}`,
  name,
  series: "Test",
  rarity: "common",
  type,
  stats,
  keyword: "",
  foil: false,
  tags: [],
  cost: 2,
});

const names = { challenger: "Fen", defender: "Rho" };

describe("finicards v2 battle board", () => {
  it("renders a PNG for a full match", async () => {
    const result = resolveMatch({
      challengerLineup: [
        card("A", "heart"),
        card("B", "wit"),
        card("C", "power"),
      ],
      defenderLineup: [
        card("D", "power"),
        card("E", "wit"),
        card("F", "heart"),
      ],
    });
    const buffer = await renderBattleBoard(result, names);
    expect(buffer).not.toBeNull();
    expect(buffer!.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("renders draws, negative damage and very long names", async () => {
    const result = resolveMatch({
      challengerLineup: [
        card("Bartholomew Wintersworth-Fenwick The Third", "wit", {
          power: 3,
          wit: 9,
          heart: 3,
        }),
      ],
      defenderLineup: [card("Mirror", "wit", { power: 5, wit: 5, heart: 5 })],
    });
    expect(
      await renderBattleBoard(result, {
        challenger: '<&"names">',
        defender: "x".repeat(80),
      }),
    ).not.toBeNull();

    const mirror = () => [card("Same", "power")];
    const drawn = resolveMatch({
      challengerLineup: mirror(),
      defenderLineup: mirror(),
    });
    expect(await renderBattleBoard(drawn, names)).not.toBeNull();
  });

  it("grows taller with more rounds", async () => {
    const lineup = (n: number) =>
      Array.from({ length: n }, (_, i) => card(`C${i}`, "power"));
    const one = await renderBattleBoard(
      resolveMatch({ challengerLineup: lineup(1), defenderLineup: lineup(1) }),
      names,
    );
    const three = await renderBattleBoard(
      resolveMatch({ challengerLineup: lineup(3), defenderLineup: lineup(3) }),
      names,
    );
    expect(three!.length).toBeGreaterThan(one!.length);
  });
});
