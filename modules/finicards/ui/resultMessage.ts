import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { BATTLE_BOARD_FILE, renderBattleBoard } from "../cardArt";
import type { PotSplit } from "../wagers";
import type { MatchResult, RoundResult, Side, SideCombat } from "../types";
import { tiebreakDamageOf } from "../battleEngine";
import { combatKeyword, type KeywordDefinition } from "../keywords";
import { TYPE_EMOJI } from "../rules";
import {
  DRAW_ACCENT,
  SIDE_ACCENT,
  TYPE_NAME,
  explainMultiplier,
} from "./theme";

/**
 * The match result.
 *
 * The rounds are an image - the battle board, see `renderBattleBoard` - with
 * the text rounds kept only as a fallback for when it fails to render.
 *
 * This has been through both failure modes. The first version showed only the
 * arithmetic, so a player could see that a card hit for 7 but not why. The fix
 * for that spelled out the matchup, both damage calculations and the outcome on
 * five separate lines - correct, complete, and far too much to read three times
 * over. So the layout now splits by *need*: the headline of each round carries
 * who fought and who won, and the derivation sits underneath in small text for
 * anyone who wants it. Full working is still available behind a button.
 *
 * Even two lines a round was a wall of names, emoji and arithmetic, so the
 * headline job - who fought whom and who won - moved into the board, where the
 * winner is lit and the loser dimmed and nothing needs parsing.
 */

export type ResultMessageInput = {
  result: MatchResult;
  names: Record<Side, string>;
  userIds: Record<Side, string>;
  split?: PotSplit | null;
  /** Battle id, for the full-breakdown button. Omitted, no button is shown. */
  battleId?: string;
  /** One player on both sides, so there is nobody to mention. */
  practice?: boolean;
};

/** The full working for every round, for the detail view behind the button. */
export const buildBreakdown = (
  result: MatchResult,
  names: Record<Side, string>,
): string =>
  [
    ...result.rounds.map((round) => verboseRound(round, names)),
    // What each keyword in the match does, for reading the bonuses above.
    ...(keywordsOf(result).length > 0
      ? [
          keywordsOf(result)
            .map((keyword) => `-# **${keyword.name}** — ${keyword.description}`)
            .join("\n"),
        ]
      : []),
  ].join("\n\n");

const SIDES: Side[] = ["challenger", "defender"];

/** `+3`, `-2` - plain ASCII, so a code block's columns stay lined up. */
const offset = (amount: number): string =>
  amount === 0 ? "" : amount > 0 ? `+${amount}` : `${amount}`;

/** `6+3=9`, `(6+3)x1.5=13`, or just `7` - an attack and what built it. */
const attackCell = (combat: SideCombat): string => {
  const change = offset(combat.attackStat - combat.baseAttackStat);
  const sum = `${combat.baseAttackStat}${change}`;
  if (combat.multiplier !== 1) {
    return `${change ? `(${sum})` : sum}x${combat.multiplier}=${combat.attackValue}`;
  }
  return change ? `${sum}=${combat.attackStat}` : sum;
};

/** `7+2=9`, `5+2-3=4 Heart` - the defence an attack hit and what built it. */
const defenseCell = (combat: SideCombat): string => {
  const { defense } = combat;
  // Rounds stored before the parts were tracked only have the total.
  if (!defense) return `${combat.defenseFaced}`;
  const parts = `${defense.base}${offset(defense.bonus)}${offset(-defense.pierce)}`;
  const value =
    parts === `${defense.base}` ? parts : `${parts}=${combat.defenseFaced}`;
  // Only worth naming the stat when `Feint` moved it off the matching one.
  return defense.stat === combat.printedType
    ? value
    : `${value} ${TYPE_NAME[defense.stat]}`;
};

const NAME_WIDTH = 18;

const fitName = (name: string): string =>
  name.length > NAME_WIDTH ? `${name.slice(0, NAME_WIDTH - 1)}…` : name;

/**
 * Both attacks of a round as a small table: each card's attack, the defence it
 * hit, and the damage that left. Every bonus sits in the cell it changed, so a
 * `Bulwark` shows on the attack it blocked rather than on its own card's swing.
 * A code block, because Discord renders no markdown tables, ruled with
 * box-drawing lines so the cells read apart.
 */
export const damageTable = (round: RoundResult): string => {
  const rows = [
    ["", "Attack", "Defence", "Dmg"],
    ...SIDES.map((side) => {
      const combat = round[side];
      return [
        fitName(combat.card.name),
        attackCell(combat),
        defenseCell(combat),
        `${combat.damage}`,
      ];
    }),
  ];
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length)),
  );
  const line = (row: string[]) =>
    row
      .map((cell, column) =>
        column === row.length - 1
          ? cell.padStart(widths[column])
          : cell.padEnd(widths[column]),
      )
      .join(" │ ");
  const rule = widths.map((width) => "─".repeat(width)).join("─┼─");
  const [header, ...body] = rows.map(line);
  return ["```", header, rule, ...body, "```"].join("\n");
};

/** `Nico Robin: Giant Slayer +3 · Hinata Hyuga: Bulwark +2 def` - who did what. */
const bonusNote = (round: RoundResult): string =>
  SIDES.filter((side) => round[side].bonuses.length > 0)
    .map(
      (side) => `${round[side].card.name}: ${round[side].bonuses.join(", ")}`,
    )
    .join(" · ");

/** The same round written out in full, for the detail view. */
const verboseRound = (
  round: RoundResult,
  names: Record<Side, string>,
): string => {
  const line = (label: string, combat: SideCombat, opposing: SideCombat) => {
    const attack =
      combat.multiplier === 1
        ? `\`${combat.attackStat}\` ${TYPE_NAME[combat.printedType]}`
        : `\`${combat.attackStat} × ${combat.multiplier} = ${combat.attackValue}\``;
    const bonuses =
      combat.bonuses.length > 0 ? ` _(${combat.bonuses.join(", ")})_` : "";
    return `${label} attacks with ${attack}, minus ${opposing.card.name}'s \`${combat.defenseFaced}\` ${TYPE_NAME[combat.printedType]} → **${combat.damage}**${bonuses}`;
  };

  return [
    `**Round ${round.slot}** · ${round.challenger.card.name} vs ${round.defender.card.name}`,
    `-# ${multiplierNote(round, names)}`,
    line(names.challenger, round.challenger, round.defender),
    line(names.defender, round.defender, round.challenger),
    round.winner === "draw"
      ? "Equal damage — the round counts for neither side."
      : `**${names[round.winner]}** wins the round by ${Math.abs(round.challenger.damage - round.defender.damage)}.`,
    ...round.notes.map((note) => `-# ↳ ${note}`),
  ].join("\n");
};

/** Which side got the multiplier, and why. Only one side ever can. */
const multiplierNote = (
  round: RoundResult,
  names: Record<Side, string>,
): string => {
  const { challenger, defender } = round;

  if (challenger.multiplier > 1) {
    return explainMultiplier(
      challenger.printedType,
      defender.printedType,
      challenger.multiplier,
      names.challenger,
    );
  }
  if (defender.multiplier > 1) {
    return explainMultiplier(
      defender.printedType,
      challenger.printedType,
      defender.multiplier,
      names.defender,
    );
  }
  return explainMultiplier(
    challenger.printedType,
    defender.printedType,
    1,
    names.challenger,
  );
};

/** `💖 Heart beats 💪 Power — ×1.5 to Miku Nakano`, or nothing with no multiplier. */
const typeNote = (round: RoundResult): string => {
  const side = SIDES.find((s) => round[s].multiplier > 1);
  if (!side) return "";
  const other = side === "challenger" ? "defender" : "challenger";
  return explainMultiplier(
    round[side].printedType,
    round[other].printedType,
    round[side].multiplier,
    round[side].card.name,
  );
};

/** Engine notes name the side; players know each other by name. */
const namedNote = (note: string, names: Record<Side, string>): string =>
  note.replace(/\b(challenger|defender)\b/g, (side) => names[side as Side]);

const keywordsOf = (result: MatchResult): KeywordDefinition[] => {
  if (!result.rules.keywordsEnabled) return [];
  const seen = new Map<string, KeywordDefinition>();
  for (const round of result.rounds) {
    for (const side of SIDES) {
      const keyword = combatKeyword(round[side]);
      if (keyword) seen.set(keyword.slug, keyword);
    }
  }
  return [...seen.values()];
};

/**
 * What the keywords did, round by round.
 *
 * The board tags each card with its keyword, but a tag is easy to miss and says
 * nothing about a keyword that sat idle - which is most of them in any one
 * match. So every keyword in the match is accounted for here: the ones that
 * changed a number say what they changed, and the rest are listed as not having
 * triggered, so a player can tell "did nothing" from "wasn't shown".
 */
export const keywordReport = (
  result: MatchResult,
  names: Record<Side, string>,
): string[] => {
  const fired: string[] = [];
  const idle: string[] = [];
  const other = (side: Side): Side =>
    side === "challenger" ? "defender" : "challenger";

  for (const round of result.rounds) {
    const claimed = new Set<string>();
    const keywords = {} as Record<Side, KeywordDefinition | null>;
    const landed = new Set<Side>();
    const who = (side: Side) =>
      `\`R${round.slot}\` **${round[side].card.name}**`;

    for (const side of SIDES) {
      const combat = round[side];
      const keyword = result.rules.keywordsEnabled
        ? combatKeyword(combat)
        : null;
      keywords[side] = keyword;

      /* Stat and matchup changes. Not all of them are this card's own doing - a
         `Rally` is handed on and an `Intimidate` is done to it - so the card
         only counts as having used its keyword if one of them carries its name. */
      if (combat.bonuses.length > 0) {
        const stat =
          combat.attackStat !== combat.baseAttackStat
            ? ` · ${TYPE_NAME[combat.printedType]} ${combat.baseAttackStat} → **${combat.attackStat}**`
            : "";
        fired.push(`${who(side)} — ${combat.bonuses.join(", ")}${stat}`);
        if (
          keyword &&
          combat.bonuses.some((bonus) => bonus.startsWith(keyword.name))
        ) {
          landed.add(side);
        }
      }

      if (!keyword) continue;

      // Outcome and hand-on keywords leave a note naming the side instead.
      for (const note of round.notes) {
        if (!note.startsWith(`${keyword.name}:`) || !note.includes(side))
          continue;
        claimed.add(note);
        fired.push(`${who(side)} — ${namedNote(note, names)}`);
        landed.add(side);
      }
    }

    /* Tiebreak keywords change nothing in the round itself, only the total -
       this card's own count, or (`Mercy`) the opposing card's. */
    for (const side of SIDES) {
      const { dealt, own, counted } = tiebreakDamageOf(
        round,
        side,
        result.rules,
      );
      if (own !== dealt) {
        fired.push(
          `${who(side)} — ${keywords[side]?.name}: ${dealt} damage counts as **${own}** toward total damage`,
        );
        landed.add(side);
      }
      if (counted !== own) {
        fired.push(
          `${who(other(side))} — ${keywords[other(side)]?.name}: ${round[side].card.name}'s ${own} damage counts as **${counted}** toward total damage`,
        );
        landed.add(other(side));
      }
    }

    for (const side of SIDES) {
      const keyword = keywords[side];
      if (keyword && !landed.has(side)) {
        idle.push(`${keyword.name} (${round[side].card.name})`);
      }
    }

    // A note no keyword claimed still happened; never drop it.
    for (const note of round.notes) {
      if (claimed.has(note)) continue;
      fired.push(`\`R${round.slot}\` ↳ ${namedNote(note, names)}`);
    }
  }

  if (fired.length === 0 && idle.length === 0) return [];

  return [
    "**Abilities**",
    ...(fired.length > 0 ? fired : ["No ability changed a number this match."]),
    ...(idle.length > 0 ? [`-# Didn't trigger: ${idle.join(" · ")}`] : []),
  ];
};

/**
 * One round in two lines: who won it, then the working in small text. Used
 * when the battle board fails to render, and for a dungeon run's room log.
 *
 * The winner leads the line. An earlier version marked every round with a ✅,
 * which read as "you won this one" regardless of who actually did.
 */
export const roundBlock = (
  round: RoundResult,
  names: Record<Side, string>,
): string => {
  const { challenger, defender } = round;

  // The winner shows as the bold score; "vs" keeps a negative one readable.
  const score = (combat: SideCombat, side: Side) =>
    round.winner === side ? `**${combat.damage}**` : `${combat.damage}`;

  return [
    `\`R${round.slot}\` ${TYPE_EMOJI[challenger.printedType]} ${challenger.card.name} · ${score(challenger, "challenger")} vs ${score(defender, "defender")} · ${defender.card.name} ${TYPE_EMOJI[defender.printedType]}`,
    damageTable(round),
    // Type advantage and abilities on their own lines; a round with neither
    // needs no footnote, the table already says it all.
    ...[typeNote(round), bonusNote(round)]
      .filter(Boolean)
      .map((note) => `-# ${note}`),
    ...round.notes.map((note) => `-# ↳ ${namedNote(note, names)}`),
  ].join("\n");
};

export type BuiltResultMessage = {
  components: ContainerBuilder[];
  files: AttachmentBuilder[];
  flags: [MessageFlags.IsComponentsV2];
};

/** Renders the battle board and builds the result around it. */
export const buildResultMessage = async (
  input: ResultMessageInput,
): Promise<BuiltResultMessage> =>
  composeResultMessage(
    input,
    await renderBattleBoard(input.result, input.names),
  );

/**
 * Builds the result from an already-rendered board, or from none - a null board
 * falls back to the text rounds. Split out so the fallback is testable.
 */
export const composeResultMessage = (
  input: ResultMessageInput,
  board: Buffer | null,
): BuiltResultMessage => {
  const { result, names, userIds, split } = input;

  const accent =
    result.winner === "draw" ? DRAW_ACCENT : SIDE_ACCENT[result.winner];

  const headline =
    result.winner === "draw"
      ? `## 🤝 Draw — ${result.roundsWon.challenger} – ${result.roundsWon.defender}`
      : `## 🏆 ${names[result.winner]} wins ${result.roundsWon.challenger} – ${result.roundsWon.defender}`;

  const container = new ContainerBuilder()
    .setAccentColor(accent)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          headline,
          input.practice
            ? `-# 🧪 Practice — ${names.challenger} vs ${names.defender} · not recorded`
            : `<@${userIds.challenger}> vs <@${userIds.defender}>`,
        ].join("\n"),
      ),
    );

  if (board) {
    const notes = keywordReport(result, names);
    container.addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) =>
        item
          .setURL(`attachment://${BATTLE_BOARD_FILE}`)
          .setDescription(
            `${names.challenger} vs ${names.defender}, ${result.roundsWon.challenger} – ${result.roundsWon.defender}`,
          ),
      ),
    );
    if (notes.length > 0) {
      container.addTextDisplayComponents((text) =>
        text.setContent(notes.join("\n")),
      );
    }
  } else {
    /* All rounds in one block with one separator, rather than a separator each -
       three bordered sections for three rounds reads as three times the content. */
    container
      .addSeparatorComponents((separator) => separator)
      .addTextDisplayComponents((text) =>
        text.setContent(
          result.rounds.map((round) => roundBlock(round, names)).join("\n"),
        ),
      );
  }

  /* How it was decided, and the money. Total damage is only interesting when it
     actually settled the match, so it is stated plainly in that case and kept as
     a footnote otherwise - and the board already carries that footnote. */
  const decided =
    result.decidedBy === "damage"
      ? `**Decided on total damage** — ${names.challenger} ${result.tiebreakDamage.challenger}, ${names.defender} ${result.tiebreakDamage.defender}`
      : result.decidedBy === "rule"
        ? "Rounds *and* total damage both level."
        : board
          ? ""
          : `-# Total damage ${result.tiebreakDamage.challenger} – ${result.tiebreakDamage.defender}`;

  const pot = split
    ? `**Pot ${split.pot} fc** — ${
        result.winner === "draw"
          ? "returned to both sides"
          : `${split.payout} to ${names[result.winner]}`
      }${split.jackpotCut > 0 ? `, ${split.jackpotCut} raked to the jackpot 🎰` : ""}`
    : "";

  const summary = [decided, pot].filter(Boolean).join("\n");
  if (summary) {
    container
      .addSeparatorComponents((separator) => separator)
      .addTextDisplayComponents((text) => text.setContent(summary));
  }

  /* Detail on demand: the compact view is what everyone reads, and anyone
     learning the maths can ask for the long form without it cluttering the
     channel for everybody else. */
  if (input.battleId) {
    container.addActionRowComponents(() =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`v2_breakdown:${input.battleId}`)
          .setLabel("Full breakdown")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return {
    components: [container],
    files: board
      ? [new AttachmentBuilder(board, { name: BATTLE_BOARD_FILE })]
      : [],
    flags: [MessageFlags.IsComponentsV2],
  };
};
