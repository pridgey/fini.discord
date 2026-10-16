import { converseWithAI } from "../modules/aiChat/aiChat";
import { CHAT_MARKER, parseChatRequests, splitForChat } from "../modules/minecraft/botChat";
import { BotControl } from "../modules/minecraft/botControl";
import { decideLifecycle } from "../modules/minecraft/botLifecycle";
import {
  DEFAULT_WANDER_CONFIG,
  decideWander,
  initialWanderState,
  type Vec3,
  type WanderState,
} from "../modules/minecraft/botWander";
import {
  MINECRAFT_BOT_NAMES,
  MINECRAFT_CHAT_TRIGGER,
} from "../modules/minecraft/minecraft.config";
import { humanPlayers } from "../modules/minecraft/parsePlayerList";
import { rconConfig } from "../modules/minecraft/rcon.config";
import {
  getLogMarker,
  readLogSince,
  type LogMarker,
} from "../modules/minecraft/waitForServerReady";

/**
 * Fini's presence in the Minecraft world: when the bot exists, where it walks,
 * and answering when someone talks to it.
 *
 * Runs as its own process alongside the monitor. It deliberately never keeps
 * the server alive - the monitor excludes bot names from its player count, so
 * an empty server still shuts down on schedule and takes the bot with it. This
 * process then waits for the server to come back.
 */

const BOT_NAME = MINECRAFT_BOT_NAMES[0] || "Fini";

/** Matches the interval DEFAULT_WANDER_CONFIG is tuned for. */
const SAMPLE_INTERVAL_MS = 1500;

/** Backoff while the server is down, which is most of the time. */
const IDLE_POLL_MS = 15000;

if (!rconConfig.password) {
  console.error(
    "MINECRAFT_RCON_PASS is not set - run from the project root with " +
      "`bun --env-file=.env run services/fini-bot.service.ts`.",
  );
  process.exit(1);
}

const bot = new BotControl(rconConfig, BOT_NAME);

let state: WanderState = initialWanderState();
let previous: Vec3 | null = null;
/** Where the bot was first seen on dry land - the centre of its leash. */
let anchor: Vec3 | null = null;
let running = true;
/** How far through latest.log the chat bridge has read. */
let logMarker: LogMarker | null = null;
/** Players with a reply already in flight, so one message gets one answer. */
const answering = new Set<string>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fmt = (v: Vec3) =>
  `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`;

/** Clears per-session tracking so a respawned bot starts fresh. */
const resetSession = () => {
  state = initialWanderState();
  previous = null;
  anchor = null;
};

/**
 * Answers one "hey fini" from in-game chat.
 *
 * Replies go to everyone rather than just the asker - it reads as a
 * conversation in the room, which is the point of him being there.
 */
const answer = async (player: string, message: string) => {
  if (answering.has(player)) return;
  answering.add(player);

  try {
    console.log(`${player} asked: ${message}`);
    const reply = await converseWithAI({
      /*
       * Keyed on the Minecraft name, so in-game conversation has its own
       * history rather than being mixed into that player's Discord thread.
       */
      userID: `minecraft:${player}`,
      message,
      server: "minecraft",
    });

    for (const chunk of splitForChat(reply)) {
      await bot.broadcast(chunk);
    }
  } catch (error) {
    console.error("Failed to answer in-game chat:", error);
    try {
      await bot.broadcast("sorry, my brain glitched. try again?");
    } catch {
      // Server went away mid-reply
    }
  } finally {
    answering.delete(player);
  }
};

/** Reads any new chat the KubeJS script echoed into the log. */
const pumpChat = async () => {
  if (logMarker === null) {
    // Start from the end, so a restart doesn't answer hours of old questions
    logMarker = await getLogMarker();
    return;
  }

  const { text, marker } = await readLogSince(logMarker);
  logMarker = marker;
  if (!text.includes(CHAT_MARKER)) return;

  for (const request of parseChatRequests(text, MINECRAFT_CHAT_TRIGGER)) {
    // Not awaited: a model reply takes seconds and the bot should keep walking
    void answer(request.player, request.message);
  }
};

/** One pass of lifecycle, then wandering. Returns how long to wait next. */
const tick = async (): Promise<number> => {
  const list = await bot.send("list");
  const humans = humanPlayers(list, MINECRAFT_BOT_NAMES);
  const botOnline = list.toLowerCase().includes(BOT_NAME.toLowerCase());

  const lifecycle = decideLifecycle({
    humansOnline: humans?.length ?? null,
    botOnline,
  });

  if (lifecycle === "spawn" && humans && humans.length > 0) {
    const host = humans[0];
    console.log(`${humans.join(", ")} online - spawning ${BOT_NAME} near ${host}`);
    await bot.spawnNear(host);
    resetSession();
    return SAMPLE_INTERVAL_MS;
  }

  if (lifecycle === "despawn") {
    console.log(`nobody left online - despawning ${BOT_NAME}`);
    await bot.stop();
    await bot.despawn();
    resetSession();
    return IDLE_POLL_MS;
  }

  if (!botOnline) return IDLE_POLL_MS;

  await pumpChat();
  return wander();
};

/** One wandering decision. */
const wander = async (): Promise<number> => {
  const position = await bot.getPosition();
  if (!position) return SAMPLE_INTERVAL_MS;

  const heading = await bot.getHeading();
  if (heading === null) return SAMPLE_INTERVAL_MS;

  /*
   * Ground lookahead every sample, so it turns before a drop rather than after
   * falling in. Headroom is only worth a probe when it is already stuck, since
   * that is the only time a jump is on the table.
   */
  const safeDistanceAhead = await bot.senseGround(
    position,
    heading,
    DEFAULT_WANDER_CONFIG.lookaheadBlocks,
  );
  const senses = {
    safeDistanceAhead,
    headroom: state.noProgressSamples > 0 ? await bot.senseHeadroom(position) : undefined,
    inWater: await bot.senseWater(position),
  };

  /*
   * Anchor on dry land. Anchoring wherever the bot is first seen once put the
   * centre of its leash in the middle of an ocean, which aims every recall and
   * every rescue back into the water.
   */
  if (anchor === null) {
    if (senses.inWater) return SAMPLE_INTERVAL_MS;
    anchor = position;
    console.log(
      `${BOT_NAME} anchored at ${fmt(position)} with a ` +
        `${DEFAULT_WANDER_CONFIG.leashRadius} block leash`,
    );
  }

  const { action, state: nextState } = decideWander({
    position,
    previous,
    anchor,
    state,
    senses,
  });

  if (action.kind === "rescue") {
    const target = rescueTarget(anchor);
    console.log(
      `${BOT_NAME} is stuck in terrain at ${fmt(position)} - dropping it at ` +
        `${target.x.toFixed(0)},${target.z.toFixed(0)}`,
    );
    await bot.rescue(target);
    previous = null;
    state = nextState;
    return SAMPLE_INTERVAL_MS;
  }

  if (action.kind !== "walk") {
    console.log(`${BOT_NAME} at ${fmt(position)}: ${describe(action)}`);
  }

  await bot.apply(action, heading);
  previous = position;
  state = nextState;
  return SAMPLE_INTERVAL_MS;
};

/**
 * Somewhere inside the leash, high enough to fall clear of whatever it was
 * stuck in. Falling is safe in creative, and landing by gravity means not
 * needing to know where the surface is.
 */
const rescueTarget = (anchor: Vec3): Vec3 => {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * (DEFAULT_WANDER_CONFIG.leashRadius / 2);
  return {
    x: anchor.x + Math.cos(angle) * distance,
    y: 200,
    z: anchor.z + Math.sin(angle) * distance,
  };
};

const describe = (action: { kind: string } & Record<string, unknown>) => {
  switch (action.kind) {
    case "jump":
      return "blocked, jumping";
    case "swim":
      return "in water, swimming up";
    case "turn": {
      const why =
        action.reason === "drift"
          ? "drifting"
          : action.reason === "wedged"
            ? "going nowhere, resetting course"
            : "blocked, turning";
      return `${why} to ${Number(action.heading).toFixed(0)}°`;
    }
    case "recall":
      return `outside its leash, heading back to ${Number(action.heading).toFixed(0)}°`;
    default:
      return action.kind;
  }
};

const main = async () => {
  console.log(
    `Starting Fini bot service for "${BOT_NAME}" ` +
      `(rcon ${rconConfig.host}:${rconConfig.port}, trigger "${MINECRAFT_CHAT_TRIGGER}")`,
  );

  while (running) {
    let wait = SAMPLE_INTERVAL_MS;
    try {
      wait = await tick();
    } catch {
      /*
       * Overwhelmingly the server being down, which is this process's normal
       * resting state. Back off rather than hammering a dead port.
       */
      if (anchor !== null) {
        console.log("Lost contact with the server, standing by");
        resetSession();
      }
      logMarker = null;
      wait = IDLE_POLL_MS;
    }
    await sleep(wait);
  }
};

const shutdown = async () => {
  if (!running) return;
  running = false;
  console.log("Stopping bot service");
  try {
    // Don't leave it walking into a wall forever
    await bot.stop();
  } catch {
    // Server already gone
  }
  await bot.disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await main();
