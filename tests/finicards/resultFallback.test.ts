import { describe, expect, it } from "bun:test";
import { resolveMatch } from "../../modules/finicards/battleEngine";
import { composeResultMessage } from "../../modules/finicards/ui";
import type { BattleCard } from "../../modules/finicards/types";
import type { CardType } from "../../types/PocketbaseTablesV2";

const card = (
  name: string,
  type: CardType,
  power: number,
  wit: number,
  heart: number,
): BattleCard => ({
  instanceId: `inst-${name}`,
  definitionId: `def-${name}`,
  name,
  series: "Test",
  rarity: "common",
  type,
  stats: { power, wit, heart },
  keyword: "",
  foil: false,
  tags: [],
  cost: 2,
});

const TEXT = 10;
const GALLERY = 12;
const SEPARATOR = 14;

/* The battle board failing to render must still leave a readable result. */
describe("finicards v2 result without a battle board", () => {
  const result = resolveMatch({
    challengerLineup: [
      card("Knight", "heart", 4, 4, 7),
      card("Trickster", "wit", 3, 9, 3),
      card("Brawler", "power", 6, 5, 4),
    ],
    defenderLineup: [
      card("Storm Caller", "power", 9, 3, 3),
      card("Scholar", "wit", 5, 5, 5),
      card("Heir", "heart", 1, 2, 12),
    ],
  });

  const message = composeResultMessage(
    {
      battleId: "b1",
      result,
      names: { challenger: "Fen", defender: "Rho" },
      userIds: { challenger: "111", defender: "222" },
    },
    null,
  );
  const json = message.components[0].toJSON() as any;
  const text = json.components
    .filter((c: any) => c.type === TEXT)
    .map((c: any) => c.content)
    .join("\n");

  it("attaches nothing and shows no gallery", () => {
    expect(message.files).toHaveLength(0);
    expect(json.components.some((c: any) => c.type === GALLERY)).toBe(false);
  });

  it("explains why each round's multiplier applied", () => {
    expect(text).toContain("beats");
    expect(text).toContain("×1.5");
  });

  it("shows the working as a table of attack, defence and damage", () => {
    expect(text).toContain("7x1.5=10");
    expect(text).toMatch(/```\n +Attack +Defence +Dmg\n/);
  });

  it("parenthesises negative damage so a scoreline stays readable", () => {
    expect(text).toContain("(-4)");
  });

  it("leads each round with who won it and keeps them in one block", () => {
    for (const round of result.rounds) {
      expect(text).toContain(`\`R${round.slot}\``);
    }
    expect(text).toMatch(/Fen \+\d/);
    expect(
      json.components.filter((c: any) => c.type === SEPARATOR).length,
    ).toBe(2);
  });

  it("keeps the total damage footnote", () => {
    expect(text).toContain("Total damage");
  });
});
