import type { CardType } from "../../../types/PocketbaseTablesV2";
import { TYPE_PRIORITY } from "../rules";
import type { BattleCard } from "../types";
import type {
  AbilitySpec,
  Box,
  FlavourSpec,
  StatBarSpec,
  TagsSpec,
  TemplateLayout,
} from "./layouts";
import { STAT_LABELS } from "./palettes";
import {
  escapeXml,
  estimateWidth,
  truncateToWidth,
  wrapAbility,
  wrapToWidth,
} from "./svgText";

/**
 * The generated pieces of a card.
 *
 * Everything here produces an SVG fragment that drops into a `{token}` in a
 * template. These are the parts that cannot be a static string because their
 * shape depends on the card: the stat bar moves its emphasis to whichever stat
 * is the card's type, and the ability text has to wrap.
 */

const round = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

/* ------------------------------------------------------------------ art ---- */

/**
 * The art window, either the real artwork or the mockups' hatched placeholder.
 *
 * The image is pre-cropped to the window's exact aspect ratio by `sharp`, so
 * `preserveAspectRatio="slice"` only has to cover rounding.
 */
export const artBlock = (
  layout: TemplateLayout,
  artDataUri: string | null,
): string => {
  const { x, y, w, h } = layout.art;

  if (!artDataUri) {
    const pattern = layout.face === "dark" ? "hatchDark" : "hatch";
    return [
      `<g id="art-window">`,
      `<rect id="ART" x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" fill="url(#${pattern})"></rect>`,
      `<text x="${round(layout.artCaption.x)}" y="${round(layout.artCaption.y)}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="7" letter-spacing="1" fill="${layout.artCaption.fill}">NO ART</text>`,
      `</g>`,
    ].join("");
  }

  return [
    `<g id="art-window">`,
    `<image x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" preserveAspectRatio="xMidYMid slice" xlink:href="${artDataUri}"></image>`,
    `</g>`,
  ].join("");
};

/* ----------------------------------------------------------------- tags ---- */

/**
 * Two tags. The doc calls these professions on the mockups; in the schema they
 * are just the first two `tags`, which is what makes them free to author.
 */
export const tagsBlock = (spec: TagsSpec, tags: string[]): string => {
  const [first, second] = tags;
  if (!first) return "";

  const upper = (value: string) => escapeXml(value.toUpperCase().replace(/_/g, " "));

  if (spec.style === "inline") {
    const opacity = spec.opacity !== undefined ? ` opacity="${spec.opacity}"` : "";
    const fitted = [first, second].filter(Boolean).map((tag) =>
      truncateToWidth(upper(tag), spec.maxWidth / 2.2, {
        fontSize: spec.size,
        letterSpacing: spec.letterSpacing,
        bold: true,
      }),
    );

    const spans = [
      `<tspan fill="${spec.first.fill}">${fitted[0]}</tspan>`,
      fitted[1]
        ? `<tspan fill="${spec.separatorFill}">${escapeXml(spec.separator).replace(/ /g, "&#160;")}</tspan><tspan fill="${spec.second.fill}">${fitted[1]}</tspan>`
        : "",
    ].join("");

    return `<text id="professions" x="${round(spec.x)}" y="${round(spec.y)}" font-size="${spec.size}" font-weight="700" letter-spacing="${spec.letterSpacing}"${opacity}>${spans}</text>`;
  }

  /* Chips: each is sized to its own text. */
  const chips: string[] = [];
  let cursor = spec.x;

  for (const [index, tag] of [first, second].filter(Boolean).entries()) {
    const label = truncateToWidth(upper(tag), spec.maxWidth / 2.2, {
      fontSize: spec.size,
      letterSpacing: spec.letterSpacing,
      bold: true,
    });
    const width =
      estimateWidth(label, spec.size, spec.letterSpacing, true) + spec.padX * 2;

    if (cursor + width > spec.x + spec.maxWidth) break;

    const style = index === 0 ? spec.first : spec.second;
    const fillOpacity =
      index === 1 && spec.second.fillOpacity !== undefined
        ? ` fill-opacity="${spec.second.fillOpacity}"`
        : "";

    chips.push(
      `<rect x="${round(cursor)}" y="${round(spec.y)}" width="${round(width)}" height="${round(spec.h)}" rx="${spec.rx}" fill="${style.fill}"${fillOpacity}></rect>`,
      `<text x="${round(cursor + spec.padX)}" y="${round(spec.y + spec.textDy)}" font-size="${spec.size}" font-weight="700" letter-spacing="${spec.letterSpacing}" fill="${style.textFill}">${label}</text>`,
    );

    cursor += width + spec.gap;
  }

  return `<g id="professions">${chips.join("")}</g>`;
};

/* -------------------------------------------------------------- ability ---- */

export type AbilityContent = {
  /** Keyword display name, or "" for a card with none. */
  keyword: string;
  description: string;
};

/**
 * The ability panel.
 *
 * Commons are pure stats by design, and keywords are switched off entirely in
 * Phase 1, so the common case is a card with no keyword at all. Rather than
 * leave the panel blank, it says so - which also makes it obvious at a glance
 * whether keywords are live.
 */
export const abilityBlock = (
  spec: AbilitySpec,
  content: AbilityContent,
): string => {
  const opacity = spec.opacity !== undefined ? ` opacity="${spec.opacity}"` : "";
  const fontOptions = { fontSize: spec.size };

  if (!content.keyword) {
    const lines = wrapToWidth(
      content.description || "No ability — pure stats.",
      spec.maxWidth,
      spec.maxLines,
      fontOptions,
    );
    const spans = lines
      .map(
        (line, index) =>
          `<tspan x="${round(spec.x)}" y="${round(spec.y + index * spec.lineHeight)}">${escapeXml(line)}</tspan>`,
      )
      .join("");

    return `<text id="ability" font-size="${spec.size}" font-style="italic" fill="${spec.emptyFill}"${opacity}>${spans}</text>`;
  }

  const { firstLine, rest } = wrapAbility(
    content.keyword,
    content.description,
    spec.maxWidth,
    spec.maxLines,
    fontOptions,
  );

  const spans = [
    `<tspan x="${round(spec.x)}" y="${round(spec.y)}"><tspan font-weight="800" fill="${spec.keywordFill}">${escapeXml(content.keyword)}</tspan> — ${escapeXml(firstLine)}</tspan>`,
    ...rest.map(
      (line, index) =>
        `<tspan x="${round(spec.x)}" y="${round(spec.y + (index + 1) * spec.lineHeight)}">${escapeXml(line)}</tspan>`,
    ),
  ].join("");

  return `<text id="ability" font-size="${spec.size}" fill="${spec.fill}"${opacity}>${spans}</text>`;
};

/* ------------------------------------------------------------- flavour ---- */

export const flavourBlock = (
  spec: FlavourSpec | undefined,
  flavour: string,
): string => {
  if (!spec || !flavour) return "";

  const line = truncateToWidth(`“${flavour}”`, spec.maxWidth, {
    fontSize: spec.size,
  });

  return `<text id="flavour" x="${round(spec.x)}" y="${round(spec.y)}" font-size="${spec.size}" font-style="italic" fill="${spec.fill}">${escapeXml(line)}</text>`;
};

/* ------------------------------------------------------------ stat bar ---- */

/**
 * The stat bar, with the emphasis on whichever stat is the card's type.
 *
 * This is the piece that has to be generated rather than templated: in the
 * mockups the wide, filled, larger-typeface box sits wherever the lead stat
 * happens to be, so a Power card and a Heart card have different geometry. The
 * box widths come out of one ratio, so the bar always spans exactly `x0`→`x1`.
 */
export const statBarBlock = (
  spec: StatBarSpec,
  card: BattleCard,
): string => {
  if (spec.style === "inline") return inlineStatBar(spec, card);
  return boxedStatBar(spec, card);
};

const boxedStatBar = (
  spec: Extract<StatBarSpec, { style: "boxed" }>,
  card: BattleCard,
): string => {
  const total = spec.x1 - spec.x0;
  // narrow * 2 + narrow * leadRatio + gap * 2 = total
  const narrow = (total - spec.gap * 2) / (2 + spec.leadRatio);
  const wide = narrow * spec.leadRatio;

  const parts: string[] = [];
  let cursor = spec.x0;

  for (const type of TYPE_PRIORITY) {
    const isLead = type === card.type;
    const width = isLead ? wide : narrow;
    const labels = STAT_LABELS[type];

    if (isLead) {
      const labelOpacity =
        spec.lead.labelOpacity !== undefined
          ? ` fill-opacity="${spec.lead.labelOpacity}"`
          : "";
      parts.push(
        `<rect x="${round(cursor)}" y="${round(spec.y)}" width="${round(width)}" height="${round(spec.h)}" rx="${spec.rx}" fill="url(#typeLead)" stroke="none"></rect>`,
        `<text x="${round(cursor + spec.padX)}" y="${round(spec.y + spec.labelDy)}" font-family="JetBrains Mono, monospace" font-size="${spec.lead.labelSize}" letter-spacing="${spec.lead.labelLetterSpacing}" fill="${spec.lead.labelFill}"${labelOpacity}>${labels.full}</text>`,
        `<text x="${round(cursor + width - spec.padX)}" y="${round(spec.y + spec.valueDy)}" text-anchor="end" font-weight="800" font-size="${spec.lead.valueSize}" fill="${spec.lead.valueFill}">${card.stats[type]}</text>`,
      );
    } else {
      // The double-rare frame washes its boxes in translucent white; a plain
      // fill/stroke pair covers every other template.
      const translucent = spec.box.fill === "#ffffff" && spec.box.stroke === "#ffffff";
      const boxAttrs = translucent
        ? `fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.14"`
        : `fill="${spec.box.fill}" stroke="${spec.box.stroke}"`;
      const labelOpacity = translucent ? ` fill-opacity="0.6"` : "";

      parts.push(
        `<rect x="${round(cursor)}" y="${round(spec.y)}" width="${round(width)}" height="${round(spec.h)}" rx="${spec.rx}" ${boxAttrs}></rect>`,
        `<text x="${round(cursor + spec.padX)}" y="${round(spec.y + spec.labelDy)}" font-family="JetBrains Mono, monospace" font-size="${spec.label.size}" letter-spacing="${spec.label.letterSpacing}" fill="${spec.label.fill}"${labelOpacity}>${labels.short}</text>`,
        `<text x="${round(cursor + width - spec.padX)}" y="${round(spec.y + spec.valueDy)}" text-anchor="end" font-weight="800" font-size="${spec.value.size}" fill="${spec.value.fill}">${card.stats[type]}</text>`,
      );
    }

    cursor += width + spec.gap;
  }

  return `<g id="stat-bar">${parts.join("")}</g>`;
};

const inlineStatBar = (
  spec: Extract<StatBarSpec, { style: "inline" }>,
  card: BattleCard,
): string => {
  const parts: string[] = [];
  let cursor = spec.x;

  for (const type of TYPE_PRIORITY) {
    const isLead = type === card.type;
    const labels = STAT_LABELS[type];

    if (isLead) {
      // The divider separates the lead from what precedes it - so there is
      // nothing to divide when the lead stat is the first slot.
      const first = cursor === spec.x;
      const x = first ? cursor : cursor + spec.leadOffset;
      parts.push(
        first
          ? ""
          : `<rect x="${round(cursor + spec.divider.dx)}" y="${round(spec.divider.y)}" width="1" height="${round(spec.divider.h)}" fill="${spec.divider.fill}" opacity="${spec.divider.opacity}"></rect>`,
        `<text x="${round(x)}" y="${round(spec.leadLabelY)}" font-family="JetBrains Mono, monospace" font-size="${spec.lead.labelSize}" letter-spacing="${spec.lead.labelLetterSpacing}" fill="${spec.lead.labelFill}">${labels.full}</text>`,
        `<text x="${round(x)}" y="${round(spec.leadValueY)}" font-size="${spec.lead.valueSize}" font-weight="800"${spec.lead.italic ? ' font-style="italic"' : ""} fill="${spec.lead.valueFill}">${card.stats[type]}</text>`,
      );
      cursor = x + spec.leadAdvance;
    } else {
      parts.push(
        `<text x="${round(cursor)}" y="${round(spec.labelY)}" font-family="JetBrains Mono, monospace" font-size="${spec.label.size}" letter-spacing="${spec.label.letterSpacing}" fill="${spec.label.fill}" fill-opacity="${spec.label.opacity}">${labels.short}</text>`,
        `<text x="${round(cursor)}" y="${round(spec.valueY)}" font-size="${spec.value.size}" font-weight="800" fill="${spec.value.fill}" fill-opacity="${spec.value.opacity}">${card.stats[type]}</text>`,
      );
      cursor += spec.advance;
    }
  }

  return `<g id="stat-bar">${parts.join("")}</g>`;
};

/** Exported for tests: which stat the bar should emphasise. */
export const leadStatOf = (card: BattleCard): CardType => card.type;
