import sharp from "sharp";
import type { MatchResult, RoundResult, Side, SideCombat } from "../types";
import { tiebreakDamageOf } from "../battleEngine";
import { combatKeyword } from "../keywords";
import { coverCrop, loadArt, resolveArtSource } from "./generateCardImage";
import { RULES, TYPE_BEATS } from "../rules";
import { STAT_LABELS, TYPE_PALETTES } from "./palettes";
import { escapeXml, estimateWidth, truncateToWidth } from "./svgText";
import type { CardType } from "../../../types/PocketbaseTablesV2";

/**
 * The battle board: the whole match result as one image.
 *
 * The text result was correct but hard to scan - every round was a line of
 * names, emoji and arithmetic, and the eye had to parse all of it to find out
 * who won. The board answers that visually instead: a scoreboard up top, then
 * one row per round with the two cards facing each other, the winner lit and
 * the loser dimmed, and the damage scoreline between them.
 *
 * It follows the hand strip's reasoning: a single gallery item gets the full
 * message width, so the rows stack vertically rather than sitting side by side.
 * Each card carries its working (attack × multiplier − defence = damage) in a
 * faint line under its stat, and the header a faint reminder of the type wheel,
 * so the board explains itself without competing with the scoreline. Keyword
 * notes and the full breakdown stay in the text behind the button.
 *
 * Each card's art fills its panel, because the art is the best thing on the
 * card: the picture shows in the top of the panel and fades to dark under the
 * name and numbers. The loser's art goes grey as well as dim, so who took the
 * round reads from across the room.
 *
 * Side identity is by *position* (challenger left, defender right), not colour:
 * the side accents are the same indigo and rose as Wit and Heart, so colouring
 * by side would make every card's type ambiguous. The win highlight is gold for
 * the same reason.
 */

export const BOARD_UNITS = 460;
const WIDTH = BOARD_UNITS;
export const BOARD_PADDING = 8;
const PADDING = BOARD_PADDING;
const INNER = WIDTH - PADDING * 2;

const HEADER = { height: 56, gap: 6 };
const ROW = { height: 112, gap: 6 };
const FOOTER = { height: 22, gap: 6 };

/** Card panel on each side; the centre column holds the scoreline. */
export const PANEL = { width: 172 };
const CENTRE = { x: PANEL.width, width: INNER - PANEL.width * 2 };
/** Text inside a panel, from its outer edge (past the type spine). */
const TEXT = { inset: 12 };
/** The height the centre column was drawn for; taller rows centre it. */
const CENTRE_HEIGHT = 72;

const GOLD = "#FFD166";
export const PANEL_FILL = "#141728";
/** The board is opaque so it reads the same on Discord's light and dark themes. */
export const BOARD_FILL = "#0b0d18";
const DIM_TEXT_OPACITY = 0.45;

/** Rendered width in pixels, oversampled like the hand strip. */
export const BATTLE_BOARD_WIDTH = 1380;

const round = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

/** A true minus sign, so negative numbers and subtraction line up. */
const signed = (value: number): string =>
  value < 0 ? `\u2212${-value}` : String(value);

/**
 * The rest of the sum after the attack stat, which the stat label already
 * shows: " ×1.5 − 4 = 6", or " − 5 = 4" with no bonus.
 */
const working = (combat: SideCombat): string =>
  `${combat.multiplier === 1 ? "" : ` \u00d7${combat.multiplier}`} \u2212 ${combat.defenseFaced} = ${signed(combat.damage)}`;

/** "+3", "−2", or nothing - a keyword's change to a stat. */
const change = (amount: number): string =>
  amount === 0 ? "" : amount > 0 ? `+${amount}` : `\u2212${-amount}`;

/** "(7+3)×1.5 = 15", "7+3 = 10" or "9": an attack and what built it. */
export const attackSum = (combat: SideCombat): string => {
  const gained = change(combat.attackStat - combat.baseAttackStat);
  const sum = `${combat.baseAttackStat}${gained}`;
  if (combat.multiplier !== 1)
    return `${gained ? `(${sum})` : sum}\u00d7${combat.multiplier} = ${combat.attackValue}`;
  return gained ? `${sum} = ${combat.attackStat}` : sum;
};

/**
 * "5+2−1 = 6", or "5": the defence an attack hit and what built it, naming
 * the stat only when `Feint` moved it off the matching one.
 */
export const defenceSum = (combat: SideCombat): string => {
  const { defense } = combat;
  // Rounds stored before the parts were tracked only have the total.
  if (!defense) return `${combat.defenseFaced}`;
  const parts = `${defense.base}${change(defense.bonus)}${change(-defense.pierce)}`;
  const value =
    parts === `${defense.base}` ? parts : `${parts} = ${combat.defenseFaced}`;
  return defense.stat === combat.printedType
    ? value
    : `${value} ${STAT_LABELS[defense.stat].full}`;
};

/**
 * What a card's keyword did this round, for the line above its name.
 *
 * A bonus that landed is spelled out ("VANGUARD +3") and lit, because it is why
 * the stat underneath is bigger than the card's printed one. A keyword that sat
 * idle - `Last Stand` played in slot 1 - still shows, dimmed, so the wasted slot
 * is visible. A handed-on `Rally` counts as landing on the card that received it.
 *
 * `short` drops the amounts, for when a card's own bonus and a `Rally` together
 * are too wide for the panel.
 */
export const keywordTag = (
  roundResult: RoundResult,
  side: Side,
): { label: string; short: string; fired: boolean } | null => {
  const combat = roundResult[side];

  if (combat.bonuses.length > 0) {
    // "Guard (no multiplier vs this card)" - the name alone fits the panel.
    const labels = combat.bonuses.map((bonus) =>
      bonus.replace(/\s*\(.*\)$/, "").toUpperCase(),
    );
    return {
      label: labels.join(" \u00b7 "),
      short: labels
        .map((label) => label.replace(/\s+\S*\d\S*$/, ""))
        .join(" \u00b7 "),
      fired: true,
    };
  }

  const keyword = RULES.keywordsEnabled ? combatKeyword(combat) : null;
  if (!keyword) return null;

  /* Keywords that change the outcome or hand something on (`First Strike`,
     `Rally`) leave a round note naming the side rather than a bonus. */
  const fired = roundResult.notes.some(
    (note) => note.startsWith(`${keyword.name}:`) && note.includes(side),
  );
  const label = keyword.name.toUpperCase();
  /* Tiebreak keywords touch only the total, so leave no trace in the round:
     this card's own count changed, or it changed the opposing card's. */
  const other: Side = side === "challenger" ? "defender" : "challenger";
  const mine = tiebreakDamageOf(roundResult, side, RULES);
  const theirs = tiebreakDamageOf(roundResult, other, RULES);
  return {
    label,
    short: label,
    fired: fired || mine.own !== mine.dealt || theirs.counted !== theirs.own,
  };
};

/** Room for the tag along the top: the WIN chip takes the inner corner of a winning panel. */
const KEYWORD_TAG = { width: 132, widthBesideChip: 104, letterSpacing: 0.6 };

/** The widest form of the tag that fits, shrinking the type before cutting it. */
const fitKeywordTag = (
  tag: { label: string; short: string },
  width: number,
): { text: string; fontSize: number } => {
  const attempts = [
    { text: tag.label, fontSize: 6 },
    { text: tag.short, fontSize: 6 },
    { text: tag.short, fontSize: 5 },
  ];
  for (const attempt of attempts) {
    const options = {
      fontSize: attempt.fontSize,
      letterSpacing: KEYWORD_TAG.letterSpacing,
      bold: true,
    };
    if (truncateToWidth(attempt.text, width, options) === attempt.text) {
      return attempt;
    }
  }
  return {
    text: truncateToWidth(tag.short, width, {
      fontSize: 5,
      letterSpacing: KEYWORD_TAG.letterSpacing,
      bold: true,
    }),
    fontSize: 5,
  };
};

/**
 * Outline glyphs for each type, drawn in a 10×10 box: a flexed arm for Power, a
 * brain for Wit, a heart for Heart. They tag the working line so the type it was
 * fought in reads at a glance, without spelling the stat name out again.
 */
export const TYPE_ICON_PATHS: Record<CardType, string> = {
  power:
    "M1 9 L1 7.2 C1 4.2 4.8 3 6.3 5.2 L6.3 4.3 C5 4.1 4.6 2.4 5.6 1.6 C6.6 0.8 8.7 0.9 9 2.6 L8.9 7.8 C8.8 8.6 8.2 9 7.4 9 Z M2.9 6.7 C3.5 5.8 4.6 5.6 5.4 6.1",
  wit: "M5 2 C3.6 1 1.8 1.9 2 3.6 C0.8 4.2 0.8 6.2 2.2 6.6 C2.2 8.2 4 8.9 5 8 C6 8.9 7.8 8.2 7.8 6.6 C9.2 6.2 9.2 4.2 8 3.6 C8.2 1.9 6.4 1 5 2 Z M5 2 V8 M3.2 4.4 C4 4.6 4 5.4 3.4 5.8 M6.8 4.4 C6 4.6 6 5.4 6.6 5.8",
  heart: "M5 8.8 L1.7 5.4 A2.1 2.1 0 0 1 5 2.8 A2.1 2.1 0 0 1 8.3 5.4 Z",
};
/**
 * A card's art, cropped to fill a panel. Grey for the round's loser. Null
 * when the card has none, which leaves a flat panel.
 */
export const panelArt = async (
  card: SideCombat["card"],
  width: number,
  height: number,
  grey: boolean,
): Promise<string | null> => {
  try {
    const source = await resolveArtSource({
      art_url: card.artUrl,
      legacy_card: card.legacyCard,
      art_adjust: card.artAdjust,
    });
    const input = await loadArt(source);
    if (!input) return null;
    // The focus a third of the way down, in the clear part of the art above
    // the text - not the middle, where the name would sit on the subject.
    let png = await coverCrop(input, width, height, {
      focus: source?.adjust?.focus,
      focusAt: { x: 0.5, y: 1 / 3 },
    });
    if (grey) png = await sharp(png).grayscale().png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
};

export type Outcome = "won" | "lost" | "draw";

export const outcomeFor = (roundResult: RoundResult, side: Side): Outcome =>
  roundResult.winner === "draw"
    ? "draw"
    : roundResult.winner === side
      ? "won"
      : "lost";

/**
 * One side's card, laid out mirror-image for the defender: the art filling
 * the panel, the type spine on its outer edge, and the name, stat and
 * working along the bottom over a fade to dark. `id` keeps the clip paths
 * apart when a board holds several.
 */
export const cardPanel = (
  roundResult: RoundResult,
  side: Side,
  artUri: string | null,
  height: number,
  id: string,
  /** Off when a breakdown elsewhere in the image already shows the sum. */
  showWorking = true,
): string => {
  const combat = roundResult[side];
  const outcome = outcomeFor(roundResult, side);
  const palette = TYPE_PALETTES[combat.printedType];
  const mirrored = side === "defender";
  const x0 = mirrored ? INNER - PANEL.width : 0;

  /* Positions are written for the challenger and flipped for the defender, so
     the two cards meet in the middle and the text sits on the outside edge. */
  const fromOuter = (offset: number, width = 0) =>
    mirrored ? x0 + PANEL.width - offset - width : x0 + offset;

  const textX = fromOuter(TEXT.inset);
  const anchor = mirrored ? "end" : "start";
  const textWidth = PANEL.width - TEXT.inset * 2;

  const name = truncateToWidth(combat.card.name, textWidth, {
    fontSize: 13,
    bold: true,
  });
  const statLabel = STAT_LABELS[combat.printedType].full;
  /* One line says how the damage was reached: the stat in its type's colour,
     a keyword's gain on it in gold, then the rest of the sum dimmed -
     "POWER 7+3 ×1.5 − 2 = 13". */
  const gained = combat.attackStat - combat.baseAttackStat;
  const boost =
    gained === 0
      ? ""
      : `<tspan fill="${GOLD}">${gained > 0 ? "+" : "\u2212"}${Math.abs(gained)}</tspan>`;
  const tag = keywordTag(roundResult, side);
  const fittedTag = tag
    ? fitKeywordTag(
        tag,
        outcome === "won" ? KEYWORD_TAG.widthBesideChip : KEYWORD_TAG.width,
      )
    : null;

  const clip = `panel-${id}-${side}`;
  const fade = `fade-${id}-${side}`;
  const base = height - 10;

  const parts = [
    `<defs>`,
    `<clipPath id="${clip}"><rect x="${x0}" y="0" width="${PANEL.width}" height="${height}" rx="8"></rect></clipPath>`,
    // Clear over the top of the art, dark under the text.
    `<linearGradient id="${fade}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="${PANEL_FILL}" stop-opacity="0"></stop><stop offset="0.72" stop-color="${PANEL_FILL}" stop-opacity="0.75"></stop><stop offset="1" stop-color="${PANEL_FILL}" stop-opacity="0.96"></stop></linearGradient>`,
    `</defs>`,
    `<g clip-path="url(#${clip})">`,
    `<rect x="${x0}" y="0" width="${PANEL.width}" height="${height}" fill="${PANEL_FILL}"></rect>`,
    artUri
      ? `<image x="${x0}" y="0" width="${PANEL.width}" height="${height}" preserveAspectRatio="xMidYMid slice" xlink:href="${artUri}"></image>`
      : `<rect x="${x0}" y="0" width="${PANEL.width}" height="${height}" fill="${palette.deep}" fill-opacity="0.35"></rect>`,
    `<rect x="${x0}" y="0" width="${PANEL.width}" height="${height}" fill="url(#${fade})"></rect>`,
    // Type spine on the outer edge, as on the hand strip.
    `<rect x="${round(fromOuter(0, 4))}" y="0" width="4" height="${height}" fill="${palette.bright}"></rect>`,
    `</g>`,
    `<text x="${round(textX)}" y="${base - 14}" text-anchor="${anchor}" font-size="14" font-weight="800" fill="#ffffff">${escapeXml(name)}</text>`,
    `<text xml:space="preserve" x="${round(textX)}" y="${base}" text-anchor="${anchor}" font-family="JetBrains Mono, monospace" font-size="8" font-weight="700" letter-spacing="0.4" fill="${palette.bright}">${statLabel} ${combat.baseAttackStat}${boost}${showWorking ? `<tspan fill="#ffffff" fill-opacity="0.6" font-weight="500">${working(combat)}</tspan>` : ""}</text>`,
  ];

  if (tag && fittedTag) {
    // On a dark pill, since it sits over the brightest part of the art.
    const pillWidth =
      estimateWidth(
        fittedTag.text,
        fittedTag.fontSize,
        KEYWORD_TAG.letterSpacing,
        true,
      ) + 10;
    const pillX = fromOuter(TEXT.inset - 5, pillWidth);
    parts.push(
      `<rect x="${round(pillX)}" y="7" width="${round(pillWidth)}" height="12" rx="6" fill="${BOARD_FILL}" fill-opacity="0.78"></rect>`,
      `<text x="${round(pillX + pillWidth / 2)}" y="${round(13 + fittedTag.fontSize * 0.36)}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="${fittedTag.fontSize}" font-weight="800" letter-spacing="${KEYWORD_TAG.letterSpacing}" fill="${tag.fired ? GOLD : "#ffffff"}" fill-opacity="${tag.fired ? 1 : 0.6}">${escapeXml(fittedTag.text)}</text>`,
    );
  }

  if (outcome === "won") {
    // Gold frame and a WIN chip in the corner nearest the scoreline.
    const chipX = mirrored ? x0 + 7 : x0 + PANEL.width - 7 - 30;
    parts.push(
      `<rect x="${x0 + 0.9}" y="0.9" width="${PANEL.width - 1.8}" height="${height - 1.8}" rx="7.5" fill="none" stroke="${GOLD}" stroke-width="1.8"></rect>`,
      `<rect x="${chipX}" y="7" width="30" height="12" rx="6" fill="${GOLD}"></rect>`,
      `<text x="${chipX + 15}" y="15.6" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="7" font-weight="800" letter-spacing="0.8" fill="#2a1f00">WIN</text>`,
    );
  }

  /* The loser is greyed and dimmed rather than hidden: you still want to see
     what lost. An overlay rather than group opacity, which would let the board
     show through and wash the card out. */
  if (outcome === "lost") {
    parts.push(
      `<rect x="${x0}" y="0" width="${PANEL.width}" height="${height}" rx="8" fill="${BOARD_FILL}" fill-opacity="0.45"></rect>`,
    );
  }

  return parts.join("");
};

/**
 * The scoreline and the multiplier between the two cards, centred in the row.
 * `label` heads it - "ROUND 2" by default; null for a fight that's one round.
 */
export const centreColumn = (
  roundResult: RoundResult,
  height: number,
  label: string | null = `ROUND ${roundResult.slot}`,
): string => {
  const cx = CENTRE.x + CENTRE.width / 2;
  const { challenger, defender, winner } = roundResult;

  const score = (combat: SideCombat, side: Side) => {
    const lit = winner === side;
    const drawn = winner === "draw";
    const x = side === "challenger" ? cx - 10 : cx + 10;
    return `<text x="${x}" y="43" text-anchor="${
      side === "challenger" ? "end" : "start"
    }" font-size="${lit ? 24 : 20}" font-weight="800" fill="${
      lit ? GOLD : "#ffffff"
    }" fill-opacity="${lit || drawn ? 1 : DIM_TEXT_OPACITY}">${
      combat.damage
    }</text>`;
  };

  const parts = [
    `<g transform="translate(0 ${round((height - CENTRE_HEIGHT) / 2)})">`,
    label
      ? `<text x="${cx}" y="15" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="7" font-weight="700" letter-spacing="1.2" fill="#ffffff" fill-opacity="0.5">${label}</text>`
      : "",
    score(challenger, "challenger"),
    // "VS" rather than a dash: negative damage is legal, and "4 – -4" misreads.
    `<text x="${cx}" y="39" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="6.5" font-weight="700" fill="#ffffff" fill-opacity="0.35">VS</text>`,
    score(defender, "defender"),
  ];

  /* Normally only one side can hold the multiplier. The chip is coloured by the
     type that earned it and points at the card that got it. `Adapt` is the
     exception: it can hand its card the bonus while the opponent holds the
     natural one, and then the chip points at nobody. */
  const both = challenger.multiplier > 1 && defender.multiplier > 1;
  const bonused: Side | null = both
    ? null
    : challenger.multiplier > 1
      ? "challenger"
      : defender.multiplier > 1
        ? "defender"
        : null;

  const chip = { width: 72, height: 13, y: 52 };
  const chipX = cx - chip.width / 2;

  if (bonused) {
    const combat = roundResult[bonused];
    const palette = TYPE_PALETTES[combat.attackType];
    const label = `${STAT_LABELS[combat.attackType].full} ×${
      combat.multiplier
    }`;
    const tipY = chip.y + chip.height / 2;
    const arrow =
      bonused === "challenger"
        ? `<polygon points="${chipX + 5},${tipY} ${chipX + 10},${tipY - 3.5} ${
            chipX + 10
          },${tipY + 3.5}" fill="#ffffff"></polygon>`
        : `<polygon points="${chipX + chip.width - 5},${tipY} ${
            chipX + chip.width - 10
          },${tipY - 3.5} ${chipX + chip.width - 10},${
            tipY + 3.5
          }" fill="#ffffff"></polygon>`;

    parts.push(
      `<rect x="${chipX}" y="${chip.y}" width="${chip.width}" height="${chip.height}" rx="6.5" fill="${palette.deep}"></rect>`,
      arrow,
      `<text x="${cx}" y="${
        chip.y + 9.3
      }" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="7" font-weight="800" letter-spacing="0.5" fill="#ffffff">${label}</text>`,
    );
  } else {
    const label = both
      ? `BOTH ×${challenger.multiplier}`
      : challenger.printedType === defender.printedType
        ? "MIRROR"
        : "NO BONUS";
    parts.push(
      `<rect x="${chipX}" y="${chip.y}" width="${chip.width}" height="${chip.height}" rx="6.5" fill="none" stroke="#ffffff" stroke-opacity="0.18"></rect>`,
      `<text x="${cx}" y="${
        chip.y + 9.3
      }" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="7" font-weight="700" letter-spacing="0.8" fill="#ffffff" fill-opacity="0.5">${label}</text>`,
    );
  }

  parts.push("</g>");
  return parts.join("");
};

const roundRow = (
  roundResult: RoundResult,
  index: number,
  art: Record<Side, string | null>,
): string =>
  [
    `<g transform="translate(0 ${
      HEADER.height + HEADER.gap + index * (ROW.height + ROW.gap)
    })">`,
    cardPanel(roundResult, "challenger", art.challenger, ROW.height, `r${index}`),
    centreColumn(roundResult, ROW.height),
    cardPanel(roundResult, "defender", art.defender, ROW.height, `r${index}`),
    `</g>`,
  ].join("");

/**
 * "POWER › WIT › HEART › POWER ×1.5", each type in its own colour: a quiet
 * reminder of the wheel for anyone wondering why a chip appeared.
 */
const typeWheel = (result: MatchResult, cx: number, y: number): string => {
  const cycle = [
    "power",
    TYPE_BEATS.power,
    TYPE_BEATS[TYPE_BEATS.power],
    "power",
  ] as const;
  const spans = cycle
    .map(
      (type) =>
        `<tspan fill="${TYPE_PALETTES[type].bright}">${STAT_LABELS[type].full}</tspan>`,
    )
    .join(`<tspan fill="#ffffff" fill-opacity="0.5"> \u203a </tspan>`);
  return `<text xml:space="preserve" x="${cx}" y="${y}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="6" font-weight="700" letter-spacing="0.8" fill-opacity="0.55">${spans}<tspan fill="#ffffff" fill-opacity="0.5">  \u00d7${result.rules.typeMultiplier}</tspan></text>`;
};

/** Names and rounds won, scoreboard style. */
const header = (result: MatchResult, names: Record<Side, string>): string => {
  const cx = INNER / 2;
  const nameWidth = cx - 50;

  const side = (key: Side) => {
    const won = result.winner === key;
    const x = key === "challenger" ? 14 : INNER - 14;
    const anchor = key === "challenger" ? "start" : "end";
    const name = truncateToWidth(names[key], nameWidth, {
      fontSize: 14,
      bold: true,
    });
    const role = won
      ? "WINNER"
      : key === "challenger"
        ? "CHALLENGER"
        : "DEFENDER";

    return [
      `<text x="${x}" y="22" text-anchor="${anchor}" font-size="14" font-weight="800" fill="${
        won ? GOLD : "#ffffff"
      }">${escapeXml(name)}</text>`,
      `<text x="${x}" y="35" text-anchor="${anchor}" font-family="JetBrains Mono, monospace" font-size="7" font-weight="700" letter-spacing="1.2" fill="${
        won ? GOLD : "#ffffff"
      }" fill-opacity="${won ? 0.9 : 0.45}">${role}</text>`,
      `<text x="${
        key === "challenger" ? cx - 14 : cx + 14
      }" y="32" text-anchor="${
        key === "challenger" ? "end" : "start"
      }" font-size="26" font-weight="800" fill="${
        won ? GOLD : "#ffffff"
      }" fill-opacity="${won || result.winner === "draw" ? 1 : 0.55}">${
        result.roundsWon[key]
      }</text>`,
    ].join("");
  };

  return [
    `<rect x="0" y="0" width="${INNER}" height="${HEADER.height}" rx="8" fill="${PANEL_FILL}"></rect>`,
    side("challenger"),
    `<text x="${cx}" y="30" text-anchor="middle" font-size="16" font-weight="700" fill="#ffffff" fill-opacity="0.35">–</text>`,
    result.winner === "draw"
      ? `<text x="${cx}" y="40.5" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="7" font-weight="700" letter-spacing="1.2" fill="#ffffff" fill-opacity="0.6">DRAW</text>`
      : "",
    typeWheel(result, cx, HEADER.height - 6.5),
    side("defender"),
  ].join("");
};

/** Total damage - the tiebreaker - called out in gold when it decided things. */
const footer = (result: MatchResult, top: number): string => {
  const cx = INNER / 2;
  const decisive = result.decidedBy === "damage";
  const label = decisive ? "DECIDED ON TOTAL DAMAGE" : "TOTAL DAMAGE";

  return [
    `<rect x="0" y="${top}" width="${INNER}" height="${FOOTER.height}" rx="6" fill="${PANEL_FILL}"></rect>`,
    `<text x="${cx}" y="${
      top + 14.5
    }" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8" font-weight="700" letter-spacing="1" fill="${
      decisive ? GOLD : "#ffffff"
    }" fill-opacity="${decisive ? 1 : 0.55}">${label}  ${
      result.tiebreakDamage.challenger
    } – ${result.tiebreakDamage.defender}</text>`,
  ].join("");
};

/**
 * Renders a match result as one image, or null if rendering fails - callers fall
 * back to the text rounds. Missing art degrades to a flat panel per card.
 */
export const renderBattleBoard = async (
  result: MatchResult,
  names: Record<Side, string>,
  options: { width?: number } = {},
): Promise<Buffer | null> => {
  if (result.rounds.length === 0) return null;

  try {
    const width = options.width ?? BATTLE_BOARD_WIDTH;
    const scale = width / WIDTH;
    const artFor = (r: RoundResult, side: Side) =>
      panelArt(
        r[side].card,
        Math.round(PANEL.width * scale),
        Math.round(ROW.height * scale),
        outcomeFor(r, side) === "lost",
      );

    const art = await Promise.all(
      result.rounds.map(async (r) => {
        const [challenger, defender] = await Promise.all([
          artFor(r, "challenger"),
          artFor(r, "defender"),
        ]);
        return { challenger, defender };
      }),
    );

    const footerTop =
      HEADER.height +
      HEADER.gap +
      result.rounds.length * (ROW.height + ROW.gap) -
      ROW.gap +
      FOOTER.gap;
    const height = footerTop + FOOTER.height + PADDING * 2;

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="Archivo, sans-serif">`,
      `<rect x="0" y="0" width="${WIDTH}" height="${height}" rx="12" fill="${BOARD_FILL}"></rect>`,
      `<g transform="translate(${PADDING} ${PADDING})">`,
      header(result, names),
      ...result.rounds.map((r, index) => roundRow(r, index, art[index])),
      footer(result, footerTop),
      `</g>`,
      `</svg>`,
    ].join("");

    return await sharp(Buffer.from(svg), { density: 300 })
      .resize({ width })
      .png()
      .toBuffer();
  } catch (error) {
    console.error("Couldn't render a v2 battle board:", error);
    return null;
  }
};

/** Attachment filename. Fixed: there is only ever one board per message. */
export const BATTLE_BOARD_FILE = "battle-board.png";
