import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import {
  LAYOUTS,
  buildCardSvg,
  estimateWidth,
  layoutFor,
  statBarBlock,
  trimPadding,
  truncateToWidth,
  wrapToWidth,
  TYPE_PALETTES,
  STAT_LABELS,
} from "../../modules/finicardsV2/cardArt";
import { TYPE_PRIORITY } from "../../modules/finicardsV2/rules";
import type { StatBarSpec } from "../../modules/finicardsV2/cardArt/layouts";
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

/* No frame draws its stats in boxes any more, but the boxed bar is still a
   supported style - so it is tested against a spec of its own. */
const BOXED_BAR: StatBarSpec = {
  style: "boxed",
  x0: 22,
  x1: 299,
  y: 380,
  h: 32,
  rx: 4,
  gap: 4,
  leadRatio: 1.7,
  box: { fill: "#14162a", stroke: "none" },
  label: { fill: "#e4cf9a", size: 8, letterSpacing: 1.1 },
  value: { fill: "#ffffff", size: 18 },
  lead: {
    labelFill: "#ffffff",
    labelOpacity: 0.9,
    labelSize: 8.5,
    labelLetterSpacing: 1.4,
    valueFill: "#ffffff",
    valueSize: 24,
  },
  padX: 9,
  labelDy: 19,
  valueDy: 23,
};

describe("finicards v2 card art", () => {
  describe("template selection", () => {
    it("gives each rarity its own frame", () => {
      expect(layoutFor("common", false).file).toBe("card-common.svg");
      expect(layoutFor("uncommon", false).file).toBe("card-uncommon.svg");
      expect(layoutFor("full_art", false).file).toBe("card-special.svg");
    });

    it("promotes a foil to the fancier frame of its tier", () => {
      // Foil is the cosmetic axis - it changes the frame, never a stat.
      expect(layoutFor("common", true).file).toBe("card-common-foil.svg");
      expect(layoutFor("uncommon", true).file).toBe("card-uncommon-foil.svg");
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
        const svg = statBarBlock(BOXED_BAR, card({ type }));
        expect(svg).toContain("url(#typeLead)");
        expect(svg).toContain(STAT_LABELS[type].full);
      }
    });

    it("shows all three values regardless of which leads", () => {
      const svg = statBarBlock(
        BOXED_BAR,
        card({ type: "wit", stats: { power: 3, wit: 9, heart: 3 } }),
      );
      expect(svg).toContain(">9<");
      expect(svg.match(/>3</g)?.length).toBe(2);
    });

    it("spans exactly the width the template allots", () => {
      const spec = BOXED_BAR;
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
      const svg = statBarBlock(BOXED_BAR, card({ type: "power" }));
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

  describe("art padding", () => {
    const padded = (inner: { w: number; h: number }, canvas: { w: number; h: number }) =>
      sharp({
        create: { width: canvas.w, height: canvas.h, channels: 4, background: "#00000000" },
      })
        .composite([
          {
            input: {
              create: { width: inner.w, height: inner.h, channels: 4, background: "#ff0000" },
            },
            left: 30,
            top: 20,
          },
        ])
        .png()
        .toBuffer();

    it("cuts a transparent canvas down to the picture inside it", async () => {
      const trimmed = await trimPadding(await padded({ w: 100, h: 60 }, { w: 200, h: 150 }));
      const meta = await sharp(trimmed).metadata();
      expect([meta.width, meta.height]).toEqual([100, 60]);
    });

    it("leaves an image with no transparency exactly as it was", async () => {
      const opaque = await sharp({
        create: { width: 80, height: 50, channels: 3, background: "#000000" },
      })
        .png()
        .toBuffer();
      expect(await trimPadding(opaque)).toBe(opaque);
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

    it("keeps a name that fits on its one line", async () => {
      const svg = await buildCardSvg(card({ name: "Krillin" }), { withoutArt: true });
      expect(svg).toContain(">Krillin</text>");
      expect(svg).not.toContain("<tspan x=\"32\" dy=\"-");
    });

    it("grows a long name upward onto a second line instead of cutting it", async () => {
      const svg = await buildCardSvg(
        card({ name: "Mistress of the Winter Constellations" }),
        { withoutArt: true },
      );
      // The first line sits above the baseline, the second comes back to it,
      // so whatever is under the name stays where it was.
      const lines = [...svg.matchAll(/<tspan x="32" dy="(-?\d+)">([^<]*)<\/tspan>/g)];
      expect(lines).toHaveLength(2);
      expect(Number(lines[0][1])).toBe(-Number(lines[1][1]));
      expect(`${lines[0][2]} ${lines[1][2]}`).toBe("Mistress of the Winter Constellations");
    });

    it("grows the uncommon's text panel upward under a two-line name", async () => {
      const panelOf = async (name: string) => {
        const svg = await buildCardSvg(card({ name, rarity: "uncommon" }), { withoutArt: true });
        const match = svg.match(/<clipPath id="panel"><rect x="28" y="([\d.]+)" width="550" height="([\d.]+)"/);
        return { y: Number(match?.[1]), h: Number(match?.[2]) };
      };
      const short = await panelOf("Krillin");
      const long = await panelOf("Mistress of the Winter Constellations");

      expect(long.y).toBeLessThan(short.y);
      // Taller by exactly what it rose, so its bottom edge has not moved.
      expect(long.y + long.h).toBe(short.y + short.h);
    });

    it("ends the common's art window higher under a two-line name", async () => {
      const windowOf = async (name: string, foil = false) => {
        const svg = await buildCardSvg(card({ name, rarity: "common", foil }), { withoutArt: true });
        expect(svg).not.toContain("{art_");
        return Number(svg.match(/<clipPath id="art"><rect x="32" y="32" width="542" height="([\d.]+)"/)?.[1]);
      };
      expect(await windowOf("Krillin")).toBe(430);
      expect(await windowOf("Mistress of the Winter Constellations")).toBeLessThan(430);
      expect(await windowOf("Mistress of the Winter Constellations", true)).toBeLessThan(430);
    });

    it("credits the artist in the footer of every frame", async () => {
      for (const [rarity, foil] of [["common", false], ["common", true], ["uncommon", false], ["uncommon", true], ["full_art", false]] as const) {
        const svg = await buildCardSvg(card({ rarity, foil, artist: "Hokyoung Kim" }), { withoutArt: true });
        expect(svg).toContain('text-anchor="end">Hokyoung Kim</text>');
      }
      const long = await buildCardSvg(card({ rarity: "common", artist: "A Very Long Studio Name Indeed" }), { withoutArt: true });
      expect(long).toContain('text-anchor="end">A Very Long Studi…</text>');
    });

    it("does not print the series or the legacy marker as a tag", async () => {
      const svg = await buildCardSvg(
        card({ series: "My Hero Academia", tags: ["anime_hero", "my_hero_academia", "legacy"] }),
        { withoutArt: true },
      );
      expect(svg).toContain("ANIME HERO");
      // Once in the header, and not again in the tag line.
      expect(svg.match(/MY HERO ACADEMIA/g)).toHaveLength(1);
      expect(svg).not.toContain("LEGACY");
    });

    it("prints origin, set, set number and the copy's id in the footer", async () => {
      const converted = await buildCardSvg(
        card({ instanceId: "copy123", legacyCard: "old1", set: 3, number: 12, setSize: 217, rarity: "uncommon" }),
        { withoutArt: true },
      );
      expect(converted).toContain("FINICARD V1 · S3 12/217 · copy123");

      // A Secret Art is not counted in its set, so its number runs past it.
      const secret = await buildCardSvg(
        card({ instanceId: "copy789", set: 3, number: 218, setSize: 217, rarity: "full_art", secretArt: true }),
        { withoutArt: true },
      );
      expect(secret).toContain("FINICARD V2 · S3 218/217 · copy789");

      // Not numbered yet: the set stands alone.
      const unnumbered = await buildCardSvg(card({ instanceId: "copy000", set: 3 }), { withoutArt: true });
      expect(unnumbered).toContain("FINICARD V2 · S3 · copy000");

      // Made for v2, and with no set recorded: the set is left out, not S0.
      const native = await buildCardSvg(card({ instanceId: "copy456" }), {
        withoutArt: true,
      });
      expect(native).toContain("FINICARD V2 · copy456");
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
