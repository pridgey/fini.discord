import {
  DUNGEON,
  DungeonRuleError,
  buyOffer,
  chooseDoor,
  coinFor,
  cooldownLeft,
  createRun,
  leaveShop,
  nextSlot,
  playEvent,
  playFight,
  tagOf,
  type DungeonState,
  type EventRoom,
  type FightRoom,
  type Room,
  type RoomSource,
  type ShopRoom,
} from "./dungeon";
import { CARD_EMOJI } from "./rules";
import { TUTORIAL_ART } from "./tutorialArt";
import type { BattleCard } from "./types";
import type { CardType } from "../../types/PocketbaseTablesV2";

/**
 * The dungeon tutorial: five rooms on rails, with a coach.
 *
 * It is a real run in everything but the stakes. The moves go through the same
 * engine (`dungeon.ts`) and the message through the same builder, so what it
 * teaches is what a run does - only the cards, the rooms behind the doors and
 * the dice are fixed, so every lesson lands the way it is written.
 *
 * Nothing is stored. A tutorial is the list of moves made so far, carried in
 * its buttons' ids, and every click replays the list from the start. The
 * script is deterministic, so a replay always arrives where the player left
 * off, and an old button can do no harm: it just replays an older list.
 *
 *   1. A fight: the type wheel.            Only Power cards are allowed.
 *   2. An event: stat + die, and resting.  Any card; the goose decides.
 *   3. The shop: geld, and what it costs.  Buy anything, or nothing.
 *   4. A fight nobody can win: wards.      Anything but Captain Crouton.
 *   5. The boss: abilities and slots.      Power cards, Crouton for choice.
 *   Then the way out.
 */

/* --------------------------------------------------------------- the cast -- */

const tutorialCard = (
  id: string,
  name: string,
  type: CardType,
  [power, wit, heart]: [number, number, number],
  art: string,
  keyword = "",
): BattleCard => ({
  instanceId: `tutorial-${id}`,
  definitionId: `tutorial-${id}`,
  name,
  series: "Dungeon School",
  rarity: "common",
  type,
  stats: { power, wit, heart },
  keyword,
  foil: false,
  tags: [],
  cost: 2,
  artUrl: art,
});

export const TUTORIAL_HAND: BattleCard[] = [
  tutorialCard(
    "brick",
    "Brick Brickman",
    "power",
    [7, 4, 4],
    TUTORIAL_ART.brick,
  ),
  tutorialCard(
    "owlbert",
    "Professor Owlbert",
    "wit",
    [3, 8, 4],
    TUTORIAL_ART.owlbert,
  ),
  tutorialCard(
    "grandma",
    "Grandma Tsunami",
    "heart",
    [3, 4, 8],
    TUTORIAL_ART.grandma,
  ),
  tutorialCard(
    "crouton",
    "Captain Crouton",
    "power",
    [7, 3, 5],
    TUTORIAL_ART.crouton,
    "last_stand",
  ),
  tutorialCard(
    "accountant",
    "The Accountant",
    "wit",
    [4, 7, 4],
    TUTORIAL_ART.accountant,
  ),
  tutorialCard(
    "gerald",
    "Gerald the Golden Retriever",
    "heart",
    [5, 2, 8],
    TUTORIAL_ART.gerald,
  ),
];

const CROUTON = "tutorial-crouton";

const fight = (
  enemy: BattleCard,
  geld: number,
  tier: FightRoom["tier"] = "normal",
): FightRoom => ({ kind: "fight", tier, geld, enemy });

const SQUIRREL = fight(
  tutorialCard(
    "squirrel",
    "The Sneaky Squirrel",
    "wit",
    [2, 6, 3],
    TUTORIAL_ART.squirrel,
  ),
  12,
);

const GOOSE: EventRoom = {
  kind: "event",
  title: "The Goose Tribunal",
  text: "A goose in a tiny powdered wig bangs a gavel. You stand accused of Bread Crimes.",
  stat: "heart",
  target: 9,
  reward: { kind: "geld", amount: 10 },
  passText:
    "You plead your case with real feeling. The goose weeps, rules in your favour and fines itself.",
  failText:
    "The goose finds you guilty of Bread Crimes and honks you out of the courtroom.",
};

const SHOP: ShopRoom = {
  kind: "shop",
  offers: [
    {
      name: "Whetstone",
      blurb: "+1 Power on all your cards, for the run",
      price: 12,
      sold: false,
      effect: {
        kind: "buff",
        buff: {
          name: "Whetstone",
          note: "+1 Power",
          mods: { power: 1 },
          rooms: null,
        },
      },
    },
    {
      name: "Lucky Coin",
      blurb: "+1 to every event roll, for the run",
      price: 8,
      sold: false,
      effect: {
        kind: "buff",
        buff: {
          name: "Lucky Coin",
          note: "+1 event rolls",
          mods: { roll: 1 },
          rooms: null,
        },
      },
    },
    {
      name: "Ward Charm",
      blurb: "Survive one lost fight - the charm breaks instead of the run",
      price: 18,
      sold: false,
      effect: { kind: "ward" },
    },
  ],
};

const RACCOONS = fight(
  tutorialCard(
    "raccoons",
    "Seven Raccoons in a Trenchcoat",
    "wit",
    [99, 99, 99],
    TUTORIAL_ART.raccoons,
  ),
  12,
);

const PAPERWORK = fight(
  tutorialCard(
    "paperwork",
    "Lord Paperwork, Keeper of Forms",
    "wit",
    [3, 9, 4],
    TUTORIAL_ART.paperwork,
  ),
  30,
  "boss",
);

/* Rooms behind the doors the tutorial does not let you take. Only their door's
   hint is ever seen, so they need a type and nothing else. */
const elsewhere = (
  type: CardType,
  tier: FightRoom["tier"] = "normal",
): FightRoom =>
  fight(
    tutorialCard(`elsewhere-${type}`, "Somebody Else", type, [5, 5, 5], ""),
    0,
    tier,
  );

/* ------------------------------------------------------------- the script -- */

export type TutorialStage =
  | "wheel"
  | "doors"
  | "event"
  | "after-event"
  | "shop"
  | "to-raccoons"
  | "raccoons"
  | "to-boss"
  | "boss"
  | "walk-out"
  | "done";

const STAGES: Record<number, { room: TutorialStage; doors: TutorialStage }> = {
  1: { room: "wheel", doors: "doors" },
  2: { room: "event", doors: "after-event" },
  3: { room: "shop", doors: "to-raccoons" },
  4: { room: "raccoons", doors: "to-boss" },
  5: { room: "boss", doors: "walk-out" },
};

const stageOf = (state: DungeonState, done: boolean): TutorialStage =>
  done ? "done" : STAGES[state.depth][state.phase];

/** What the doors out of `depth` open onto. Door 1 is always the lesson. */
const doorsOutOf = (depth: number, opened: Room[]): Room[] => {
  switch (depth) {
    case 1:
      return [GOOSE, elsewhere("heart")];
    case 2:
      // A failed event leaves one door - and the lesson is in seeing that.
      return opened.length === 1 ? [SHOP] : [SHOP, elsewhere("power")];
    case 3:
      return [RACCOONS, elsewhere("heart")];
    case 4:
      return [PAPERWORK, elsewhere("heart", "boss")];
    default:
      return [elsewhere("power"), elsewhere("heart")];
  }
};

/** The dice always land on 4, and every room the engine draws is replaced. */
const SOURCE: RoomSource = {
  pool: [elsewhere("power").enemy],
  hand: TUTORIAL_HAND,
  random: () => 0.55,
};

const ready = (state: DungeonState) =>
  TUTORIAL_HAND.map((card, index) => ({ card, index })).filter(
    ({ card }) => cooldownLeft(state, card.instanceId) === 0,
  );

/** The moves the coach is waiting for right now, as button actions. */
export const allowedMoves = (
  state: DungeonState,
  stage: TutorialStage,
): Set<string> => {
  const cards = (keep: (card: BattleCard) => boolean) =>
    ready(state)
      .filter(({ card }) => keep(card))
      .map(({ index }) => `c${index}`);

  switch (stage) {
    case "wheel":
    case "boss":
      return new Set(cards((card) => card.type === "power"));
    case "event":
      return new Set(cards(() => true));
    case "raccoons":
      return new Set(cards((card) => card.instanceId !== CROUTON));
    case "shop":
      return new Set([
        "leave",
        ...(state.room.kind === "shop"
          ? state.room.offers.flatMap((offer, index) =>
              offer.sold || offer.price > state.geld ? [] : [`b${index}`],
            )
          : []),
      ]);
    case "walk-out":
      return new Set(["retreat"]);
    case "done":
      return new Set();
    default:
      return new Set(["d0"]);
  }
};

/** One move, through the real engine. Null when it is not a legal move. */
const apply = (state: DungeonState, action: string): DungeonState | null => {
  const index = Number.parseInt(action.slice(1), 10);
  try {
    if (action === "leave") return leaveShop(state, SOURCE);
    if (action.startsWith("d")) return chooseDoor(state, index);
    if (action.startsWith("b")) return buyOffer(state, index, SOURCE);
    if (action.startsWith("c")) {
      const card = TUTORIAL_HAND[index];
      if (!card) return null;
      return state.room.kind === "event"
        ? playEvent(state, card, SOURCE).state
        : playFight(state, card, SOURCE).state;
    }
    return null;
  } catch (error) {
    if (error instanceof DungeonRuleError) return null;
    throw error;
  }
};

const start = (): DungeonState => {
  const state = createRun(SOURCE)!;
  // Every run starts with a ward, and the tutorial's has a job to do.
  return {
    ...state,
    room: SQUIRREL,
    path: [{ room: tagOf(SQUIRREL) }],
    wards: DUNGEON.startingWards,
  };
};

export type TutorialView = {
  state: DungeonState;
  stage: TutorialStage;
  /** The moves that got here, the ones that were allowed. */
  moves: string[];
  allowed: Set<string>;
  hand: { card: BattleCard; index: number }[];
  coach: string;
};

/**
 * Plays `moves` from the start. A move the coach was not waiting for is
 * dropped, so a doctored button id can only ever take the script's own path.
 */
export const replayTutorial = (moves: string[]): TutorialView => {
  let state = start();
  let done = false;
  const kept: string[] = [];

  for (const move of moves) {
    if (done) break;
    if (!allowedMoves(state, stageOf(state, done)).has(move)) continue;

    if (move === "retreat") {
      done = true;
      kept.push(move);
      continue;
    }

    const next = apply(state, move);
    if (!next) continue;
    if (next.phase === "doors" && state.phase === "room") {
      next.doors = doorsOutOf(next.depth, next.doors);
    }
    state = next;
    kept.push(move);
  }

  const stage = stageOf(state, done);
  return {
    state,
    stage,
    moves: kept,
    allowed: allowedMoves(state, stage),
    hand: TUTORIAL_HAND.map((card, index) => ({ card, index })),
    coach: coachFor(stage, state),
  };
};

/* A tutorial's moves ride in its buttons' ids, two characters a move. */
const SHORT: Record<string, string> = { leave: "l", retreat: "r" };
const LONG: Record<string, string> = { l: "leave", r: "retreat" };

export const encodeMoves = (moves: string[]): string =>
  moves.map((move) => SHORT[move] ?? move).join("");

export const decodeMoves = (raw: string): string[] =>
  (raw.match(/[cdb]\d|[lr]/g) ?? []).map((token) => LONG[token] ?? token);

/* -------------------------------------------------------------- the coach -- */

const lastResult = (state: DungeonState) => state.path.at(-1)?.result;
const GELD_PER_FC = Math.round(1 / DUNGEON.coinPerGeld);
const keptShare =
  DUNGEON.fallenKeep === 0.5
    ? "half"
    : `${Math.round(DUNGEON.fallenKeep * 100)}%`;

/** The coach's note for where the tutorial stands. Markdown, for Discord. */
const coachFor = (stage: TutorialStage, state: DungeonState): string => {
  const fc = coinFor(state.geld);

  switch (stage) {
    case "wheel":
      return [
        "## 🎓 Dungeon School · Lesson 1: the type wheel",
        "Welcome! This is a practice run with a borrowed hand. Nothing you do here costs or earns anything.",
        "Every card has a type. **Power beats Wit, Wit beats Heart, Heart beats Power**, and beating the other card's type multiplies your attack by **×1.5**.",
        "A fight is one clash: your type stat (×1.5 if you have the edge) minus their matching stat is your damage, and theirs works the same way. More damage wins.",
        "**The Sneaky Squirrel** is a **Wit** card and thinks it's very clever. Play a **Power** card and show it otherwise.",
      ].join("\n");

    case "doors":
      return [
        "## 🎓 Lesson 2: doors",
        `The squirrel has been flattened, and you earned **geld**, the dungeon's money. You've got ${state.geld}.`,
        "After every room you pick one of two doors. A door only tells you *what kind* of room is behind it: a fight and its type, a 🛒 shop, or a ❓ event. Pick the doors your ready cards can beat.",
        "Take the **❓ Event**. (The other door is closed for the lesson.)",
      ].join("\n");

    case "event":
      return [
        "## 🎓 Lesson 3: events, and resting",
        "Order in the court! An event is a stat check: the card you play adds its **Heart** to a roll of a six-sided die and has to reach the target. The **%** on each button is that card's chance.",
        "Pass and you win a prize. Fail and you lose your choice of door next time. Some events sting harder than that: a card falls asleep, or your hand gets shuffled away.",
        `Look at your hand: the card you played in room 1 is **resting** (⏳). Every card you play sits out the next ${DUNGEON.cooldownRooms} rooms, so a hand of six is a rotation, not a stack of favourites.`,
        "Play whichever card you think will sway the goose.",
      ].join("\n");

    case "after-event":
      return [
        lastResult(state) === "passed"
          ? "## 🪿 Case dismissed\nThe goose has been moved to tears. Justice, and 10 geld, are yours."
          : "## 🪿 Guilty of Bread Crimes\nThat's why there's only **one door** this time: a failed event costs you the choice. (The goose would like to see your Heart cards next time.)",
        `You're carrying **${state.geld} geld** — let's go spend some.`,
      ].join("\n");

    case "shop":
      return [
        "## 🎓 Lesson 4: the shop",
        "Geld only spends in shops, and whatever you buy lasts for the rest of the run.",
        `But the geld you **don't** spend turns into Finicoin when you walk out: ${GELD_PER_FC} geld is 1 fc. You'd walk out with **${fc} fc** right now. So every purchase is a bet that it'll carry you through enough rooms to pay for itself.`,
        "Most shops also sell one special item: a **Mulligan** to redeal your hand from your deck, a **Treasure Map** to see who's behind the doors, a **Strong Coffee** to wake a resting card, and more.",
        "Buy anything you like (the **Ward Charm** is nice, just saying), then leave the shop.",
      ].join("\n");

    case "to-raccoons":
      return [
        "## 🚪 Onward",
        "A **Wit** room. Probably just another squirrel. Probably.",
      ].join("\n");

    case "raccoons":
      return [
        "## 🎓 Lesson 5: losing, gracefully",
        "That is not a squirrel. That is **seven raccoons in a trenchcoat**, and those stats are not a typo.",
        "Normally losing a fight ends your run. But every run starts with a 🛡️ **ward**, and a ward breaks in your place.",
        "Play anything. It's going to go badly. (Anything except **Captain Crouton**. He has an appointment with a boss.)",
      ].join("\n");

    case "to-boss":
      return [
        "## 🦝 Well, that happened",
        `The raccoons have left with your ward and somebody's sandwich. But you're still standing${state.wards > 0 ? `, with ${state.wards} ward left` : ""}.`,
        "## 🎓 Lesson 6: bosses",
        `**Every ${DUNGEON.bossEvery}th room is a boss**, behind both doors. Bosses are tougher and pay much more, and beating one drops a card for your collection, banked even if you fall later.`,
        "Take the **Wit** boss door.",
      ].join("\n");

    case "boss":
      return [
        "## 🎓 Lesson 7: abilities",
        "Some cards have an **ability**. Captain Crouton's is **Last Stand**: +3 to his type stat in the **final slot**.",
        `Fights in a run count in threes, like a battle, and shops and events don't count. This is fight 3, so it's **slot ${nextSlot(state)} of ${DUNGEON.legLength}**: Crouton's moment. Then the count starts over at slot 1.`,
        `Lord Paperwork is **Wit**. Play a **Power** card. Crouton recommended, and he's ready: resting only lasts ${DUNGEON.cooldownRooms} rooms.`,
      ].join("\n");

    case "walk-out":
      return [
        "## 📜 Form 27B, *Defeat*: approved",
        `${CARD_EMOJI} In a real run that boss drop would land in your collection. This one's imaginary, sorry.`,
        "## 🎓 Lesson 8: getting out",
        "There's no last room: the enemies keep getting stronger until your hand can't keep up. The real skill is knowing when to leave.",
        `**Walk out** and all your geld becomes Finicoin. **Fall in a fight** and you keep only ${keptShare}. A real run costs **${DUNGEON.entryFee} fc** to enter.`,
        "Hit **Walk out** to graduate.",
      ].join("\n");

    case "done":
      return [
        "## 🎓 You graduated from Dungeon School!",
        `You walked out of room ${state.depth} with **${state.geld} geld**, which would be **${fc} fc** in a real run.`,
        "",
        "**The cheat sheet**",
        "- Power beats Wit, Wit beats Heart, Heart beats Power: **×1.5** for the edge.",
        `- A played card rests for the next ${DUNGEON.cooldownRooms} rooms. Every room counts, shops and events too.`,
        `- Doors show the kind of room, not the enemy. Every ${DUNGEON.bossEvery}th room is a boss.`,
        "- Events: stat + 🎲 against a target. Failing costs a door, or something worse.",
        `- Geld spends in shops or becomes fc when you walk out. Falling keeps ${keptShare}.`,
        "- Wards save you from one lost fight. You start with one.",
        "",
        `Ready for the real thing? \`/finicard dungeon\`: ${DUNGEON.entryFee} fc, and you bring a deck of your own.`,
      ].join("\n");
  }
};
