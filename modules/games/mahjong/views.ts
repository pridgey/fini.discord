import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import {
  claimOptions,
  roundLabel,
  seatWind,
  turnOptions,
  type GameEvent,
  type GameState,
  type Rules,
} from "./game";
import { PAYOUT_SHARES } from "./driver";
import { groupHand } from "./grouping";
import {
  callsPictureSvg,
  goalPictureSvg,
  handStripSvg,
  renderSvg,
  tileChartSvg,
  turnPictureSvg,
} from "./handArt";
import {
  claimAdvice,
  drawSummary,
  guidePages,
  turnAdvice,
  waitingAdvice,
  winSummary,
  type Advice,
  type Tone,
} from "./hints";
import { renderTable } from "./render";
import { prefsFor, type MahjongTable } from "./store";
import {
  kindOf,
  numberOf,
  tileName,
  tileOf,
  windName,
  type Tile,
} from "./tiles";

/**
 * What Discord shows, as embeds:
 *
 * - The table message: the round and whose turn in the title, scores and
 *   the last few moves beside the table picture.
 * - A player's private view: the table, then their own hand drawn as its
 *   sets and half-sets, with what to do now and a tip or two above the
 *   buttons.
 * - How to play: a page at a time, each with a picture.
 *
 * Button ids are `mahjong:<table>:<action>:<step>:<arg>`; the step pins a
 * button to the moment it was drawn for, so an old one does nothing.
 */

export const MAHJONG_BUTTON = "mahjong";

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const COLOURS: Record<Tone | "felt" | "over" | "draw", number> = {
  felt: 0x1f5a43,
  turn: 0xf2c14e,
  win: 0x4cc27e,
  claim: 0x5b9cf0,
  wait: 0x5d6680,
  danger: 0xc8322b,
  away: 0x5d6680,
  over: 0xf2c14e,
  draw: 0x5d6680,
};

const RULE_NAMES: Record<Rules, string> = {
  riichi: "Riichi Mahjong",
  hongkong: "Hong Kong Mahjong",
};

const LEGEND =
  "🟩 set · 🟦 pair · 🟧 half-set · ⬜ loose — goal: 4 sets + 1 pair";

const id = (tableId: string, action: string, step = 0, arg = "") =>
  `${MAHJONG_BUTTON}:${tableId}:${action}:${step}:${arg}`;

const button = (
  customId: string,
  label: string,
  style = ButtonStyle.Secondary,
  disabled = false,
  emoji?: string,
) => {
  const b = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label.slice(0, 80))
    .setStyle(style)
    .setDisabled(disabled);
  if (emoji) b.setEmoji(emoji);
  return b;
};

const rows = (buttons: ButtonBuilder[], perRow = 5): Row[] => {
  const out: Row[] = [];
  for (let i = 0; i < buttons.length; i += perRow)
    out.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        buttons.slice(i, i + perRow),
      ),
    );
  return out;
};

/** A short label for a tile button: "5 Circ", "red 5 Bam", "East". */
export const tileLabel = (tile: Tile): string => {
  const k = kindOf(tile);
  if (k >= 27)
    return tileName(tile).replace(" Wind", "").replace(" Dragon", "");
  const suit = { m: "Char", p: "Circ", s: "Bam" }[tile[1]]!;
  return `${tile[0] === "0" ? "red " : ""}${numberOf(k)} ${suit}`;
};

const when = (ms: number) => `<t:${Math.floor(ms / 1000)}:R>`;

const eventText = (s: GameState, e: GameEvent): string => {
  const who = (seat: number) => s.seats[seat].name;
  switch (e.type) {
    case "discard":
      return e.riichi
        ? `**${who(e.seat)}** declared **riichi** 🔴 (threw ${tileLabel(e.tile)})`
        : `${who(e.seat)} threw ${tileLabel(e.tile)}`;
    case "call":
      return `**${who(e.seat)}** took ${tileLabel(e.meld.called ?? e.meld.tiles[0])} — **${e.meld.type}**`;
    case "kan":
      return `**${who(e.seat)}** made a **kan** of ${tileLabel(e.meld.tiles[0])}`;
    case "flower":
      return `${who(e.seat)} set aside a flower (${tileName(e.tile)})`;
    case "dora":
      return `A new bonus-tile indicator was turned over`;
    case "draw":
      return "";
  }
};

const recent = (s: GameState, n = 4) =>
  s.events
    .map((e) => eventText(s, e))
    .filter(Boolean)
    .slice(-n);

/** One line per seat, East first: wind, name, points, riichi stick. */
const scoreLines = (t: MahjongTable, s: GameState, active: number): string =>
  [0, 1, 2, 3]
    .map((i) => (s.dealer + i) % 4)
    .map((seat) => {
      const x = s.seats[seat];
      const wind = windName(seatWind(s, seat) - 27);
      const away = !x.bot && prefsFor(t, x.id).away ? " 💤" : "";
      const flags = `${seat === s.dealer ? " · dealer" : ""}${x.riichi ? " · 🔴 riichi" : ""}${away}`;
      const nameText = seat === active ? `**▶ ${x.name}**` : x.name;
      return `\`${wind.padEnd(5)}\` ${nameText} — ${x.points.toLocaleString()}${flags}`;
    })
    .join("\n");

const payoutText = (buyIn: number) =>
  buyIn
    ? `Buy-in **${buyIn}** finicoin · payouts 🥇 ${+(buyIn * 4 * PAYOUT_SHARES[0]).toFixed(2)} · 🥈 ${+(buyIn * 4 * PAYOUT_SHARES[1]).toFixed(2)} · 🥉 ${+(buyIn * 4 * PAYOUT_SHARES[2]).toFixed(2)} · 4th ${+(buyIn * 4 * PAYOUT_SHARES[3]).toFixed(2)}`
    : "Just for fun — no finicoin at stake";

// ---------------------------------------------------------------------------
// The public table message

export const tableMessage = async (t: MahjongTable) => {
  const title = `🀄 ${RULE_NAMES[t.rules]}`;

  if (t.status === "lobby" || t.status === "cancelled") {
    const embed = new EmbedBuilder()
      .setColor(COLOURS.felt)
      .setTitle(`${title} — table open`);
    if (t.status === "cancelled") {
      embed.setDescription("This table was closed before it started.");
      return {
        content: "",
        embeds: [embed],
        components: [],
        files: [],
        attachments: [],
      };
    }
    const seats = [0, 1, 2, 3]
      .map((i) => {
        const p = t.players[i];
        return p
          ? `**${i + 1}.** ${p.name}${p.id === t.host_id ? " 👑" : ""}`
          : `**${i + 1}.** *open — a Fini bot sits here if nobody joins*`;
      })
      .join("\n");
    embed
      .setDescription(
        [
          "**The goal:** be first to collect **4 sets + 1 pair** — like the hand below.",
          "Never played? Perfect. Your private hand view shows what you've built, what you still need, and which tile to throw.",
        ].join("\n\n"),
      )
      .addFields(
        { name: "Seats", value: seats },
        { name: "Stakes", value: payoutText(t.buy_in) },
      )
      .setImage("attachment://goal.png")
      .setFooter({ text: "Press Join to sit down · the host presses Start" });
    return {
      content: "",
      embeds: [embed],
      components: rows([
        button(id(t.id, "join"), "Join", ButtonStyle.Primary, false, "🪑"),
        button(id(t.id, "leave"), "Leave"),
        button(id(t.id, "start"), "Start", ButtonStyle.Success, false, "▶️"),
        button(id(t.id, "cancel"), "Close table", ButtonStyle.Danger),
        button(
          id(t.id, "guide", 0, `${t.rules}.0`),
          "How to play",
          ButtonStyle.Secondary,
          false,
          "📖",
        ),
      ]),
      files: [
        new AttachmentBuilder(await renderSvg(goalPictureSvg()), {
          name: "goal.png",
        }),
      ],
      attachments: [],
    };
  }

  const s = t.game!;
  const embed = new EmbedBuilder();
  const files: AttachmentBuilder[] = [];
  let components: Row[] = [];

  if (s.phase.kind === "gameOver") {
    const medals = ["🥇", "🥈", "🥉", "4th"];
    const lines = s.phase.final.map((f) => {
      const pay = t.payouts?.find((p) => p.seat === f.seat);
      const coins = pay?.amount
        ? ` · ${pay.userId ? "wins" : "back to the Reserve:"} **${pay.amount}** finicoin`
        : "";
      return `${medals[f.rank - 1]} **${s.seats[f.seat].name}** — ${f.points.toLocaleString()}${coins}`;
    });
    embed
      .setColor(COLOURS.over)
      .setTitle(`🏁 ${RULE_NAMES[t.rules]} — final scores`)
      .setDescription(lines.join("\n"))
      .setImage("attachment://table.png")
      .setFooter({
        text: "Thanks for playing! Open a new table with /mahjong open",
      });
    files.push(
      new AttachmentBuilder(await renderTable(s, { reveal: true }), {
        name: "table.png",
      }),
    );
  } else if (s.phase.kind === "handOver") {
    const result = s.phase.result;
    const next = `Next hand ${when(t.deadline)} — or press **Next hand**.`;
    if (result.type === "win") {
      const w = result.wins[0];
      const summaries = result.wins.map((x) => winSummary(s, x));
      embed
        .setColor(COLOURS.win)
        .setTitle(`🎉 ${s.seats[w.seat].name} wins ${roundLabel(s)}!`)
        .setDescription(
          [
            ...summaries.flatMap((x) => [
              `**${x.heading}**`,
              ...x.patterns.map((p) => `• ${p}`),
              `= ${x.total}`,
              "",
            ]),
            next,
          ]
            .join("\n")
            .slice(0, 4000),
        )
        .setImage("attachment://hand.png");
      const grouping = groupHand(w.hand, w.melds);
      const strip = handStripSvg({
        grouping,
        title: `${s.seats[w.seat].name}'s winning hand`,
        headline: `+${w.gained.toLocaleString()}`,
        headlineColour: "#4cc27e",
        drawn: w.tile,
        drawnLabel: "winning tile",
      });
      files.push(
        new AttachmentBuilder(await renderSvg(strip), { name: "hand.png" }),
      );
    } else if (result.type === "eightFlowers") {
      embed
        .setColor(COLOURS.win)
        .setTitle(
          `🌸 ${s.seats[result.seat].name} collected all eight flowers!`,
        )
        .setDescription(`That's an instant win at the limit.\n\n${next}`)
        .setImage("attachment://table.png");
      files.push(
        new AttachmentBuilder(await renderTable(s, { reveal: true }), {
          name: "table.png",
        }),
      );
    } else {
      embed
        .setColor(COLOURS.draw)
        .setTitle(`${roundLabel(s)} — no winner`)
        .setDescription(`${drawSummary(s, result)}\n\n${next}`)
        .setImage("attachment://table.png");
      files.push(
        new AttachmentBuilder(await renderTable(s, { reveal: true }), {
          name: "table.png",
        }),
      );
    }
    const moves = result.deltas
      .map((d, i) =>
        d
          ? `${s.seats[i].name} ${d > 0 ? "+" : ""}${d.toLocaleString()}`
          : null,
      )
      .filter(Boolean);
    embed.addFields({ name: "Scores", value: scoreLines(t, s, -1) });
    if (moves.length)
      embed.addFields({ name: "This hand", value: moves.join(" · ") });
    components = rows([
      button(
        id(t.id, "next", s.step),
        "Next hand",
        ButtonStyle.Primary,
        false,
        "▶️",
      ),
      button(id(t.id, "open"), "My hand", ButtonStyle.Secondary, false, "🀄"),
      button(
        id(t.id, "guide", 0, `${t.rules}.0`),
        "How to play",
        ButtonStyle.Secondary,
        false,
        "📖",
      ),
    ]);
  } else {
    const active = s.phase.kind === "turn" ? s.phase.seat : -1;
    const status =
      s.phase.kind === "turn"
        ? `▶ **${s.seats[s.phase.seat].name}**'s turn · ${when(t.deadline)}`
        : `Waiting to see if anyone takes the **${tileLabel(s.phase.tile)}** · ${when(t.deadline)}`;
    embed
      .setColor(COLOURS.felt)
      .setTitle(`🀄 ${roundLabel(s)} · ${s.wall.length} tiles left`)
      .setDescription(status)
      .addFields({ name: "Scores", value: scoreLines(t, s, active) });
    const r = recent(s);
    if (r.length)
      embed.addFields({
        name: "Just now",
        value: r.map((x) => `• ${x}`).join("\n"),
      });
    embed.setImage("attachment://table.png").setFooter({
      text: `First to 4 sets + 1 pair wins the hand · lost this in the chat? /mahjong table brings it back down`,
    });
    files.push(
      new AttachmentBuilder(await renderTable(s), { name: "table.png" }),
    );
    components = rows([
      button(id(t.id, "open"), "My hand", ButtonStyle.Primary, false, "🀄"),
      button(
        id(t.id, "guide", 0, `${t.rules}.0`),
        "How to play",
        ButtonStyle.Secondary,
        false,
        "📖",
      ),
      button(id(t.id, "leave"), "Step away (a bot plays)"),
    ]);
  }

  return { content: "", embeds: [embed], components, files, attachments: [] };
};

// ---------------------------------------------------------------------------
// A player's private view

export type ViewMode = { riichi?: boolean };

export const handView = async (
  t: MahjongTable,
  userId: string,
  mode: ViewMode = {},
) => {
  const s = t.game!;
  const seatIndex = s.seats.findIndex((x) => x.id === userId);
  const seat = s.seats[seatIndex];
  const prefs = prefsFor(t, userId);
  const step = s.step;
  const tiles: ButtonBuilder[] = [];
  const actions: ButtonBuilder[] = [];
  let advice: Advice;
  const grouping = groupHand(seat.hand, seat.melds);
  // Buttons follow the picture, left to right.
  const pictureOrder = [
    ...new Set(
      grouping.groups.flatMap((g) => (g.type === "called" ? [] : g.tiles)),
    ),
  ];
  const inPictureOrder = (list: Tile[]) =>
    [...list].sort((a, b) => pictureOrder.indexOf(a) - pictureOrder.indexOf(b));

  if (prefs.away) {
    advice = {
      ...waitingAdvice(s, seatIndex, false),
      title: "💤 A bot is playing your seat",
      tone: "away",
      tips: ["Press **I'm back** to take over again."],
    };
    actions.push(
      button(id(t.id, "back"), "I'm back", ButtonStyle.Success, false, "👋"),
    );
  } else if (s.phase.kind === "turn" && s.phase.seat === seatIndex) {
    const o = turnOptions(s, seatIndex)!;
    advice = turnAdvice(s, seatIndex, prefs.hints);
    if (mode.riichi) {
      advice = {
        ...advice,
        title: "Riichi — which tile do you throw?",
        tips: [
          "Pick the tile to throw sideways. Only tiles that keep you ready are lit.",
          "After this your hand is locked: you'll throw whatever you draw until you win.",
        ],
      };
      for (const tile of inPictureOrder([
        ...new Set([...o.discards, ...o.riichi]),
      ])) {
        const ok = o.riichi.includes(tile);
        tiles.push(
          button(
            id(t.id, "r", step, tile),
            tileLabel(tile),
            ok ? ButtonStyle.Danger : ButtonStyle.Secondary,
            !ok,
          ),
        );
      }
      actions.push(button(id(t.id, "view", step, "normal"), "Cancel riichi"));
    } else {
      const drawn = s.phase.drawn;
      for (const tile of inPictureOrder(o.discards)) {
        const style =
          tile === advice.suggest
            ? ButtonStyle.Danger
            : tile === drawn
              ? ButtonStyle.Primary
              : ButtonStyle.Secondary;
        tiles.push(
          button(
            id(t.id, "d", step, tile),
            tileLabel(tile) + (tile === drawn ? " (new)" : ""),
            style,
          ),
        );
      }
      if (o.tsumo)
        actions.push(
          button(
            id(t.id, "t", step),
            "Tsumo — win!",
            ButtonStyle.Success,
            false,
            "🎉",
          ),
        );
      if (o.riichi.length)
        actions.push(
          button(
            id(t.id, "view", step, "riichi"),
            "Riichi…",
            ButtonStyle.Danger,
            false,
            "🔴",
          ),
        );
      for (const k of o.kans)
        actions.push(
          button(id(t.id, "k", step, String(k)), `Kan ${tileLabel(tileOf(k))}`),
        );
      if (o.nineTerminals)
        actions.push(button(id(t.id, "n", step), "Nine terminals (redeal)"));
    }
  } else if (
    s.phase.kind === "claims" &&
    claimOptions(s, seatIndex) &&
    !s.phase.responses[seatIndex]
  ) {
    const o = claimOptions(s, seatIndex)!;
    advice = claimAdvice(s, seatIndex, prefs.hints);
    if (o.ron)
      actions.push(
        button(
          id(t.id, "c", step, "ron"),
          "Ron — win!",
          ButtonStyle.Success,
          false,
          "🎉",
        ),
      );
    if (o.pon)
      actions.push(
        button(id(t.id, "c", step, "pon"), "Pon", ButtonStyle.Primary),
      );
    if (o.kan)
      actions.push(
        button(id(t.id, "c", step, "kan"), "Kan", ButtonStyle.Primary),
      );
    for (const pair of o.chi.slice(0, 3)) {
      const run = [...pair, s.phase.tile]
        .map(kindOf)
        .sort((a, b) => a - b)
        .map(numberOf)
        .join("-");
      actions.push(
        button(
          id(t.id, "c", step, `chi-${pair.join("-")}`),
          `Chi ${run}`,
          ButtonStyle.Primary,
        ),
      );
    }
    actions.push(button(id(t.id, "c", step, "pass"), "Pass"));
  } else if (s.phase.kind === "handOver" || s.phase.kind === "gameOver") {
    advice = {
      ...waitingAdvice(s, seatIndex, false),
      title:
        s.phase.kind === "handOver"
          ? "The hand is over — see the table for who won"
          : "🏁 The game is over — see the table for final scores",
      tone: "wait",
    };
  } else {
    advice = waitingAdvice(s, seatIndex, prefs.hints);
  }

  const timer =
    s.phase.kind === "turn" || s.phase.kind === "claims"
      ? ` · ⏳ ${when(t.deadline)}`
      : "";
  const myTurn =
    advice.tone === "turn" || advice.tone === "claim" || advice.tone === "win";
  const wind = windName(seatWind(s, seatIndex) - 27);

  const tableEmbed = new EmbedBuilder()
    .setColor(COLOURS.felt)
    .setAuthor({
      name: `${roundLabel(s)} · you sit ${wind}${seatIndex === s.dealer ? " (dealer)" : ""} · ${seat.points.toLocaleString()} points`,
    })
    .setImage("attachment://table.png");
  const handEmbed = new EmbedBuilder()
    .setColor(COLOURS[advice.tone])
    .setTitle(advice.title)
    .setImage("attachment://hand.png")
    .setFooter({ text: LEGEND });
  const description = [
    ...advice.tips,
    myTurn && timer ? `⏳ ${when(t.deadline)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (description) handEmbed.setDescription(description.slice(0, 4000));

  const strip = handStripSvg({
    grouping,
    headline: advice.headline,
    headlineColour: advice.headlineGood ? "#4cc27e" : undefined,
    drawn:
      s.phase.kind === "turn" && s.phase.seat === seatIndex
        ? s.phase.drawn
        : null,
    suggest: advice.suggest,
    waits: advice.waits,
  });

  const tools = [
    button(
      id(t.id, "hints"),
      prefs.hints ? "Hints: on" : "Hints: off",
      ButtonStyle.Secondary,
      false,
      "💡",
    ),
    button(
      id(t.id, "guide", 0, `${t.rules}.0`),
      "How to play",
      ButtonStyle.Secondary,
      false,
      "📖",
    ),
  ];
  // Discord allows five rows: tiles and actions share four, tools take the last.
  const components = [
    ...[...rows(tiles), ...rows(actions)].slice(0, 4),
    ...rows(tools),
  ];
  return {
    content: "",
    embeds: [tableEmbed, handEmbed],
    components: components.slice(0, 5),
    files: [
      new AttachmentBuilder(
        await renderTable(s, { viewer: seatIndex, noHand: true }),
        { name: "table.png" },
      ),
      new AttachmentBuilder(await renderSvg(strip), { name: "hand.png" }),
    ],
    attachments: [],
  };
};

// ---------------------------------------------------------------------------
// How to play

const PICTURES = {
  goal: () => goalPictureSvg(),
  tiles: (rules: Rules) => tileChartSvg(rules === "hongkong"),
  turn: () => turnPictureSvg(),
  calls: () => callsPictureSvg(),
};

/** One page of the guide. `tableId` is "-" when opened from /mahjong rules. */
export const guideView = async (
  tableId: string,
  rules: Rules,
  pageIndex: number,
) => {
  const pages = guidePages(rules);
  const i = Math.max(0, Math.min(pages.length - 1, pageIndex));
  const page = pages[i];
  const embed = new EmbedBuilder()
    .setColor(COLOURS.felt)
    .setAuthor({
      name: `How to play ${RULE_NAMES[rules]} · ${i + 1} of ${pages.length}`,
    })
    .setTitle(page.title)
    .setDescription(page.body);
  const files: AttachmentBuilder[] = [];
  if (page.picture) {
    embed.setImage("attachment://guide.png");
    files.push(
      new AttachmentBuilder(await renderSvg(PICTURES[page.picture](rules)), {
        name: "guide.png",
      }),
    );
  }
  const components = rows([
    button(
      id(tableId, "page", 0, `${rules}.${i - 1}`),
      "Back",
      ButtonStyle.Secondary,
      i === 0,
      "◀️",
    ),
    button(
      id(tableId, "page", 1, `${rules}.${i + 1}`),
      "Next",
      ButtonStyle.Primary,
      i === pages.length - 1,
      "▶️",
    ),
  ]);
  return { content: "", embeds: [embed], components, files, attachments: [] };
};
