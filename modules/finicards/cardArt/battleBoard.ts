import sharp from "sharp";
import type { MatchResult, RoundResult, Side, SideCombat } from "../types";
import { tiebreakDamageOf } from "../battleEngine";
import { combatKeyword } from "../keywords";
import { resolveArtSource } from "./generateCardImage";
import { squareArt } from "./handStrip";
import { RULES, TYPE_BEATS } from "../rules";
import { STAT_LABELS, TYPE_PALETTES } from "./palettes";
import { escapeXml, truncateToWidth } from "./svgText";
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
 * Side identity is by *position* (challenger left, defender right), not colour:
 * the side accents are the same indigo and rose as Wit and Heart, so colouring
 * by side would make every card's type ambiguous. The win highlight is gold for
 * the same reason.
 */

const WIDTH = 460;
const PADDING = 8;
const INNER = WIDTH - PADDING * 2;

const HEADER = { height: 56, gap: 6 };
const ROW = { height: 72, gap: 6 };
const FOOTER = { height: 22, gap: 6 };

/** Card panel on each side; the centre column holds the scoreline. */
const PANEL = { width: 172 };
const CENTRE = { x: PANEL.width, width: INNER - PANEL.width * 2 };
const ART = { inset: 10, y: 8, size: 56 };
/** Text column inside a panel, measured from the art's inner edge. */
const TEXT = { offset: 8, width: 84 };

const GOLD = "#FFD166";
const PANEL_FILL = "#141728";
/** The board is opaque so it reads the same on Discord's light and dark themes. */
const BOARD_FILL = "#0b0d18";
const DIM_TEXT_OPACITY = 0.45;

/** Rendered width in pixels, oversampled like the hand strip. */
export const BATTLE_BOARD_WIDTH = 1380;

const round = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

/** A true minus sign, so negative numbers and subtraction line up. */
const signed = (value: number): string =>
  value < 0 ? `\u2212${-value}` : String(value);

/** How the damage was reached: "7×1.5 − 4 = 6", or "9 − 5 = 4" with no bonus. */
const working = (combat: SideCombat): string => {
  const attack =
    combat.multiplier === 1
      ? String(combat.attackStat)
      : `${combat.attackStat}×${combat.multiplier}`;
  return `${attack} \u2212 ${combat.defenseFaced} = ${signed(combat.damage)}`;
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

/** Room for the tag: the WIN chip takes the inner corner of a winning panel. */
const KEYWORD_TAG = { width: 88, widthBesideChip: 62, letterSpacing: 0.6 };

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
const ICON = { size: 8.5, gap: 2 };

const typeIcon = (type: CardType, x: number, y: number): string =>
  `<path transform="translate(${round(x)} ${round(y)}) scale(${
    ICON.size / 10
  })" d="${TYPE_ICON_PATHS[type]}" fill="none" stroke="${
    TYPE_PALETTES[type].bright
  }" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.85"></path>`;

/** One side's card, laid out mirror-image for the defender. */
const cardPanel = (
  roundResult: RoundResult,
  side: Side,
  outcome: "won" | "lost" | "draw",
  row: number,
  artUri: string | null,
): string => {
  const combat = roundResult[side];
  const palette = TYPE_PALETTES[combat.printedType];
  const mirrored = side === "defender";
  const x0 = mirrored ? INNER - PANEL.width : 0;

  /* Positions are written for the challenger and flipped for the defender, so
     the two cards meet in the middle and the art sits on the outside edge. */
  const fromOuter = (offset: number, width = 0) =>
    mirrored ? x0 + PANEL.width - offset - width : x0 + offset;

  const artX = fromOuter(ART.inset, ART.size);
  const textX = fromOuter(ART.inset + ART.size + TEXT.offset);
  const anchor = mirrored ? "end" : "start";

  const name = truncateToWidth(combat.card.name, TEXT.width, {
    fontSize: 12.5,
    bold: true,
  });
  const statLabel = STAT_LABELS[combat.printedType].full;
  /* A keyword bonus is shown as the printed stat plus the gain, in gold, so the
     bigger number in the working line underneath has a visible source. */
  const gained = combat.attackStat - combat.baseAttackStat;
  const boost =
    gained === 0
      ? ""
      : `<tspan dx="3" fill="${GOLD}">${gained > 0 ? "+" : "\u2212"}${Math.abs(gained)}</tspan>`;
  const tag = keywordTag(roundResult, side);
  const fittedTag = tag
    ? fitKeywordTag(
        tag,
        outcome === "won" ? KEYWORD_TAG.widthBesideChip : KEYWORD_TAG.width,
      )
    : null;

  /* The icon sits on the art side of the working line - leading it for the
     challenger, trailing it for the defender - so it mirrors like the rest of
     the panel and never depends on guessing the text's rendered width. */
  const iconX = mirrored ? textX - ICON.size : textX;
  const workingX = mirrored
    ? textX - ICON.size - ICON.gap
    : textX + ICON.size + ICON.gap;

  const parts = [
    `<clipPath id="panel-${side}-${row}"><rect x="${x0}" y="0" width="${PANEL.width}" height="${ROW.height}" rx="8"></rect></clipPath>`,
    `<g clip-path="url(#panel-${side}-${row})">`,
    `<rect x="${x0}" y="0" width="${PANEL.width}" height="${ROW.height}" fill="${PANEL_FILL}"></rect>`,
    `<rect x="${x0}" y="0" width="${PANEL.width}" height="${ROW.height}" fill="${palette.deep}" fill-opacity="0.16"></rect>`,
    // Type spine on the outer edge, as on the hand strip.
    `<rect x="${round(fromOuter(0, 4))}" y="0" width="4" height="${
      ROW.height
    }" fill="${palette.bright}"></rect>`,
    `</g>`,
    `<clipPath id="art-${side}-${row}"><rect x="${round(artX)}" y="${
      ART.y
    }" width="${ART.size}" height="${ART.size}" rx="6"></rect></clipPath>`,
    artUri
      ? `<image x="${round(artX)}" y="${ART.y}" width="${ART.size}" height="${
          ART.size
        }" clip-path="url(#art-${side}-${row})" preserveAspectRatio="xMidYMid slice" xlink:href="${artUri}"></image>`
      : `<rect x="${round(artX)}" y="${ART.y}" width="${ART.size}" height="${
          ART.size
        }" rx="6" fill="#252a44"></rect>`,
    `<text x="${round(
      textX,
    )}" y="31" text-anchor="${anchor}" font-size="12.5" font-weight="800" fill="#ffffff">${escapeXml(
      name,
    )}</text>`,
    `<text x="${round(
      textX,
    )}" y="46" text-anchor="${anchor}" font-family="JetBrains Mono, monospace" font-size="8" font-weight="700" letter-spacing="0.8" fill="${
      palette.bright
    }">${statLabel} ${combat.baseAttackStat}${boost}</text>`,
    tag && fittedTag
      ? `<text x="${round(
          textX,
        )}" y="17" text-anchor="${anchor}" font-family="JetBrains Mono, monospace" font-size="${
          fittedTag.fontSize
        }" font-weight="800" letter-spacing="${
          KEYWORD_TAG.letterSpacing
        }" fill="${tag.fired ? GOLD : "#ffffff"}" fill-opacity="${
          tag.fired ? 0.95 : 0.35
        }">${escapeXml(fittedTag.text)}</text>`
      : "",
    typeIcon(combat.printedType, iconX, 52.4),
    `<text x="${round(
      workingX,
    )}" y="59" text-anchor="${anchor}" font-family="JetBrains Mono, monospace" font-size="6.5" font-weight="500" fill="#ffffff" fill-opacity="0.4">${working(
      combat,
    )}</text>`,
  ];

  if (outcome === "won") {
    // Gold frame and a WIN chip in the corner nearest the scoreline.
    const chipX = mirrored ? x0 + 6 : x0 + PANEL.width - 6 - 28;
    parts.push(
      `<rect x="${x0 + 0.75}" y="0.75" width="${PANEL.width - 1.5}" height="${
        ROW.height - 1.5
      }" rx="7.5" fill="none" stroke="${GOLD}" stroke-width="1.5"></rect>`,
      `<rect x="${chipX}" y="6" width="28" height="11" rx="5.5" fill="${GOLD}"></rect>`,
      `<text x="${
        chipX + 14
      }" y="14.2" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="7" font-weight="800" letter-spacing="0.8" fill="#2a1f00">WIN</text>`,
    );
  }

  /* The loser is dimmed rather than hidden: you still want to see what lost.
     An overlay rather than group opacity, which would let the board show
     through and wash the card out to grey. */
  if (outcome === "lost") {
    parts.push(
      `<rect x="${x0}" y="0" width="${PANEL.width}" height="${ROW.height}" rx="8" fill="${BOARD_FILL}" fill-opacity="0.55"></rect>`,
    );
  }

  return parts.join("");
};

/** The scoreline and the multiplier between the two cards. */
const centreColumn = (roundResult: RoundResult): string => {
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
    `<text x="${cx}" y="15" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="7" font-weight="700" letter-spacing="1.2" fill="#ffffff" fill-opacity="0.5">ROUND ${roundResult.slot}</text>`,
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

  return parts.join("");
};

const roundRow = (
  roundResult: RoundResult,
  index: number,
  art: Record<Side, string | null>,
): string => {
  const outcomeFor = (side: Side) =>
    roundResult.winner === "draw"
      ? "draw"
      : roundResult.winner === side
        ? "won"
        : "lost";

  return [
    `<g transform="translate(0 ${
      HEADER.height + HEADER.gap + index * (ROW.height + ROW.gap)
    })">`,
    cardPanel(
      roundResult,
      "challenger",
      outcomeFor("challenger"),
      index,
      art.challenger,
    ),
    centreColumn(roundResult),
    cardPanel(
      roundResult,
      "defender",
      outcomeFor("defender"),
      index,
      art.defender,
    ),
    `</g>`,
  ].join("");
};

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
    const artPixels = Math.round(ART.size * (width / WIDTH));

    const artFor = async (combat: SideCombat) =>
      squareArt(
        await resolveArtSource({
          art_url: combat.card.artUrl,
          legacy_card: combat.card.legacyCard,
          art_adjust: combat.card.artAdjust,
        }),
        artPixels,
      );

    const art = await Promise.all(
      result.rounds.map(async (r) => {
        const [challenger, defender] = await Promise.all([
          artFor(r.challenger),
          artFor(r.defender),
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
