import { describe, expect, it } from "bun:test";
import { PACK_BOONS, withDungeonBoon } from "../../modules/finicards/boons";
import {
  DUNGEON,
  createRun,
  doorSight,
  modsOf,
} from "../../modules/finicards/dungeon";
import { ITEMS, piecesOf } from "../../modules/finicards/items";
import {
  FOIL_CHANCE,
  PACK_ODDS,
  PACK_SIZE,
  SET_PACK_ODDS,
  withUncommonFloor,
} from "../../modules/finicards/packs";
import { planUse, useChoices } from "../../modules/finicards/useItem";
import {
  buildSummonMessage,
  buildSummonNotice,
} from "../../modules/finicards/ui/summonMessage";
import type { BattleCard } from "../../modules/finicards/types";
import type { V2ItemRecord } from "../../types/PocketbaseTablesV2";

const row = (item: string, active = false, id = item): V2ItemRecord => ({
  id,
  user_id: "me",
  server_id: "s",
  item,
  kind: ITEMS.find((each) => each.key === item)!.kind,
  active,
});

const textOf = (message: { components: { toJSON(): unknown }[] }) =>
  JSON.stringify(message.components.map((c) => c.toJSON()));

describe("pack boons", () => {
  it("cover every pack boon in the catalogue", () => {
    for (const item of ITEMS.filter((each) => each.kind === "pack_boon"))
      expect(PACK_BOONS[item.key]).toBeDefined();
  });

  it("shift the odds toward rarer cards, still adding to 100", () => {
    for (const base of [PACK_ODDS, SET_PACK_ODDS]) {
      const lucky = PACK_BOONS.boon_lucky.odds!(base);
      expect(Object.values(lucky).reduce((a, b) => a + b, 0)).toBe(100);
      expect(lucky.full_art).toBeGreaterThan(base.full_art);
      expect(lucky.summoned).toBe(0);
    }
    expect(PACK_BOONS.boon_foil.foilChance).toBe(FOIL_CHANCE * 5);
    expect(PACK_BOONS.boon_extra_card.size).toBe(PACK_SIZE + 1);
  });

  it("turn one card of an all-common pack uncommon, and leave a better pack alone", () => {
    expect(withUncommonFloor(["common", "common", "common"], () => 0.5)).toEqual([
      "common",
      "uncommon",
      "common",
    ]);
    const mixed = ["common", "full_art", "common"] as const;
    expect(withUncommonFloor([...mixed], () => 0)).toEqual([...mixed]);
  });
});

describe("dungeon boons", () => {
  const start = () =>
    createRun({
      pool: [
        {
          instanceId: "e",
          definitionId: "e",
          name: "E",
          series: "",
          rarity: "common",
          type: "power",
          stats: { power: 5, wit: 5, heart: 5 },
          keyword: "",
          foil: false,
          tags: [],
          cost: 1,
        },
      ],
      random: () => 0.5,
    })!;

  it("each do what they say, and say so", () => {
    const run = start();
    expect(withDungeonBoon(run, "boon_spare_ward").wards).toBe(DUNGEON.startingWards + 1);
    expect(withDungeonBoon(run, "boon_purse").geld).toBe(30);
    expect(doorSight(withDungeonBoon(run, "boon_scout_map"))).toBe("scouted");
    const lantern = withDungeonBoon(
      { ...run, buffs: [{ name: "Fog", note: "", mods: { fog: 1 }, rooms: 3 }] },
      "boon_lantern",
    );
    expect(doorSight(lantern)).toBe("plain");
    expect(modsOf(withDungeonBoon(run, "boon_grindstone")).type).toBe(1);
    const spent = withDungeonBoon(run, "boon_purse");
    expect(spent.boon).toBe("boon_purse");
    expect(spent.recap?.lines[0]).toContain("**Heavy Purse** is spent");
  });

  it("cover every dungeon boon, and leave a run alone for anything else", () => {
    for (const item of ITEMS.filter((each) => each.kind === "dungeon_boon"))
      expect(withDungeonBoon(start(), item.key).boon).toBe(item.key);
    const run = start();
    expect(withDungeonBoon(run, "boon_lucky")).toBe(run);
  });
});

describe("/finicard use", () => {
  const dragonBalls = piecesOf("dragon_balls").map((piece) => row(piece.key));

  it("suggests a set ready to summon first, then boons, then sets in progress", () => {
    const choices = useChoices(
      [...dragonBalls, row("boon_lucky"), row("boon_lucky", false, "b2"), row("exodia_head")],
      {},
      "",
    );
    expect(choices[0]).toEqual({
      name: "✨ Summon Shenron - every one of the Dragon Balls",
      value: "summon:dragon_balls",
    });
    expect(choices[1].name).toContain("Four-Leaf Clover ×2 · pack boon");
    expect(choices.at(-1)!.name).toContain("Exodia: 1 of 5");
    expect(useChoices([row("boon_lucky")], {}, "purse")).toEqual([]);
  });

  it("summons a complete set, one of each piece", () => {
    const plan = planUse("summon:dragon_balls", dragonBalls, {});
    expect(plan.kind).toBe("summon");
    if (plan.kind === "summon") expect(plan.rows).toHaveLength(7);
    // By a piece's name, or the card's, too.
    expect(planUse("4-star dragon ball", dragonBalls, {}).kind).toBe("summon");
    expect(planUse("Shenron", dragonBalls, {}).kind).toBe("summon");
  });

  it("says what's missing, or who already summoned it", () => {
    const short = planUse("summon:dragon_balls", dragonBalls.slice(0, 5), {});
    expect(short).toEqual({
      kind: "say",
      text: "🐉 You hold 5 of the 7 Dragon Balls. Still missing: 6★, 7★.",
    });
    const taken = planUse("summon:dragon_balls", dragonBalls, {
      dragon_balls: "fen",
    });
    expect(taken.kind === "say" && taken.text).toContain("by <@fen>");
  });

  it("switches a boon on, one of each kind at a time", () => {
    const plan = planUse("boon_lucky", [row("boon_lucky")], {});
    expect(plan.kind).toBe("activate");
    const again = planUse("boon_lucky", [row("boon_lucky", true)], {});
    expect(again.kind === "say" && again.text).toContain("already on");
    const other = planUse(
      "boon_foil",
      [row("boon_lucky", true), row("boon_foil")],
      {},
    );
    expect(other.kind === "say" && other.text).toContain("One pack boon at a time");
    // A dungeon boon doesn't wait on a pack boon.
    expect(
      planUse("boon_purse", [row("boon_lucky", true), row("boon_purse")], {})
        .kind,
    ).toBe("activate");
    expect(planUse("boon_purse", [], {}).kind).toBe("say");
    expect(planUse("nonsense", [], {}).kind).toBe("say");
  });
});

describe("the summoning message", () => {
  const card = {
    instanceId: "copy1",
    definitionId: "def",
    name: "Shenron",
    series: "Dragon Ball Z",
    rarity: "summoned",
    type: "heart",
    stats: { power: 2, wit: 2, heart: 14 },
    keyword: "",
    foil: false,
    tags: [],
    cost: 8,
  } as BattleCard;

  it("plays the animation, then rests on the card", () => {
    const playing = buildSummonMessage({
      set: "dragon_balls",
      card,
      userId: "aya",
      media: { name: "summoning.gif", buffer: Buffer.from("gif") },
      resting: false,
    });
    expect(textOf(playing)).toContain("attachment://summoning.gif");
    expect(textOf(playing)).not.toContain("copy1");
    const resting = buildSummonMessage({
      set: "dragon_balls",
      card,
      userId: "aya",
      media: null,
      resting: true,
    });
    expect(textOf(resting)).toContain("copy1");
    expect(textOf(resting)).toContain("scatter back into the dungeon");
  });

  it("tells the bot channel, with a link", () => {
    const notice = textOf(buildSummonNotice("exodia", "aya", "https://x"));
    expect(notice).toContain("summoned **Exodia**");
    expect(notice).toContain("https://x");
  });
});

describe("the cheap additions", () => {
  const start = () =>
    createRun({
      pool: [
        {
          instanceId: "e",
          definitionId: "e",
          name: "E",
          series: "",
          rarity: "common",
          type: "power",
          stats: { power: 5, wit: 5, heart: 5 },
          keyword: "",
          foil: false,
          tags: [],
          cost: 1,
        },
      ],
      random: () => 0.5,
    })!;

  it("start a run with dice or coffee, and say a key let it in free", async () => {
    const { withDungeonKey } = await import("../../modules/finicards/boons");
    expect(withDungeonBoon(start(), "boon_loaded_dice").rerolls).toBe(2);
    expect(withDungeonBoon(start(), "boon_thermos").coffee).toBe(2);
    const both = withDungeonKey(withDungeonBoon(start(), "boon_purse"));
    expect(both.recap?.lines).toHaveLength(2);
    expect(both.recap?.lines[1]).toContain("free to enter");
  });

  it("give every series lure its series, and the compass a standard pack's odds", () => {
    const lures = ITEMS.filter((item) => item.series);
    expect(lures.length).toBeGreaterThanOrEqual(5);
    for (const lure of lures)
      expect(PACK_BOONS[lure.key].leanSeries).toBe(lure.series);
    expect(PACK_BOONS.boon_set_compass.setPackOnly).toBe(true);
    expect(PACK_BOONS.boon_set_compass.odds!(SET_PACK_ODDS)).toEqual(PACK_ODDS);
    expect(PACK_BOONS.boon_fresh_pack.freshOnly).toBe(true);
  });

  it("let a key be on beside a dungeon boon, but not two keys", () => {
    const key = row("key_dungeon");
    expect(planUse("key_dungeon", [row("boon_purse", true), key], {}).kind).toBe(
      "activate",
    );
    const second = planUse(
      "Dungeon Key",
      [row("key_dungeon", true, "k1"), row("key_dungeon", false, "k2")],
      {},
    );
    expect(second.kind === "say" && second.text).toContain("already on");
  });

  it("send card boons to a card, and boxes to be opened", () => {
    expect(planUse("Reroll Token", [row("card_reroll")], {}).kind).toBe("card");
    expect(planUse("Mystery Box", [row("box_mystery")], {}).kind).toBe("open");
  });
});

describe("card boons", () => {
  it("clean a nickname of formatting and mentions, and keep it short", async () => {
    const { cleanNickname, NICKNAME_MAX } = await import(
      "../../modules/finicards/cardBoons"
    );
    expect(cleanNickname("  Big   **Guy** <@123> ")).toBe("Big Guy 123");
    expect(cleanNickname("`@#`")).toBeNull();
    expect(cleanNickname("x".repeat(80))!.length).toBe(NICKNAME_MAX);
  });

  it("reroll to a new ability, never blank or the same, and offer three different ones", async () => {
    const { rerolledKeyword, scrollChoices } = await import(
      "../../modules/finicards/cardBoons"
    );
    let seed = 3;
    const random = () =>
      ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const rarity of ["common", "uncommon", "full_art", "summoned"] as const) {
      for (let i = 0; i < 50; i++) {
        const next = rerolledKeyword(rarity, "edge", random);
        expect(next).not.toBe("");
        expect(next).not.toBe("edge");
      }
      const three = scrollChoices(rarity, "edge", random);
      expect(new Set(three).size).toBe(3);
      expect(three).not.toContain("edge");
    }
  });

  it("show a nicknamed copy by its nickname, keeping the card's name", async () => {
    const { toBattleCard } = await import("../../modules/finicards/cardStore");
    const card = toBattleCard({
      id: "c1",
      nickname: "Big Guy",
      definition: { card_name: "Goku", rarity: "full_art" },
    } as never);
    expect(card.name).toBe("Big Guy");
    expect(card.cardName).toBe("Goku");
  });
});

describe("a piece found", () => {
  it("is told with who found it and how much of the set is out", async () => {
    const { pieceFoundLine } = await import(
      "../../modules/finicards/pieceNotice"
    );
    expect(pieceFoundLine("aya", "dragon_ball_4", 3)).toBe(
      "🟠 <@aya> found the **4-Star Dragon Ball** · 3 of 7 Dragon Balls found on this server",
    );
    expect(pieceFoundLine("aya", "boon_lucky", 1)).toBeNull();
  });
});

describe("a card in a fight", () => {
  it("keeps its ability, and says the boon wasn't spent", async () => {
    const { inPlayText } = await import("../../commands/finicard/use");
    const { itemByKey } = await import("../../modules/finicards/items");
    const scroll = itemByKey("card_scroll")!;
    expect(inPlayText("Goku", "dungeon", scroll)).toBe(
      "**Goku** is in your dungeon run right now, so its ability can't change mid-fight. Use the **Ability Scroll** once the run is over - it hasn't been spent.",
    );
    expect(inPlayText("Goku", "battle", scroll)).toContain(
      "a battle that isn't over",
    );
  });
});
