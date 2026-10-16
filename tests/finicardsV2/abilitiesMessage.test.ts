import { describe, expect, it } from "bun:test";
import { KEYWORDS } from "../../modules/finicardsV2/keywords";
import {
  ABILITY_GROUPS,
  abilitiesIn,
  buildAbilitiesMessage,
  ungroupedAbilities,
} from "../../modules/finicardsV2/ui/abilitiesMessage";

const contentOf = (groupId: string | null) =>
  (buildAbilitiesMessage(groupId).components[0].toJSON() as any).components[0].content as string;

const buttonsOf = (groupId: string | null) =>
  (buildAbilitiesMessage(groupId).components[0].toJSON() as any).components
    .slice(2)
    .flatMap((row: any) => row.components);

describe("the abilities guide", () => {
  it("puts every ability in exactly one group", () => {
    expect(ungroupedAbilities()).toEqual([]);
    const listed = ABILITY_GROUPS.flatMap((group) => group.slugs);
    expect(new Set(listed).size).toBe(listed.length);
    expect(ABILITY_GROUPS.flatMap(abilitiesIn)).toHaveLength(KEYWORDS.length);
  });

  it("names every ability on the overview, and describes them only on their group's page", () => {
    const overview = contentOf(null);
    for (const keyword of KEYWORDS) expect(overview).toContain(keyword.name);
    expect(overview).not.toContain(KEYWORDS[0].description);
    const position = contentOf("position");
    expect(position).toContain("+3 to type stat while in slot 1");
    expect(position).not.toContain("Silence");
  });

  it("offers every group as a button, with the open one switched off", () => {
    const buttons = buttonsOf("defence");
    expect(buttons).toHaveLength(ABILITY_GROUPS.length + 1);
    expect(buttons.filter((button: any) => button.disabled).map((button: any) => button.custom_id)).toEqual([
      "v2_abilities:defence",
    ]);
    expect(buttonsOf(null).find((button: any) => button.disabled).custom_id).toBe("v2_abilities:overview");
  });

  it("falls back to the overview for a group it doesn't know", () => {
    expect(contentOf("nonsense")).toBe(contentOf(null));
  });
});
