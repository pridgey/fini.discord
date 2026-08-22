/**
 * Finicards v2 balance sweep.
 *
 *   bun run scripts/finicards_v2_simulate.ts
 *   bun run scripts/finicards_v2_simulate.ts --matches 5000 --keywords
 *
 * The design doc names `typeMultiplier` "the single number defining game feel"
 * and expects extended tuning, so this exists to answer the tuning question with
 * numbers instead of vibes. It touches no database and no Discord - it builds a
 * synthetic pool through the same `normalizeSpread` the real cards go through,
 * then plays out four experiments at each multiplier, one per design pillar:
 *
 *   1. Depth beats power     - a deep collection that can answer a composition
 *                              vs a six-card collection that cannot.
 *   2. Rarity is not power   - three full-arts vs three commons.
 *   3. Mono-type is punished - a mono-type lineup vs its counter, no rule for it.
 *   4. Matches feel decisive - how often a match ends level on rounds.
 */

import { resolveMatch } from "../modules/finicardsV2/battleEngine";
import { keywordsForRarity } from "../modules/finicardsV2/keywords";
import { RULES, TYPE_PRIORITY } from "../modules/finicardsV2/rules";
import { normalizeSpread } from "../modules/finicardsV2/statBudget";
import type { BattleCard } from "../modules/finicardsV2/types";
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

        const keywordPool = keywordsForRarity(rarity);
        pool.push({
          instanceId: `${rarity}-${type}-${index}`,
          definitionId: `${rarity}-${type}-${index}`,
          name: `${rarity}/${type}/${index}`,
          series: "sim",
          rarity,
          type,
          stats: spread,
          keyword:
            KEYWORDS_ENABLED && keywordPool.length > 0
              ? keywordPool[index % keywordPool.length].slug
              : "",
          foil: false,
          tags: [],
          cost: 0,
        });
      }
    }
  }

  return pool;
};

const POOL = buildPool(6);

const ofRarity = (rarity: CardRarity) =>
  POOL.filter((card) => card.rarity === rarity);
const ofType = (type: CardType) => POOL.filter((card) => card.type === type);

/* -------------------------------------------------------------------------- */
/* Lineup strategies                                                          */
/* -------------------------------------------------------------------------- */

const randomLineup = (pool: BattleCard[], random: () => number): BattleCard[] =>
  Array.from({ length: RULES.rounds }, () => pick(pool, random));

/** Power > Wit > Heart > Power - what beats the given type. */
const counterOf: Record<CardType, CardType> = {
  power: "heart",
  wit: "power",
  heart: "wit",
};

/**
 * What a deep collection actually buys you: the challenger sees the opponent's
 * *composition* but not their order, so the best available play is to field the
 * counter to each type they are known to be bringing. A shallow collection
 * simply may not own those cards.
 */
const answeringLineup = (
  pool: BattleCard[],
  opposing: BattleCard[],
  random: () => number,
): BattleCard[] =>
  opposing.map((opponentCard) => {
    const wanted = counterOf[opponentCard.type];
    const answers = pool.filter((card) => card.type === wanted);
    return answers.length > 0 ? pick(answers, random) : pick(pool, random);
  });

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

const experiments = (multiplier: number) => {
  /* 1. Deep collection (whole pool, can answer) vs a fixed six cards. */
  const depth = runSeries(
    multiplier,
    (random) => {
      const shallowPool = Array.from({ length: SHALLOW_SIZE }, () =>
        pick(POOL, random),
      );
      const defender = randomLineup(shallowPool, random);
      return {
        challenger: answeringLineup(POOL, defender, random),
        defender,
      };
    },
    1001,
  );

  /* 2a. Three full-arts vs three commons picked blind. */
  const rarityBlind = runSeries(
    multiplier,
    (random) => ({
      challenger: randomLineup(ofRarity("full_art"), random),
      defender: randomLineup(ofRarity("common"), random),
    }),
    2002,
  );

  /* 2b. The same, except the commons player answers the composition they can
         see. This is the doc's actual claim - "beating the best card in the game
         requires a specific answer" - so it is the number that matters. */
  const rarityAnswered = runSeries(
    multiplier,
    (random) => {
      const challenger = randomLineup(ofRarity("full_art"), random);
      return {
        challenger,
        defender: answeringLineup(ofRarity("common"), challenger, random),
      };
    },
    2012,
  );

  /* 3. Mono-type vs its counter. */
  const monoType = runSeries(
    multiplier,
    (random) => {
      const type = pick(TYPE_PRIORITY, random);
      return {
        challenger: randomLineup(ofType(type), random),
        defender: randomLineup(ofType(counterOf[type]), random),
      };
    },
    3003,
  );

  /* 4. Two even, unstrategic players - a baseline for how decisive matches feel. */
  const baseline = runSeries(
    multiplier,
    (random) => ({
      challenger: randomLineup(POOL, random),
      defender: randomLineup(POOL, random),
    }),
    4004,
  );

  return { depth, rarityBlind, rarityAnswered, monoType, baseline };
};

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
