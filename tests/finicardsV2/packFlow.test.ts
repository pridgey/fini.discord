import { describe, expect, it } from "bun:test";
import { packShowOrder } from "../../modules/finicardsV2/packFlow";
import type { BattleCard } from "../../modules/finicardsV2/types";
import {
  PACK_BUTTON,
  buildPackCardMessage,
  buildPackMessage,
} from "../../modules/finicardsV2/ui/cardMessage";

const card = (overrides: Partial<BattleCard> = {}): BattleCard => ({
  instanceId: "inst1",
  definitionId: "def1",
  name: "Ren Kasugai",
  series: "Beacon",
  rarity: "common",
  type: "heart",
  stats: { power: 4, wit: 4, heart: 7 },
  keyword: "",
  foil: false,
  tags: [],
  cost: 1,
  ...overrides,
});

const buttonsOf = (message: Pick<ReturnType<typeof buildPackCardMessage>, "components">): string[] =>
  JSON.stringify(message.components.map((component) => component.toJSON()))
    .match(/v2pack-[a-z]+/g) ?? [];

describe("finicardsV2 pack flow", () => {
  it("turns a pack over rarest last, keeping pull order within a rarity", () => {
    const order = packShowOrder([
      card({ name: "Legend", rarity: "full_art", legendary: "storm" }),
      card({ name: "Common A" }),
      card({ name: "Secret", rarity: "full_art", secretArt: true }),
      card({ name: "Full", rarity: "full_art" }),
      card({ name: "Uncommon", rarity: "uncommon" }),
      card({ name: "Common B" }),
    ]).map((entry) => entry.name);

    expect(order).toEqual(["Common A", "Common B", "Uncommon", "Full", "Secret", "Legend"]);
  });

  it("offers the next card until the last, then only the whole pack", () => {
    const media = { name: "card.png", buffer: Buffer.from("") };

    const first = buildPackCardMessage({ card: card(), media, index: 0, total: 5 });
    expect(buttonsOf(first)).toEqual([PACK_BUTTON.next, PACK_BUTTON.all]);
    expect(JSON.stringify(first.components[0].toJSON())).toContain("Card 1 of 5");

    const last = buildPackCardMessage({ card: card(), media, index: 4, total: 5 });
    expect(buttonsOf(last)).toEqual([PACK_BUTTON.all]);
  });

  it("offers another pack under the whole pack only when there is one to offer", async () => {
    const pack = { cards: [], cost: 50, shortfall: 0, reimbursement: 0 };

    expect(buttonsOf(await buildPackMessage(pack))).toEqual([]);

    const again = await buildPackMessage({ ...pack, again: "Buy another pack · 50 fc" });
    expect(buttonsOf(again)).toEqual([PACK_BUTTON.again]);
    expect(JSON.stringify(again.components[0].toJSON())).toContain("Buy another pack · 50 fc");
  });
});

describe("collector buttons and the button router", () => {
  it("leaves the pack and sell buttons to the flows that posted them", async () => {
    const { isCollectorButton } = await import("../../buttons/buttonHandler");

    for (const id of Object.values(PACK_BUTTON)) expect(isCollectorButton(id)).toBe(true);
    expect(isCollectorButton("v2sell-buy")).toBe(true);
    expect(isCollectorButton("v2sell-cancel")).toBe(true);
    // Routed buttons carry a namespace before a colon and are not touched.
    expect(isCollectorButton("v2_card_view:123:abc")).toBe(false);
    expect(isCollectorButton("booster_pack_open:1:2")).toBe(false);
  });
});
