/**
 * Finicards v2 balance sweep.
 *
 *   bun run scripts/finicards_v2_simulate.ts
 *   bun run scripts/finicards_v2_simulate.ts --matches 5000 --keywords
 *   bun run scripts/finicards_v2_simulate.ts --grade
 *   bun run scripts/finicards_v2_simulate.ts --dungeon --keywords
 *
 * The design doc names `typeMultiplier` "the single number defining game feel"
 * and expects extended tuning, so this exists to answer the tuning question with
 * numbers instead of vibes. It touches no database and no Discord - it builds a
 * synthetic pool through the same `normalizeSpread` the real cards go through,
 * then plays out four experiments at each multiplier, one per design pillar.
 *
 * It models the real match structure: a deck is built from the collection, a hand
 * of `HAND_SIZE` is dealt from the deck, both hands are revealed, and each side
 * picks `RULES.rounds` of their hand knowing what the other is holding. Modelling
 * free choice from the whole collection instead - which is what an earlier
 * version did - overstates depth enormously, because being able to name any card
 * you own is a completely different game from playing the hand you were dealt.
 *
 * The experiments:
 *
 *   1. Depth beats power     - a deep collection that can answer a composition
 *                              vs a six-card collection that cannot.
 *   2. Rarity is not power   - three full-arts vs three commons.
 *   3. Mono-type is punished - a mono-type lineup vs its counter, no rule for it.
 *   4. Matches feel decisive - how often a match ends level on rounds.
 */

import { resolveMatch } from "../modules/finicards/battleEngine";
import { buildDeckCards } from "../modules/finicards/decks";
import { HAND_SIZE, dealHand } from "../modules/finicards/draw";
import {
  DUNGEON,
  buyOffer,
  chooseDoor,
  createRun,
  eventChance,
  leaveShop,
  modsOf,
  payoutFor,
  playEvent,
  playFight,
  redealHand,
  skipEvent,
  type DungeonState,
  type Room,
  type RoomSource,
} from "../modules/finicards/dungeon";
import { PACK_ODDS, rollRarity } from "../modules/finicards/packs";
import { assignKeyword } from "../modules/finicards/convertLegacyCards";
import { GRADE_LABEL, KEYWORDS } from "../modules/finicards/keywords";
import {
  RARITY_COST,
  RULES,
  TYPE_BEATS,
  TYPE_PRIORITY,
} from "../modules/finicards/rules";
import { normalizeSpread } from "../modules/finicards/statBudget";
import type { BattleCard } from "../modules/finicards/types";
import type { CardRarity, CardType } from "../types/PocketbaseTablesV2";

/* -------------------------------------------------------------------------- */
/* Arguments                                                                  */
/* -------------------------------------------------------------------------- */

const argumentValue = (flag: string, fallback: number): number => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const MATCHES = argumentValue("--matches", 2000);
const KEYWORDS_ENABLED = process.argv.includes("--keywords");
const GRADE_MODE = process.argv.includes("--grade");
const DUNGEON_MODE = process.argv.includes("--dungeon");
const MULTIPLIERS = [1.0, 1.25, 1.5, 1.75, 2.0];

/* -------------------------------------------------------------------------- */
/* Deterministic randomness - a tuning tool that changes its mind every run is */
/* useless, so the sweep is seeded.                                           */
/* -------------------------------------------------------------------------- */

const makeRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T,>(items: T[], random: () => number): T =>
  items[Math.floor(random() * items.length)];

/* -------------------------------------------------------------------------- */
/* Synthetic pool                                                             */
/* -------------------------------------------------------------------------- */

/** Spreads spanning specialist to generalist, at each rarity's own ceiling. */
const SHAPES: Record<CardRarity, number[][]> = {
  common: [
    [5, 5, 5],
    [6, 5, 4],
    [7, 5, 3],
    [7, 4, 4],
    [6, 6, 3],
  ],
  uncommon: [
    [9, 3, 3],
    [8, 4, 3],
    [8, 5, 2],
    [7, 6, 2],
    [9, 4, 2],
  ],
  full_art: [
    [12, 2, 1],
    [11, 3, 1],
    [10, 3, 2],
    [10, 4, 1],
    [12, 1, 2],
  ],
};

const SERIES_COUNT = 12;

const buildPool = (perCombination: number): BattleCard[] => {
  const pool: BattleCard[] = [];
  const rarities: CardRarity[] = ["common", "uncommon", "full_art"];

  for (const rarity of rarities) {
    for (const type of TYPE_PRIORITY) {
      for (let index = 0; index < perCombination; index++) {
        const shape = SHAPES[rarity][index % SHAPES[rarity].length];
        // Rotate the shape so the spike lands on this card's type.
        const others = TYPE_PRIORITY.filter((other) => other !== type);
        const spread = normalizeSpread(
          {
            [type]: shape[0],
            [others[0]]: shape[1],
            [others[1]]: shape[2],
          } as Record<CardType, number>,
          rarity,
        );

        pool.push({
          instanceId: `${rarity}-${type}-${index}`,
          definitionId: `${rarity}-${type}-${index}`,
          name: `${rarity}/${type}/${index}`,
          /* Spread over a handful of series and colours, as the real pool is,
             so the lineup keywords (Kinship, Synergy) fire about as often as
             they would rather than on every card. */
          series: `sim-${index % SERIES_COUNT}`,
          rarity,
          type,
          stats: spread,
          // Rolled the way the import rolls them, so the sweep sees the real
          // per-rarity odds rather than an even spread of keywords.
          keyword: KEYWORDS_ENABLED
            ? assignKeyword(`${rarity}-${type}-${index}`, rarity)
            : "",
          foil: false,
          tags: [`colour-${index % 4}`, "legacy"],
          cost: RARITY_COST[rarity],
        });
      }
    }
  }

  return pool;
};

/* Keywords are rolled against odds as low as 1%, which six cards per
   combination cannot represent - the pool has to be big enough to hold them. */
const POOL = buildPool(KEYWORDS_ENABLED ? 60 : 6);

const ofRarity = (rarity: CardRarity) =>
  POOL.filter((card) => card.rarity === rarity);
const ofType = (type: CardType) => POOL.filter((card) => card.type === type);

/* -------------------------------------------------------------------------- */
/* Lineup strategies                                                          */
/* -------------------------------------------------------------------------- */

/** Power > Wit > Heart > Power - what beats the given type. */
const counterOf: Record<CardType, CardType> = {
  power: "heart",
  wit: "power",
  heart: "wit",
};

const typeStat = (card: BattleCard) => card.stats[card.type];

/**
 * A deck built from a collection, the way `/finicard deck build` builds it.
 *
 * This is where collection depth actually pays: a deep collection produces a
 * stronger 20-card deck, and every hand is then dealt from that better deck.
 */
const deckFrom = (collection: BattleCard[], size = 20): BattleCard[] => {
  const asOwned = collection.map((card) => ({
    id: card.instanceId,
    definition: {
      card_type: card.type,
      rarity: card.rarity,
      tags: card.tags,
      power: card.stats.power,
      wit: card.stats.wit,
      heart: card.stats.heart,
      cost: card.cost,
      card_name: card.name,
      series: card.series,
      keyword: card.keyword,
      art_url: "",
      legacy_card: "",
      set_piece: "",
      population: 0,
      active: true,
    },
    foil: card.foil,
  })) as any[];

  const chosen = new Set(buildDeckCards(asOwned, {}, size));
  return collection.filter((card) => chosen.has(card.instanceId));
};

/**
 * Picking a lineup from a dealt hand, knowing the opponent's hand.
 *
 * Both hands are face up at this point, so the read is: which of my five best
 * answer the types they are holding? Cards that counter something in their hand
 * are worth more than raw stats, which is the whole point of the type wheel.
 */
const pickFromHand = (
  hand: BattleCard[],
  opposingHand: BattleCard[],
  rounds: number,
): BattleCard[] => {
  const threat: Record<CardType, number> = { power: 0, wit: 0, heart: 0 };
  for (const card of opposingHand) threat[card.type] += 1;

    // A card is worth more when the opponent is holding what it *beats*.
  // `counterOf[t]` is what beats t, so using it here would have rewarded a card
  // for facing its own predator - exactly backwards.
  const score = (card: BattleCard) =>
    typeStat(card) + 4 * threat[TYPE_BEATS[card.type]];

  return [...hand].sort((a, b) => score(b) - score(a)).slice(0, rounds);
};

/** Deals a hand from a deck and picks a lineup out of it. */
const playFrom = (
  deck: BattleCard[],
  opposingHand: BattleCard[],
  rounds: number,
  random: () => number,
): BattleCard[] =>
  pickFromHand(dealHand(deck, HAND_SIZE, random), opposingHand, rounds);

/* -------------------------------------------------------------------------- */
/* Experiments                                                                */
/* -------------------------------------------------------------------------- */

type Tally = { wins: number; losses: number; draws: number };

const rate = (tally: Tally): string => {
  const total = tally.wins + tally.losses + tally.draws;
  if (total === 0) return "n/a";
  return `${((tally.wins / total) * 100).toFixed(1)}%`;
};

const runSeries = (
  multiplier: number,
  build: (random: () => number) => {
    challenger: BattleCard[];
    defender: BattleCard[];
  },
  seed: number,
): Tally & { levelOnRounds: number } => {
  const random = makeRandom(seed);
  const tally: Tally & { levelOnRounds: number } = {
    wins: 0,
    losses: 0,
    draws: 0,
    levelOnRounds: 0,
  };

  for (let match = 0; match < MATCHES; match++) {
    const { challenger, defender } = build(random);
    const result = resolveMatch({
      challengerLineup: challenger,
      defenderLineup: defender,
      rules: { typeMultiplier: multiplier, keywordsEnabled: KEYWORDS_ENABLED },
    });

    if (result.roundsWon.challenger === result.roundsWon.defender) {
      tally.levelOnRounds += 1;
    }

    if (result.winner === "challenger") tally.wins += 1;
    else if (result.winner === "defender") tally.losses += 1;
    else tally.draws += 1;
  }

  return tally;
};

const SHALLOW_SIZE = 6;
const DEEP_SIZE = 120;

/** Deals both hands, then lets each side pick knowing the other's hand. */
const playMatch = (
  challengerDeck: BattleCard[],
  defenderDeck: BattleCard[],
  random: () => number,
) => {
  const challengerHand = dealHand(challengerDeck, HAND_SIZE, random);
  const defenderHand = dealHand(defenderDeck, HAND_SIZE, random);
  return {
    challenger: pickFromHand(challengerHand, defenderHand, RULES.rounds),
    defender: pickFromHand(defenderHand, challengerHand, RULES.rounds),
  };
};

const experiments = (multiplier: number) => {
  /* 1. A deep collection's deck against a six-card collection's deck. */
  const depth = runSeries(
    multiplier,
    (random) => {
      const deep = deckFrom(
        Array.from({ length: DEEP_SIZE }, () => pick(POOL, random)),
      );
      const shallow = Array.from({ length: SHALLOW_SIZE }, () =>
        pick(POOL, random),
      );
      return playMatch(deep, shallow, random);
    },
    1001,
  );

  /* 2a. A full-art deck against a common deck, neither able to read the other. */
  const rarityBlind = runSeries(
    multiplier,
    (random) => {
      const fullArt = dealHand(ofRarity("full_art"), HAND_SIZE, random);
      const common = dealHand(ofRarity("common"), HAND_SIZE, random);
      return {
        challenger: [...fullArt]
          .sort((a, b) => typeStat(b) - typeStat(a))
          .slice(0, RULES.rounds),
        defender: [...common]
          .sort((a, b) => typeStat(b) - typeStat(a))
          .slice(0, RULES.rounds),
      };
    },
    2002,
  );

  /* 2b. The same, with both hands revealed - the doc's actual claim, that a
         common pointed the right way answers a full-art. */
  const rarityAnswered = runSeries(
    multiplier,
    (random) => playMatch(ofRarity("full_art"), ofRarity("common"), random),
    2012,
  );

  /* 3. A mono-type deck against its counter. */
  const monoType = runSeries(
    multiplier,
    (random) => {
      const type = pick(TYPE_PRIORITY, random);
      return playMatch(ofType(type), ofType(counterOf[type]), random);
    },
    3003,
  );

  /* 4. Two even decks - a baseline for how decisive matches feel. */
  const baseline = runSeries(
    multiplier,
    (random) => playMatch(POOL, POOL, random),
    4004,
  );

  return { depth, rarityBlind, rarityAnswered, monoType, baseline };
};

/* -------------------------------------------------------------------------- */
/* Keyword grading                                                            */
/* -------------------------------------------------------------------------- */

/**
 * How much one keyword is worth: two hands are dealt from the same pool and
 * each side picks a lineup, then the challenger's three cards all carry the
 * keyword and the defender's carry none. 50% is "does nothing"; a draw counts
 * as half a win. This is the number a keyword's grade is read off.
 *
 * It understates keywords a player has to build or slot for - the picker here
 * chases type matchups and knows nothing about series or slot order - so those
 * are a floor, not an estimate.
 */
const gradeKeywords = () => {
  const bare = POOL.map((card) => ({ ...card, keyword: "" }));
  /* The same pool with keywords rolled at the real odds. Some keywords only
     mean anything against other keywords (Silence, Mimic, Spoiler, Purist), so
     each is also measured against a field that has them. */
  const rolled = POOL.map((card) => ({
    ...card,
    keyword: assignKeyword(card.instanceId, card.rarity),
  }));

  const mirror = (slug: string | null, field: BattleCard[]): number => {
    const random = makeRandom(7007);
    let score = 0;

    for (let match = 0; match < MATCHES; match++) {
      const { challenger, defender } = playMatch(field, field, random);
      const result = resolveMatch({
        challengerLineup:
          slug === null
            ? challenger
            : challenger.map((card) => ({ ...card, keyword: slug })),
        defenderLineup: defender,
        rules: { keywordsEnabled: true },
      });
      score +=
        result.winner === "challenger" ? 1 : result.winner === "draw" ? 0.5 : 0;
    }

    return (score / MATCHES) * 100;
  };

  const rows = KEYWORDS.map((keyword) => ({
    keyword,
    bare: mirror(keyword.slug, bare),
    field: mirror(keyword.slug, rolled),
  })).sort((a, b) => b.bare + b.field - (a.bare + a.field));

  console.log("Finicards v2 keyword grading");
  console.log(
    `pool ${POOL.length} cards · ${MATCHES} matches per cell · the keyword on all three of one side's cards`,
  );
  console.log(
    `vs bare: opponent has no keywords · vs field: opponent's are rolled at the real odds (a rolled lineup scores ${mirror(null, rolled).toFixed(1)}% there)\n`,
  );
  console.log(`${"keyword".padEnd(14)}${"vs bare".padStart(8)}${"vs field".padStart(10)}  grade`);
  for (const { keyword, bare: bareRate, field } of rows) {
    console.log(
      `${keyword.name.padEnd(14)}${`${bareRate.toFixed(1)}%`.padStart(8)}${`${field.toFixed(1)}%`.padStart(10)}  ${GRADE_LABEL[keyword.grade]}`,
    );
  }
};

/* -------------------------------------------------------------------------- */
/* Dungeons                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How far a run gets and what it pays, for collections of different depth.
 *
 * A run has no last room, so the numbers that matter are how deep a deck goes
 * before it has to stop and how much Finicoin comes back against the fee. Two
 * players are simulated, because the gap between them is what the dungeon is
 * for:
 *
 *   careful  works out every clash before playing and walks out, geld intact,
 *            the moment no card in hand can win the room.
 *   gut      plays the best-looking card and never walks out, so every run
 *            ends in a fall and pays `fallenKeep` of its geld.
 */
const gradeDungeon = () => {
  const rules = { ...RULES, keywordsEnabled: KEYWORDS_ENABLED };
  const MAX_ROOMS = 300;

  type Policy = "careful" | "gut";

  const ready = (state: DungeonState, hand: BattleCard[], at = state.depth) =>
    hand.filter((card) => (state.readyAt[card.instanceId] ?? 0) <= at);

  /** Whether any card that will be ready can win the fight behind a door. */
  const winnable = (
    state: DungeonState,
    hand: BattleCard[],
    door: number,
    source: RoomSource,
  ): boolean => {
    const entered = chooseDoor(state, door);
    return ready(entered, hand).some(
      (card) => playFight(entered, card, source, rules).result === "won",
    );
  };

  const run = (
    deck: BattleCard[],
    policy: Policy,
    random: () => number,
  ): { depth: number; coin: number; cards: number; fullArts: number } => {
    let hand = dealHand(deck, DUNGEON.handSize, random);
    const base: RoomSource = { pool: POOL, random };
    let state = createRun(base)!;
    let fell = false;
    const byId = new Map(deck.map((card) => [card.instanceId, card]));

    for (let guard = 0; guard < MAX_ROOMS * 4 && state.depth < MAX_ROOMS; guard++) {
      // Deal for whatever the last move sent back to the deck, as the store does.
      if (state.redraw?.length) {
        const dealt = redealHand(
          hand.map((card) => card.instanceId),
          state.redraw,
          deck.map((card) => card.instanceId),
          random,
        );
        hand = dealt.hand.map((id) => byId.get(id)!);
        const readyAt = { ...state.readyAt };
        for (const { from, to } of dealt.swapped) {
          delete readyAt[from];
          delete readyAt[to];
        }
        state = { ...state, readyAt, redraw: undefined };
      }
      const source: RoomSource = { ...base, hand };

      if (state.phase === "doors") {
        const score = (room: Room, index: number): number => {
          if (room.kind === "shop") return state.geld >= 8 ? 3 : 0;
          if (room.kind === "event") return 2;
          if (policy === "gut") return 1;
          return winnable(state, hand, index, source) ? 1 : -1;
        };
        const scores = state.doors.map(score);
        state = chooseDoor(state, scores.indexOf(Math.max(...scores)));
        continue;
      }

      const room = state.room;
      const cards = ready(state, hand);

      if (room.kind === "shop") {
        const affordable = room.offers
          .map((offer, index) => ({ offer, index }))
          .filter(({ offer }) => !offer.sold && offer.price <= state.geld)
          // The bots never drink coffee, and see through every door anyway.
          .filter(
            ({ offer }) =>
              offer.effect.kind !== "coffee" &&
              !(offer.effect.kind === "buff" && offer.effect.buff.mods.scout),
          )
          // A redraw only when it would bring back enough of a resting hand.
          .filter(({ offer }) => {
            if (offer.effect.kind !== "redraw") return true;
            const resting = hand.length - cards.length;
            return offer.effect.pick === "all" ? resting >= 4 : resting >= 2;
          })
          .sort((a, b) => a.offer.price - b.offer.price)[0];
        try {
          state = affordable
            ? buyOffer(state, affordable.index, source)
            : leaveShop(state, source);
        } catch {
          // A ware with nothing to act on (a Fresh Shuffle with nothing resting).
          state = leaveShop(state, source);
        }
        continue;
      }

      if (room.kind === "event") {
        const mods = modsOf(state);
        const best = [...cards].sort(
          (a, b) => eventChance(room, b, mods) - eventChance(room, a, mods),
        )[0];
        state =
          best && eventChance(room, best, mods) >= 0.5
            ? playEvent(state, best, source).state
            : skipEvent(state, source);
        continue;
      }

      if (cards.length === 0) break;

      if (policy === "careful") {
        // The cheapest card that wins, so the strong ones are still in hand.
        const wins = cards
          .map((card) => ({ card, outcome: playFight(state, card, source, rules) }))
          .filter(({ outcome }) => outcome.result === "won")
          .sort((a, b) => typeStat(a.card) - typeStat(b.card));
        if (wins.length === 0) break;
        state = wins[0].outcome.state;
        continue;
      }

      const enemy = room.enemy;
      const looks = (card: BattleCard) =>
        typeStat(card) * (TYPE_BEATS[card.type] === enemy.type ? 1.5 : 1) -
        enemy.stats[card.type];
      const outcome = playFight(
        state,
        [...cards].sort((a, b) => looks(b) - looks(a))[0],
        source,
        rules,
      );
      state = outcome.state;
      if (outcome.result === "fell") {
        fell = true;
        break;
      }
    }

    return {
      depth: state.depth,
      coin: payoutFor(state.geld, fell).coin,
      cards: state.loot.length,
      fullArts: state.loot.filter((rarity) => rarity === "full_art").length,
    };
  };

  const pulls = (count: number, random: () => number) =>
    Array.from({ length: count }, () =>
      pick(ofRarity(rollRarity(PACK_ODDS, random)), random),
    );

  const players: [string, (random: () => number) => BattleCard[]][] = [
    ["2 packs, all 10 cards", (random) => pulls(10, random)],
    ["8 packs, best 20", (random) => deckFrom(pulls(40, random))],
    ["24 packs, best 20", (random) => deckFrom(pulls(120, random))],
    ["commons only", (random) => dealHand(ofRarity("common"), 20, random)],
    ["full-arts only", (random) => dealHand(ofRarity("full_art"), 20, random)],
  ];

  console.log("Finicards v2 dungeon depth and payout");
  console.log(
    `fee ${DUNGEON.entryFee} fc · ${DUNGEON.coinPerGeld} fc per geld · hand ${DUNGEON.handSize} · cooldown ${DUNGEON.cooldownRooms} · ${MATCHES} runs per row · keywords ${
      KEYWORDS_ENABLED ? "ON" : "OFF"
    }\n`,
  );
  console.log(
    `${"deck".padEnd(24)}${"player".padEnd(9)}${"avg room".padStart(9)}${"p10".padStart(5)}${"p50".padStart(5)}${"p90".padStart(5)}${"avg fc".padStart(8)}${"profit".padStart(8)}${"cards".padStart(7)}${"full-art".padStart(10)}`,
  );

  for (const [label, build] of players) {
    for (const policy of ["careful", "gut"] as Policy[]) {
      const random = makeRandom(9009);
      const runs = Array.from({ length: MATCHES }, () =>
        run(build(random), policy, random),
      );
      const depths = runs.map((result) => result.depth).sort((a, b) => a - b);
      const at = (share: number) => depths[Math.floor((MATCHES - 1) * share)];
      const mean = (values: number[]) =>
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const profit =
        runs.filter((result) => result.coin > DUNGEON.entryFee).length / MATCHES;

      console.log(
        `${label.padEnd(24)}${policy.padEnd(9)}${mean(depths).toFixed(1).padStart(9)}${String(at(0.1)).padStart(5)}${String(at(0.5)).padStart(5)}${String(at(0.9)).padStart(5)}${mean(runs.map((result) => result.coin)).toFixed(1).padStart(8)}${`${(profit * 100).toFixed(0)}%`.padStart(8)}${mean(runs.map((result) => result.cards)).toFixed(2).padStart(7)}${mean(runs.map((result) => result.fullArts)).toFixed(3).padStart(10)}`,
      );
    }
  }
};

if (DUNGEON_MODE) {
  gradeDungeon();
  process.exit(0);
}

if (GRADE_MODE) {
  gradeKeywords();
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

console.log("Finicards v2 balance sweep");
console.log(
  `pool ${POOL.length} cards · ${MATCHES} matches per cell · keywords ${
    KEYWORDS_ENABLED ? "ON" : "OFF"
  } · default multiplier ${RULES.typeMultiplier}\n`,
);

const columns = [
  ["mult", 6],
  ["depth wins", 12],
  ["fa vs blind", 13],
  ["fa vs answer", 14],
  ["mono-type", 11],
  ["level rounds", 13],
] as const;

console.log(columns.map(([label, width]) => label.padEnd(width)).join(""));
console.log(columns.map(([, width]) => "-".repeat(width - 1) + " ").join(""));

for (const multiplier of MULTIPLIERS) {
  const { depth, rarityBlind, rarityAnswered, monoType, baseline } =
    experiments(multiplier);
  const row = [
    `${multiplier}${multiplier === RULES.typeMultiplier ? "*" : ""}`.padEnd(6),
    rate(depth).padEnd(12),
    rate(rarityBlind).padEnd(13),
    rate(rarityAnswered).padEnd(14),
    rate(monoType).padEnd(11),
    `${((baseline.levelOnRounds / MATCHES) * 100).toFixed(1)}%`.padEnd(13),
  ];
  console.log(row.join(""));
}

console.log(`
Reading the table (* marks the current RULES.typeMultiplier):

  depth wins       Pillar 1. A player who can answer a composition vs one who
                   owns only ${SHALLOW_SIZE} cards. Should be comfortably above 50% -
                   that gap is the reason to keep collecting.
  fa vs blind      Three full-arts against three commons chosen blind. Expect
                   this to be high - a spike beats a rounded card it isn't
                   pointed away from. This is the "I have no answer" case.
  fa vs answer     The same full-arts against commons that answer the visible
                   composition. Pillar 4 lives here: this is the number that
                   should stay near even. The gap between the two columns is
                   exactly how much knowing the counter is worth.
  mono-type        Should be at or near 0% with no rule enforcing it. If it
                   creeps up, the multiplier is too low for the type wheel to
                   mean anything.
  level rounds     How often two unstrategic players tie on rounds won and fall
                   through to the damage tiebreaker. High values mean matches
                   feel indecisive.`);
