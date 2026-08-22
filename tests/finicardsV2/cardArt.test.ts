import { describe, expect, it } from "bun:test";
import {
  LAYOUTS,
  buildCardSvg,
  estimateWidth,
  layoutFor,
  statBarBlock,
  truncateToWidth,
  wrapToWidth,
  TYPE_PALETTES,
  STAT_LABELS,
} from "../../modules/finicardsV2/cardArt";
import { TYPE_PRIORITY } from "../../modules/finicardsV2/rules";
import type { BattleCard } from "../../modules/finicardsV2/types";
import type {
  CardRarity,
  CardType,
} from "../../types/PocketbaseTablesV2";

const card = (overrides: Partial<BattleCard> = {}): BattleCard => ({
  instanceId: "inst123456",
  definitionId: "def7q4k2m9",
  name: "Ren Kasugai",
  series: "Beacon",
  rarity: "common",
  type: "heart",
  stats: { power: 4, wit: 4, heart: 7 },
  keyword: "",
  foil: false,
  tags: ["baker", "night_shift"],
  cost: 2,
  ...overrides,
});

const RARITIES: CardRarity[] = ["common", "uncommon", "full_art"];

describe("finicards v2 card art", () => {
  describe("template selection", () => {
    it("gives each rarity its own frame", () => {
      expect(layoutFor("common", false).file).toBe("card-common.svg");
      expect(layoutFor("uncommon", false).file).toBe("card-uncommon.svg");
      expect(layoutFor("full_art", false).file).toBe("card-special.svg");
    });

    it("promotes a foil to the fancier frame of its tier", () => {
      // Foil is the cosmetic axis - it changes the frame, never a stat.
      expect(layoutFor("common", true).file).toBe("card-rare.svg");
      expect(layoutFor("uncommon", true).file).toBe("card-double-rare.svg");
    });

    it("leaves full-arts alone, since they already have the top frame", () => {
      expect(layoutFor("full_art", true).file).toBe(
        layoutFor("full_art", false).file,
      );
    });
  });

  describe("stat bar", () => {
    /* The emphasis has to follow the card's type, which is why the bar is
       generated rather than templated: a Power card and a Heart card put the
       wide filled box in different places. */
    it("fills the lead box for whichever stat is the card's type", () => {
      for (const type of TYPE_PRIORITY) {
        const svg = statBarBlock(LAYOUTS.common.statBar, card({ type }));
        expect(svg).toContain("url(#typeLead)");
        expect(svg).toContain(STAT_LABELS[type].full);
      }
    });

    it("shows all three values regardless of which leads", () => {
      const svg = statBarBlock(
        LAYOUTS.common.statBar,
        card({ type: "wit", stats: { power: 3, wit: 9, heart: 3 } }),
      );
      expect(svg).toContain(">9<");
      expect(svg.match(/>3</g)?.length).toBe(2);
    });

    it("spans exactly the width the template allots", () => {
      const spec = LAYOUTS.common.statBar;
      if (spec.style !== "boxed") throw new Error("expected a boxed bar");

      const svg = statBarBlock(spec, card());
      const xs = [...svg.matchAll(/<rect x="([\d.]+)"[^>]*width="([\d.]+)"/g)].map(
        (match) => ({ x: Number(match[1]), w: Number(match[2]) }),
      );

      expect(xs).toHaveLength(3);
      expect(xs[0].x).toBeCloseTo(spec.x0, 1);
      expect(xs[2].x + xs[2].w).toBeCloseTo(spec.x1, 1);
    });

    it("makes the lead box wider than the others", () => {
      const svg = statBarBlock(LAYOUTS.common.statBar, card({ type: "power" }));
      const widths = [...svg.matchAll(/width="([\d.]+)" height/g)].map((m) =>
        Number(m[1]),
      );
      expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
    });

    it("omits the divider when the lead stat is already first", () => {
      const leading = statBarBlock(LAYOUTS.special.statBar, card({ type: "power" }));
      const trailing = statBarBlock(LAYOUTS.special.statBar, card({ type: "heart" }));

      expect(leading).not.toContain("<rect");
      expect(trailing).toContain("<rect");
    });
  });

  describe("text fitting", () => {
    it("estimates a wider string as wider", () => {
      expect(estimateWidth("WWWWW", 10)).toBeGreaterThan(
        estimateWidth("iiiii", 10),
      );
    });

    it("counts letter spacing, which the templates lean on heavily", () => {
      expect(estimateWidth("HEART", 8, 1.4)).toBeGreaterThan(
        estimateWidth("HEART", 8, 0),
      );
    });

    it("truncates with an ellipsis rather than overflowing", () => {
      const fitted = truncateToWidth(
        "Bartholomew Wintersworth-Fenwick III",
        60,
        { fontSize: 19, bold: true },
      );
      expect(fitted.endsWith("…")).toBe(true);
      expect(estimateWidth(fitted, 19, 0, true)).toBeLessThanOrEqual(60);
    });

    it("leaves text that already fits untouched", () => {
      expect(truncateToWidth("Goku", 200, { fontSize: 19 })).toBe("Goku");
    });

    it("wraps within the line budget", () => {
      const lines = wrapToWidth(
        "When this card enters your line, the next card you play this turn costs one less than it otherwise would",
        250,
        3,
        { fontSize: 10.5 },
      );
      expect(lines.length).toBeLessThanOrEqual(3);
      for (const line of lines) {
        expect(estimateWidth(line, 10.5)).toBeLessThanOrEqual(250);
      }
    });

    it("breaks a single unreasonably long word instead of overflowing", () => {
      const lines = wrapToWidth("A".repeat(200), 100, 2, { fontSize: 10 });
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(estimateWidth(line, 10)).toBeLessThanOrEqual(100);
      }
    });

    it("returns nothing for empty text", () => {
      expect(wrapToWidth("", 100, 2, { fontSize: 10 })).toEqual([]);
    });
  });

  describe("palettes", () => {
    it("themes all three types", () => {
      for (const type of TYPE_PRIORITY) {
        expect(TYPE_PALETTES[type].main).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it("gives each type a distinct primary", () => {
      const mains = TYPE_PRIORITY.map((type) => TYPE_PALETTES[type].main);
      expect(new Set(mains).size).toBe(mains.length);
    });
  });

  describe("buildCardSvg", () => {
    it("leaves no unsubstituted tokens on any rarity, type or foil state", async () => {
      for (const rarity of RARITIES) {
        for (const type of TYPE_PRIORITY) {
          for (const foil of [false, true]) {
            const svg = await buildCardSvg(
              card({ rarity, type, foil, keyword: "vanguard" }),
              { withoutArt: true },
            );
            const leftover = svg.match(/\{[a-z_]+\}/g);
            expect(leftover).toBeNull();
          }
        }
      }
    });

    it("produces well-formed SVG", async () => {
      const svg = await buildCardSvg(card(), { withoutArt: true });
      expect(svg.trimStart().startsWith("<svg")).toBe(true);
      expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    });

    it("escapes a name that would otherwise break the markup", async () => {
      const svg = await buildCardSvg(
        card({ name: 'Ren <script> & "friends"' }),
        { withoutArt: true },
      );
      expect(svg).not.toContain("<script>");
      expect(svg).toContain("&lt;script&gt;");
    });

    it("renders the keyword and its description when the card has one", async () => {
      const svg = await buildCardSvg(card({ keyword: "vanguard" }), {
        withoutArt: true,
      });
      expect(svg).toContain("Vanguard");
      expect(svg).toContain("slot 1");
    });

    it("says so plainly when a card has no keyword", async () => {
      const svg = await buildCardSvg(card({ keyword: "" }), {
        withoutArt: true,
      });
      expect(svg).toContain("pure stats");
    });

    it("falls back to a placeholder when there is no art", async () => {
      const svg = await buildCardSvg(card(), { withoutArt: true });
      expect(svg).toContain("NO ART");
      expect(svg).not.toContain("<image");
    });

    it("carries the card's own stats onto the face", async () => {
      const svg = await buildCardSvg(
        card({ type: "wit", stats: { power: 3, wit: 9, heart: 3 } }),
        { withoutArt: true },
      );
      expect(svg).toContain(">9<");
    });

    it("uses the series as the header label", async () => {
      const svg = await buildCardSvg(card({ series: "Dragon Ball" }), {
        withoutArt: true,
      });
      expect(svg).toContain("DRAGON BALL");
    });

    it("survives a card with no tags, series or keyword", async () => {
      const svg = await buildCardSvg(
        card({ tags: [], series: "", keyword: "" }),
        { withoutArt: true },
      );
      expect(svg.match(/\{[a-z_]+\}/g)).toBeNull();
      expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    });
  });
});
