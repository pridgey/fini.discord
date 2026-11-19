import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type RepliableInteraction,
  type GuildTextBasedChannel,
} from "discord.js";
import { addCoin, getUserBalance } from "../../finicoin";
import {
  TIME_LIMITS,
  payoutsFor,
  runAutomatic,
  startGame,
  timeoutMove,
} from "./driver";
import {
  RuleError,
  nextHand,
  pendingClaims,
  playClaim,
  playTurn,
  type Claim,
  type GameState,
  type Rules,
  type TurnMove,
} from "./game";
import {
  activeTables,
  createTable,
  defaultPrefs,
  getTable,
  prefsFor,
  saveTable,
  tableOf,
  withTableLock,
  type MahjongTable,
} from "./store";
import {
  MAHJONG_BUTTON,
  guideView,
  handView,
  tableMessage,
  type ViewMode,
} from "./views";

/**
 * Mahjong in Discord: one public message per table, and a private hand view
 * per player that updates itself while it's open.
 *
 * Every change goes the same way, under the table's lock: load the row, make
 * the move, let bots play until a person has a choice, set the clock for that
 * choice, save, then redraw the table message and every open hand view.
 */

let client: Client | null = null;

/** Open private views: Discord lets a reply be edited for 15 minutes. */
const viewers = new Map<
  string,
  { interaction: RepliableInteraction; mode: ViewMode; at: number }
>();
const VIEW_LIFETIME = 14 * 60_000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pinged = new Map<string, number>();

const viewKey = (tableId: string, userId: string) => `${tableId}:${userId}`;

const autopilotFor = (t: MahjongTable) => (seat: number) => {
  const x = t.game!.seats[seat];
  return x.bot || prefsFor(t, x.id).away;
};

const seatOf = (t: MahjongTable, userId: string) =>
  t.game?.seats.findIndex((x) => x.id === userId) ?? -1;

const ephemeral = async (
  interaction: RepliableInteraction,
  content: string,
) => {
  const payload = { content, flags: [MessageFlags.Ephemeral] as const };
  if (interaction.deferred || interaction.replied)
    await interaction.followUp(payload);
  else await interaction.reply(payload);
};

// ---------------------------------------------------------------------------
// Opening and the lobby

export const openTable = async (
  interaction: ChatInputCommandInteraction,
  rules: Rules,
  buyIn: number,
) => {
  const serverId = interaction.guildId!;
  const already = await tableOf(serverId, interaction.user.id);
  if (already) {
    await interaction.reply({
      content: "You're already seated at a mahjong table here. Leave it first.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  if (
    buyIn > 0 &&
    (await getUserBalance(interaction.user.id, serverId)) < buyIn
  ) {
    await interaction.reply({
      content: `You need ${buyIn} finicoin to open a table with that buy-in.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  await interaction.deferReply();
  const name = displayName(interaction);
  const t = await createTable({
    server_id: serverId,
    server_name: interaction.guild?.name ?? "unknown guild name",
    channel_id: interaction.channelId,
    host_id: interaction.user.id,
    rules,
    buy_in: buyIn,
    players: [{ id: interaction.user.id, name }],
  });
  const message = await interaction.editReply(await tableMessage(t));
  t.message_id = message.id;
  await saveTable(t);
};

const displayName = (i: RepliableInteraction) =>
  (i.member && "displayName" in i.member ? i.member.displayName : null) ??
  i.user.displayName ??
  i.user.username;

const lobbyAction = async (
  interaction: ButtonInteraction,
  t: MahjongTable,
  action: string,
) => {
  const userId = interaction.user.id;
  const seated = t.players.some((p) => p.id === userId);
  if (action === "join") {
    if (seated) return ephemeral(interaction, "You're already at this table.");
    if (t.players.length >= 4)
      return ephemeral(interaction, "This table is full.");
    if (await tableOf(t.server_id, userId))
      return ephemeral(
        interaction,
        "You're already seated at another table here.",
      );
    if (t.buy_in > 0 && (await getUserBalance(userId, t.server_id)) < t.buy_in)
      return ephemeral(
        interaction,
        `The buy-in is ${t.buy_in} finicoin, and you don't have enough.`,
      );
    t.players.push({ id: userId, name: displayName(interaction) });
  } else if (action === "leave") {
    if (!seated) return ephemeral(interaction, "You aren't at this table.");
    if (userId === t.host_id)
      return ephemeral(
        interaction,
        "You're the host — use **Close table** instead.",
      );
    t.players = t.players.filter((p) => p.id !== userId);
  } else if (action === "cancel") {
    if (userId !== t.host_id)
      return ephemeral(interaction, "Only the host can close the table.");
    t.status = "cancelled";
  } else if (action === "start") {
    if (userId !== t.host_id)
      return ephemeral(interaction, "Only the host can start the game.");
    await interaction.deferUpdate();
    return startTable(interaction, t);
  }
  await saveTable(t);
  await interaction.update(await tableMessage(t));
};

const startTable = async (interaction: ButtonInteraction, t: MahjongTable) => {
  if (t.buy_in > 0) {
    const short: string[] = [];
    for (const p of t.players)
      if ((await getUserBalance(p.id, t.server_id)) < t.buy_in)
        short.push(p.name);
    if (short.length)
      return ephemeral(
        interaction,
        `Can't start: ${short.join(", ")} can't cover the ${t.buy_in} finicoin buy-in.`,
      );
    for (const p of t.players)
      await addCoin(
        "Reserve",
        t.server_id,
        t.buy_in,
        "Reserve",
        t.server_name,
        p.id,
      );
  }
  t.status = "playing";
  t.prefs = Object.fromEntries(t.players.map((p) => [p.id, defaultPrefs()]));
  t.game = startGame(t.rules, t.players, Math.floor(Math.random() * 2 ** 31));
  await settle(t);
  await saveTable(t);
  await publish(t);
};

// ---------------------------------------------------------------------------
// After every change

/** Runs bots, then sets the clock for whatever a person must do next. */
const settle = async (t: MahjongTable) => {
  t.game = runAutomatic(t.game!, autopilotFor(t));
  const p = t.game.phase;
  if (p.kind === "gameOver") {
    await finish(t);
    return;
  }
  const limit =
    p.kind === "turn"
      ? TIME_LIMITS.turn
      : p.kind === "claims"
        ? TIME_LIMITS.claims
        : TIME_LIMITS.handOver;
  t.deadline = Date.now() + limit;
};

const finish = async (t: MahjongTable) => {
  const s = t.game!;
  t.status = "finished";
  t.deadline = 0;
  const pays = t.buy_in > 0 ? payoutsFor(s, t.buy_in) : payoutsFor(s, 0);
  t.payouts = pays.map((p) => {
    const x = s.seats[p.seat];
    return {
      seat: p.seat,
      rank: p.rank,
      amount: p.amount,
      name: x.name,
      userId: x.bot ? null : x.id,
    };
  });
  for (const p of t.payouts) {
    if (p.userId && p.amount > 0)
      await addCoin(
        p.userId,
        t.server_id,
        p.amount,
        p.name,
        t.server_name,
        "Reserve",
      );
  }
};

/** Redraws the table message and every open hand view, and sets the timer. */
/**
 * When chat has buried the table - this many messages from other people
 * below it - and a person is about to act, the table is posted again at the
 * bottom. Bots' moves never move it, and a quiet channel never sees it jump.
 */
const BURIED_AFTER = 3;

const personMustAct = (t: MahjongTable) => {
  const s = t.game;
  if (t.status !== "playing" || !s) return false;
  const seats =
    s.phase.kind === "turn"
      ? [s.phase.seat]
      : s.phase.kind === "claims"
        ? pendingClaims(s)
        : [];
  return seats.some((seat) => !autopilotFor(t)(seat));
};

const isBuried = async (t: MahjongTable, channel: GuildTextBasedChannel) => {
  try {
    const below = await channel.messages.fetch({
      after: t.message_id,
      limit: 10,
    });
    return (
      below.filter((m) => m.author.id !== client?.user?.id).size >= BURIED_AFTER
    );
  } catch {
    return false;
  }
};

/** Redraws the table message (moving it down if buried), every open hand view, and sets the timer. */
const publish = async (t: MahjongTable, alreadyShown?: string) => {
  const channel = await channelOf(t);
  if (channel && t.message_id) {
    try {
      const payload = await tableMessage(t);
      const coolingDown =
        Date.now() - (lastMoved.get(t.id) ?? 0) < MOVE_COOLDOWN;
      if (personMustAct(t) && !coolingDown && (await isBuried(t, channel))) {
        const old = t.message_id;
        const fresh = await channel.send(payload);
        t.message_id = fresh.id;
        lastMoved.set(t.id, Date.now());
        await saveTable(t);
        await channel.messages.delete(old).catch(() => undefined);
      } else {
        const message = await channel.messages.fetch(t.message_id);
        await message.edit(payload);
      }
    } catch (error) {
      console.error("Mahjong: couldn't update the table message", error);
    }
  }
  await refreshViews(t, alreadyShown);
  schedule(t);
  if (channel) await pingIfNeeded(t, channel);
};

const channelOf = async (
  t: MahjongTable,
): Promise<GuildTextBasedChannel | null> => {
  if (!client) return null;
  const channel = await client.channels.fetch(t.channel_id).catch(() => null);
  return channel && channel.isTextBased() && !channel.isDMBased()
    ? channel
    : null;
};

const refreshViews = async (t: MahjongTable, except?: string) => {
  if (!t.game) return;
  const now = Date.now();
  await Promise.allSettled(
    t.game.seats.map(async (x) => {
      if (x.bot || x.id === except) return;
      const key = viewKey(t.id, x.id);
      const v = viewers.get(key);
      if (!v) return;
      if (now - v.at > VIEW_LIFETIME) {
        viewers.delete(key);
        return;
      }
      await v.interaction
        .editReply(await handView(t, x.id, { ...v.mode, riichi: false }))
        .catch(() => viewers.delete(key));
    }),
  );
};

/** Nudges a person whose decision is waiting and who has no hand view open. */
const pingIfNeeded = async (
  t: MahjongTable,
  channel: GuildTextBasedChannel,
) => {
  if (t.status !== "playing" || !t.game) return;
  const s = t.game;
  const seats =
    s.phase.kind === "turn"
      ? [s.phase.seat]
      : s.phase.kind === "claims"
        ? pendingClaims(s)
        : [];
  for (const seat of seats) {
    const x = s.seats[seat];
    if (x.bot || prefsFor(t, x.id).away) continue;
    const key = viewKey(t.id, x.id);
    const v = viewers.get(key);
    if (v && Date.now() - v.at < VIEW_LIFETIME) continue;
    if (Date.now() - (pinged.get(key) ?? 0) < 120_000) continue;
    pinged.set(key, Date.now());
    const what =
      s.phase.kind === "turn" ? "it's your turn" : "you can claim a tile";
    const sent = await channel
      .send({
        content: `<@${x.id}>, ${what} at the mahjong table.`,
        allowedMentions: { users: [x.id] },
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`${MAHJONG_BUTTON}:${t.id}:open:0:`)
              .setLabel("My hand")
              .setEmoji("🀄")
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      })
      .catch(() => null);
    if (sent) setTimeout(() => sent.delete().catch(() => undefined), 45_000);
  }
};

const schedule = (t: MahjongTable) => {
  const old = timers.get(t.id);
  if (old) clearTimeout(old);
  timers.delete(t.id);
  if (t.status !== "playing" || !t.deadline || !t.game) return;
  const step = t.game.step;
  const delay = Math.max(1000, t.deadline - Date.now());
  timers.set(
    t.id,
    setTimeout(() => {
      timers.delete(t.id);
      onTimeout(t.id, step).catch((e) =>
        console.error("Mahjong timeout failed", e),
      );
    }, delay),
  );
};

const onTimeout = (tableId: string, step: number) =>
  withTableLock(tableId, async () => {
    const t = await getTable(tableId);
    if (!t || t.status !== "playing" || !t.game || t.game.step !== step) return;
    let s: GameState = t.game;
    const p = s.phase;
    if (p.kind === "handOver") {
      s = nextHand(s);
    } else if (p.kind === "turn") {
      const x = s.seats[p.seat];
      const prefs = { ...prefsFor(t, x.id) };
      prefs.strikes++;
      // Two turns in a row missed: a bot sits in until they come back.
      if (prefs.strikes >= 2) prefs.away = true;
      t.prefs[x.id] = prefs;
      s = timeoutMove(s, p.seat);
    } else if (p.kind === "claims") {
      for (const seat of pendingClaims(s)) s = timeoutMove(s, seat);
    }
    t.game = s;
    await settle(t);
    await saveTable(t);
    await publish(t);
  });

// ---------------------------------------------------------------------------
// Finding the game again after chat has buried it

/** The table this person sits at, or a reply saying why there isn't one. */
const myTable = async (interaction: ChatInputCommandInteraction) => {
  const t = await tableOf(interaction.guildId!, interaction.user.id);
  if (!t) {
    await interaction.reply({
      content:
        "You aren't seated at a mahjong table here. Open one with `/mahjong open`.",
      flags: [MessageFlags.Ephemeral],
    });
    return null;
  }
  return t;
};

/** `/mahjong hand`: a fresh private hand view at the bottom of the chat. */
export const showHand = async (interaction: ChatInputCommandInteraction) => {
  const t = await myTable(interaction);
  if (!t) return;
  if (t.status !== "playing" || !t.game) {
    await interaction.reply({
      content:
        "The game hasn't started yet — your hand appears once the host presses **Start**.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  viewers.set(viewKey(t.id, interaction.user.id), {
    interaction,
    mode: {},
    at: Date.now(),
  });
  await interaction.editReply(await handView(t, interaction.user.id));
};

/** How often a table may be moved down, so it can't be used to spam. */
const MOVE_COOLDOWN = 15_000;
const lastMoved = new Map<string, number>();

/**
 * `/mahjong table`: posts the table again at the bottom of the chat and
 * removes the old message. Buttons carry the table id, not the message id,
 * so everything keeps working from the new one.
 */
export const moveTable = async (interaction: ChatInputCommandInteraction) => {
  const found = await myTable(interaction);
  if (!found) return;
  if (found.channel_id !== interaction.channelId) {
    await interaction.reply({
      content: `Your table is in <#${found.channel_id}> — use this command there.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  const since = Date.now() - (lastMoved.get(found.id) ?? 0);
  if (since < MOVE_COOLDOWN) {
    await interaction.reply({
      content: "The table was just moved — it should be right below.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  await interaction.deferReply();
  await withTableLock(found.id, async () => {
    const t = (await getTable(found.id))!;
    lastMoved.set(t.id, Date.now());
    const old = t.message_id;
    const message = await interaction.editReply(await tableMessage(t));
    t.message_id = message.id;
    await saveTable(t);
    const channel = await channelOf(t);
    if (channel && old && old !== message.id) {
      await channel.messages.delete(old).catch(() => undefined);
    }
  });
};

// ---------------------------------------------------------------------------
// Buttons

export const handleMahjongButton = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [tableId, action, stepText, arg = ""] = args;
  // How to play: "guide" opens it privately, "page" turns its pages in place.
  if (action === "guide" || action === "page") {
    const [rules, page] = arg.split(".");
    const view = await guideView(
      tableId,
      rules === "hongkong" ? "hongkong" : "riichi",
      Number(page) || 0,
    );
    if (action === "page") return interaction.update(view);
    return interaction.reply({ ...view, flags: [MessageFlags.Ephemeral] });
  }

  await withTableLock(tableId, async () => {
    const t = await getTable(tableId);
    if (!t) return ephemeral(interaction, "This table is gone.");
    if (t.status === "lobby") return lobbyAction(interaction, t, action);
    if (t.status !== "playing" || !t.game)
      return ephemeral(interaction, "This game has ended.");

    const userId = interaction.user.id;
    const seat = seatOf(t, userId);
    if (seat < 0)
      return ephemeral(interaction, "You aren't playing at this table.");
    const key = viewKey(t.id, userId);

    if (action === "open") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      viewers.set(key, { interaction, mode: {}, at: Date.now() });
      await interaction.editReply(await handView(t, userId));
      return;
    }

    if (action === "leave") {
      t.prefs[userId] = { ...prefsFor(t, userId), away: true };
      await interaction.deferUpdate();
      await settle(t);
      await saveTable(t);
      await publish(t);
      return ephemeral(
        interaction,
        "A bot is playing your seat now. Open **My hand** and press **I'm back** to return.",
      );
    }

    // Everything else comes from the private view and redraws it.
    await interaction.deferUpdate();
    viewers.set(key, { interaction, mode: {}, at: Date.now() });
    const step = Number(stepText);
    let mode: ViewMode = {};
    let changed = false;

    try {
      switch (action) {
        case "hints":
          t.prefs[userId] = {
            ...prefsFor(t, userId),
            hints: !prefsFor(t, userId).hints,
          };
          break;
        case "back":
          t.prefs[userId] = { ...prefsFor(t, userId), away: false, strikes: 0 };
          changed = true;
          break;
        case "view":
          if (step !== t.game.step) break;
          mode = { riichi: arg === "riichi" };
          break;
        case "next":
          if (step === t.game.step && t.game.phase.kind === "handOver") {
            t.game = nextHand(t.game);
            changed = true;
          }
          break;
        default: {
          if (step !== t.game.step) {
            await interaction.followUp({
              content: "That button is out of date — the table has moved on.",
              flags: [MessageFlags.Ephemeral],
            });
            break;
          }
          const move = toMove(action, arg);
          if (!move) break;
          t.game =
            "claim" in move
              ? playClaim(t.game, seat, move.claim)
              : playTurn(t.game, seat, move.turn);
          t.prefs[userId] = { ...prefsFor(t, userId), strikes: 0 };
          changed = true;
        }
      }
    } catch (error) {
      if (error instanceof RuleError) {
        await interaction.followUp({
          content: `Not allowed: ${error.message}.`,
          flags: [MessageFlags.Ephemeral],
        });
      } else throw error;
    }

    if (changed) {
      await settle(t);
      await saveTable(t);
    } else if (action === "hints") {
      await saveTable(t);
    }
    viewers.set(key, { interaction, mode, at: Date.now() });
    await interaction.editReply(await handView(t, userId, mode));
    if (changed) await publish(t, userId);
  });
};

const toMove = (
  action: string,
  arg: string,
): { turn: TurnMove } | { claim: Claim } | null => {
  switch (action) {
    case "d":
      return { turn: { type: "discard", tile: arg } };
    case "r":
      return { turn: { type: "riichi", tile: arg } };
    case "t":
      return { turn: { type: "tsumo" } };
    case "k":
      return { turn: { type: "kan", kind: Number(arg) } };
    case "n":
      return { turn: { type: "nineTerminals" } };
    case "c": {
      if (arg.startsWith("chi-"))
        return { claim: { type: "chi", tiles: arg.slice(4).split("-") } };
      if (["ron", "pon", "kan", "pass"].includes(arg))
        return { claim: { type: arg as "ron" } };
      return null;
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// Startup

/** Picks up games that were running when Fini restarted. */
export const resumeMahjong = async (c: Client) => {
  client = c;
  const tables = await activeTables().catch(() => []);
  for (const t of tables) {
    if (t.status !== "playing" || !t.game) continue;
    schedule(t);
  }
};

/** Clears every table clock (tests, and shutdown). */
export const stopMahjongTimers = () => {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
};

/** Runs a table's timeout now, as if its clock had run out (tests). */
export const expireTable = async (tableId: string) => {
  const t = await getTable(tableId);
  if (t?.game) await onTimeout(tableId, t.game.step);
};
