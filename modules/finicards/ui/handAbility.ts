import {
  DUNGEON,
  previewRound,
  type DungeonConfig,
  type DungeonState,
} from "../dungeon";
import { createSideState, type KeywordDefinition } from "../keywords";
import type { BattleCard, RoundResult } from "../types";
import { legOf, type Leg } from "./enemyAbility";
import { TYPE_NAME, activeKeyword } from "./theme";

/**
 * What each ability in the player's hand will do in the fight they are about
 * to choose a card for - the hand's half of `enemyAbilityLines`.
 *
 * The descriptions are written for a battle, where a lineup is three cards
 * picked up front. In a dungeon it is the cards played so far this leg, so a
 * Chorus played first has nothing to count, and the tiebreak abilities never
 * fire at all. Without saying so, a player sees an ability do nothing and
 * reasonably assumes it is broken.
 *
 * Numbers come from previewing the real fight twice, with the ability and
 * without it, so what is shown is what the card will fight with.
 */

const signed = (amount: number): string =>
  amount < 0 ? `−${-amount}` : `+${amount}`;

/** What a lineup names beside each card: what the keyword reads of it. */
type Shown = "type" | "series" | "name";

/** "Anya Forger (Wit), Jiji (Heart)" - the leg's cards so far, then this one. */
const lineupOf = (leg: Leg, card: BattleCard, show: Shown) =>
  [...leg.rounds.map(({ challenger }) => challenger.card), card]
    .map((each) =>
      show === "type"
        ? `${each.name} (${TYPE_NAME[each.type]})`
        : show === "series"
          ? `${each.name} (${each.series})`
          : each.name,
    )
    .join(", ");

/** Why a keyword that adds to the card's own stat is, or is not, live. */
const statReason = (
  slug: string,
  card: BattleCard,
  round: RoundResult,
  leg: Leg,
): string | null => {
  const enemy = round.defender.card;
  const fight = `this is slot ${leg.slot} of ${leg.length}`;
  const first = leg.slot === 1;
  const lineup = (show: Shown) =>
    first
      ? "you haven't played anything else this leg yet"
      : `your lineup is what you've played this leg, and this: ${lineupOf(leg, card, show)}`;
  const last = leg.rounds.at(-1);

  switch (slug) {
    case "vanguard":
    case "last_stand":
    case "anchor":
    case "gambit":
      return fight;
    case "momentum":
      return `+1 for each fight you've won this leg (${leg.player.roundsWon})`;
    case "grudge":
      return `+2 for each fight you've lost this leg (${leg.player.roundsLost})`;
    case "avenge":
      return first
        ? "fires when you lost the fight before it in the same leg, and this is the first fight of a leg"
        : `fires when you lost the fight before it in the same leg - you ${leg.player.lastRoundWasLoss ? "did" : "didn't"}`;
    case "closer":
      return first
        ? "fires from the second fight of a leg when the leg is level, and this is the first"
        : `fires when the leg is level - you've won ${leg.player.roundsWon}, the dungeon ${leg.dungeon.roundsWon}`;
    case "second_wind":
      return first
        ? "fires after a stalemate in the same leg, and this is the first fight of a leg"
        : `fires after a stalemate - the last fight this leg ${last?.winner === "draw" ? "was one" : "wasn't"}`;
    case "echo":
      return last
        ? `borrows ${last.challenger.card.name}'s final ${TYPE_NAME[last.challenger.printedType]} (${last.challenger.attackStat}) if that is higher`
        : "borrows your last card's final stat, and this is the first fight of a leg";
    case "chorus":
    case "lone_wolf":
    case "trinity":
      return lineup("type");
    case "kinship":
      return lineup("series");
    case "synergy":
      return lineup("name");
    case "thrifty": {
      const cost = [
        ...leg.rounds.map(({ challenger }) => challenger.card),
        card,
      ].reduce((sum, each) => sum + each.cost, 0);
      return `${lineup("type")} - costing ${cost} in all`;
    }
    case "versatile":
      return "+1 for each of its other two stats at 5 or more";
    case "rival":
      return `+3 against a ${TYPE_NAME[card.type]} card, and ${enemy.name} is ${TYPE_NAME[enemy.type]}`;
    case "giant_slayer":
      return `+3 when the enemy's ${TYPE_NAME[enemy.type]} is higher than this card's ${TYPE_NAME[card.type]} - ${enemy.stats[enemy.type]} against ${round.challenger.card.stats[card.type]}`;
    case "underdog":
      return `+3 against a rarer card, and ${enemy.name} is ${enemy.rarity === "full_art" ? "a full-art" : enemy.rarity === "uncommon" ? "an uncommon" : "a common"}`;
    case "purist": {
      const theirs = activeKeyword(enemy);
      return theirs
        ? `+3 against a card with no ability, and ${enemy.name} has ${theirs.name}`
        : `+3 against a card with no ability, and ${enemy.name} has none`;
    }
    default:
      return null;
  }
};

/** Keywords whose effect is not a number on the card's own stat. */
const otherReason = (
  slug: string,
  round: RoundResult,
  leg: Leg,
): string | null => {
  const enemy = round.defender.card;
  const theirs = activeKeyword(enemy);
  const lastFight = leg.slot === leg.length;
  const handOn = (effect: string) =>
    lastFight
      ? `${effect} - but this is the last fight of the leg, so there's nothing to hand on.`
      : `${effect}.`;

  switch (slug) {
    case "brace":
      return round.defender.multiplier > 1
        ? `**+3** defence this fight: ${enemy.name} has the type advantage.`
        : `No bonus this fight: ${enemy.name} doesn't have the type advantage.`;
    case "adapt":
      return round.challenger.multiplier > 1
        ? `Gets the ×${round.challenger.multiplier} against ${enemy.name} this fight.`
        : `No multiplier against ${enemy.name} this fight${theirs?.slug === "guard" ? ": its Guard blocks it" : ""}.`;
    case "silence":
      return theirs
        ? `Switches off ${enemy.name}'s ${theirs.name}.`
        : `${enemy.name} has no ability to switch off.`;
    case "mimic":
      return theirs
        ? `Fights with ${enemy.name}'s ${theirs.name} this fight.`
        : `${enemy.name} has no ability, so it fights with none.`;
    case "rally":
      return handOn("If it wins, your next card this leg gets +2");
    case "martyr":
      return handOn(
        "If it loses and a ward holds, your next card this leg gets +3",
      );
    case "parting_shot":
      return handOn(
        "If it loses and a ward holds, the next enemy this leg gets −2",
      );
    case "spoiler":
      return handOn(
        "If it loses and a ward holds, the next enemy this leg has its ability switched off",
      );
    case "first_strike":
      return "If it would lose by 2 or less, the fight is a stalemate instead and you play another card.";
    case "edge":
      return "A stalemate counts as a win for you instead.";
    case "overwhelm":
    case "grit":
    case "relentless":
    case "mercy":
      return "Does nothing in a dungeon: each fight is one round, so there is no tiebreaker.";
    default:
      return null;
  }
};

/**
 * Keywords the battle wording already describes exactly in a dungeon - always
 * on, and reading nothing a dungeon changes - so they get no line.
 */
const SAME_IN_A_DUNGEON = new Set([
  "bulwark",
  "pierce",
  "guard",
  "fortress",
  "glass_cannon",
  "intimidate",
  "feint",
]);

/** Why nothing on the card fires this fight, if something switches it off. */
const switchedOff = (round: RoundResult, leg: Leg): string | null => {
  const theirs = activeKeyword(round.defender.card);
  if (theirs?.slug === "silence")
    return `Switched off this fight: ${round.defender.card.name}'s Silence.`;
  if (leg.player.silenceNext)
    return "Switched off this fight: a Spoiler from earlier this leg.";
  return null;
};

/** What one ready card's ability does this fight, or null when there's nothing to add. */
const explain = (
  state: DungeonState,
  card: BattleCard,
  keyword: KeywordDefinition,
  leg: Leg,
  config: DungeonConfig,
): string | null => {
  if (SAME_IN_A_DUNGEON.has(keyword.slug)) return null;
  const round = previewRound(state, card, undefined, config);
  const off = switchedOff(round, leg);
  if (off) return off;

  const reason = statReason(keyword.slug, card, round, leg);
  if (reason) {
    const without = previewRound(
      state,
      { ...card, keyword: "" },
      undefined,
      config,
    );
    const bonus = round.challenger.attackStat - without.challenger.attackStat;
    return `${bonus === 0 ? "No bonus this fight" : `**${signed(bonus)}** this fight`}: ${reason}.`;
  }
  return otherReason(keyword.slug, round, leg);
};

/**
 * The hand's ability legend for a fight room: each ability once, with what it
 * does in this fight in place of its description. `ready` are the cards that can be played; a
 * resting card's ability is listed but not explained, since it can't fight.
 */
export const handAbilityLines = (
  state: DungeonState,
  hand: BattleCard[],
  ready: BattleCard[],
  config: DungeonConfig = DUNGEON,
): string[] => {
  const leg = legOf(state, config);
  const groups = new Map<
    string,
    { keyword: KeywordDefinition; cards: BattleCard[] }
  >();
  for (const card of hand) {
    const keyword = activeKeyword(card);
    if (!keyword) continue;
    const group = groups.get(keyword.slug) ?? { keyword, cards: [] };
    group.cards.push(card);
    groups.set(keyword.slug, group);
  }

  const playable = new Set(ready.map((card) => card.instanceId));
  return [...groups.values()].flatMap(({ keyword, cards }) => {
    const explained = cards
      .filter((card) => playable.has(card.instanceId))
      .map((card) => ({
        card,
        line: explain(state, card, keyword, leg, config),
      }))
      .filter(
        (entry): entry is { card: BattleCard; line: string } =>
          entry.line !== null,
      );
    const heading = `-# **${keyword.name}** · ${cards.map((card) => card.name).join(", ")}`;
    // What it does this fight stands in for the description, which says the
    // same at greater length. An ability with nothing to explain - the same
    // as in a battle, or only on resting cards - keeps its description.
    if (explained.length === 0) return [`${heading} — ${keyword.description}`];
    // One line when every card would be told the same, else one per card.
    const same = new Set(explained.map(({ line }) => line)).size === 1;
    return same
      ? [`${heading} — ${explained[0].line}`]
      : [
          heading,
          ...explained.map(({ card, line }) => `-# ↳ ${card.name}: ${line}`),
        ];
  });
};

/** Every keyword slug this file explains or deliberately leaves alone. */
export const handExplainsKeyword = (slug: string): boolean => {
  if (SAME_IN_A_DUNGEON.has(slug)) return true;
  const card = {
    instanceId: "x",
    definitionId: "x",
    name: "x",
    series: "x",
    rarity: "common",
    type: "power",
    stats: { power: 5, wit: 5, heart: 5 },
    keyword: slug,
    foil: false,
    tags: [],
    cost: 1,
  } as BattleCard;
  const leg: Leg = {
    slot: 1,
    length: DUNGEON.legLength,
    rounds: [],
    dungeon: createSideState(),
    player: createSideState(),
  };
  const round = {
    challenger: { card, multiplier: 1, attackStat: 5 },
    defender: { card: { ...card, keyword: "" }, multiplier: 1 },
  } as unknown as RoundResult;
  return (
    statReason(slug, card, round, leg) !== null ||
    otherReason(slug, round, leg) !== null
  );
};
