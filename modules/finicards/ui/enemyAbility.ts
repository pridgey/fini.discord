import { DUNGEON, type DungeonConfig, type DungeonState } from "../dungeon";
import {
  createSideState,
  type CombatWorkspace,
  type KeywordContext,
  type KeywordDefinition,
  type SideState,
} from "../keywords";
import { RULES, TYPE_BEATEN_BY } from "../rules";
import type { BattleCard, RoundResult } from "../types";
import { TYPE_NAME, activeKeyword } from "./theme";

/**
 * What the enemy's ability will do in the fight the player is about to choose
 * a card for.
 *
 * The keyword description is written for a battle - "your lineup", "the
 * previous round" - and a dungeon has neither, not visibly. Under the hood a
 * run is a string of three-fight legs, the enemies fought so far in a leg are
 * the enemy's lineup, and the dungeon's side keeps a running score. So this
 * says, in those terms, whether the ability is live this fight and why.
 *
 * Where the bonus depends only on the enemy's own side, the keyword's hook is
 * run against the real leg so the number shown is the number it will fight
 * with, not a second copy of the rule that could drift from it.
 */

type Leg = {
  slot: number;
  length: number;
  /** Fights already played in this leg, oldest first. */
  rounds: RoundResult[];
  dungeon: SideState;
  player: SideState;
};

/** The leg the next fight is in. A full leg means the next fight starts a new one. */
const legOf = (state: DungeonState, config: DungeonConfig): Leg => {
  const full = state.leg.rounds.length >= config.legLength;
  const rounds = full ? [] : state.leg.rounds;
  return {
    slot: rounds.length + 1,
    length: config.legLength,
    rounds,
    dungeon: full ? createSideState() : state.leg.states.defender,
    player: full ? createSideState() : state.leg.states.challenger,
  };
};

const signed = (amount: number): string =>
  amount < 0 ? `−${-amount}` : `+${amount}`;

/** "Ancient Koro-sensei, Hulking Vegeta (itself, from the stalemate)". */
const lineupNames = (leg: Leg, enemy: BattleCard): string => {
  if (leg.rounds.length === 0)
    return "no enemies yet - this is the first fight of the leg";
  return leg.rounds
    .map(({ defender }) =>
      defender.card.instanceId === enemy.instanceId
        ? `${defender.card.name} (itself, from the stalemate)`
        : defender.card.name,
    )
    .join(", ");
};

/**
 * Runs `keyword` for the enemy as the coming fight will, for the keywords that
 * read nothing of the player's card, and returns what it adds to its type stat.
 */
const bonusFor = (
  keyword: KeywordDefinition,
  enemy: BattleCard,
  leg: Leg,
): number => {
  const workspace = (
    card: BattleCard,
    side: CombatWorkspace["side"],
  ): CombatWorkspace => ({
    side,
    card,
    attackStat: card.stats[card.type],
    multiplier: 1,
    defenseBonus: 0,
    pierce: 0,
    adapted: false,
    targetLowest: false,
    keyword: side === "defender" ? keyword : null,
    bonuses: [],
  });
  const self = workspace(enemy, "defender");
  const context: KeywordContext = {
    self,
    // Nothing run here reads the opposing card. The enemy stands in for it.
    opponent: workspace(enemy, "challenger"),
    slot: leg.slot,
    lineupLength: leg.length,
    state: structuredClone(leg.dungeon),
    opponentState: structuredClone(leg.player),
    rules: RULES,
    notes: [],
    selfLineup: [...leg.rounds.map(({ defender }) => defender.card), enemy],
    opponentLineup: leg.rounds.map(({ challenger }) => challenger.card),
    history: leg.rounds,
  };
  keyword.apply?.(context);
  return self.attackStat - enemy.stats[enemy.type];
};

/** Why a keyword that reads the enemy's own side is, or is not, live. */
const ownSideReason = (
  slug: string,
  enemy: BattleCard,
  leg: Leg,
): string | null => {
  const fight = `this is fight ${leg.slot} of ${leg.length} in the leg`;
  const lineup = `its lineup is the enemies fought so far this leg: ${lineupNames(leg, enemy)}`;

  switch (slug) {
    case "vanguard":
      return `fires on the first fight of a leg, and ${fight}`;
    case "last_stand":
      return `fires on fight ${leg.length} of a leg, and ${fight}`;
    case "anchor":
      return `fires on a middle fight of a leg, and ${fight}`;
    case "gambit":
      return `+5 on the first fight of a leg, −2 on the others, and ${fight}`;
    case "momentum":
      return `+1 for each fight the dungeon has won this leg (${leg.dungeon.roundsWon}) - only a fight that broke a ward counts`;
    case "avenge":
      return leg.slot === 1
        ? "fires when you won the fight before it in the same leg, and this is the first fight of a leg"
        : `fires when you won the fight before it in the same leg - ${leg.dungeon.lastRoundWasLoss ? "you did" : "you didn't"}`;
    case "grudge":
      return `+2 for each fight you've won this leg (${leg.dungeon.roundsLost})`;
    case "closer":
      return leg.slot === 1
        ? "fires from the second fight of a leg when the leg is level, and this is the first"
        : `fires when the leg is level - you've won ${leg.player.roundsWon}, the dungeon ${leg.dungeon.roundsWon}`;
    case "second_wind":
      return `fires after a stalemate - the last fight this leg ${leg.rounds.at(-1)?.winner === "draw" ? "was one" : "wasn't"}`;
    case "echo":
      return leg.rounds.length === 0
        ? "borrows the last enemy's final stat, and this is the first fight of a leg"
        : `borrows ${leg.rounds.at(-1)!.defender.card.name}'s final ${TYPE_NAME[leg.rounds.at(-1)!.defender.printedType]} (${leg.rounds.at(-1)!.defender.attackStat}) if that is higher`;
    case "versatile":
      return "+1 for each of its other two stats at 5 or more";
    case "kinship":
    case "synergy":
    case "chorus":
    case "lone_wolf":
    case "trinity":
      return lineup;
    case "thrifty": {
      const cost = [
        ...leg.rounds.map(({ defender }) => defender.card),
        enemy,
      ].reduce((sum, card) => sum + card.cost, 0);
      return `${lineup}, costing ${cost} in all`;
    }
    default:
      return null;
  }
};

/** Keywords that hand something on, which in a dungeon means along the leg. */
const handOnReason = (slug: string, leg: Leg): string | null => {
  const last = leg.slot === leg.length;
  const lastNote =
    "but this is the last fight of the leg, so there's nothing to hand on";
  switch (slug) {
    case "rally":
      return last
        ? `If it beats you, the next enemy this leg gets +2 - ${lastNote}.`
        : "If it beats you and a ward breaks, the next enemy this leg gets +2.";
    case "martyr":
      return last
        ? `If you beat it, the next enemy this leg gets +3 - ${lastNote}.`
        : "If you beat it, the next enemy this leg gets +3.";
    case "parting_shot":
      return last
        ? `If you beat it, your next card this leg gets −2 - ${lastNote}.`
        : "If you beat it, the next card you fight with this leg gets −2.";
    case "spoiler":
      return last
        ? `If you beat it, your next card this leg loses its ability - ${lastNote}.`
        : "If you beat it, the next card you fight with this leg has its ability switched off.";
    default:
      return null;
  }
};

/** Keywords that depend on, or act on, the card the player is about to choose. */
const yourCardReason = (slug: string, enemy: BattleCard): string | null => {
  const type = TYPE_NAME[enemy.type];
  const stat = enemy.stats[enemy.type];
  switch (slug) {
    case "rival":
      return `+3 if you play a ${type} card.`;
    case "giant_slayer":
      return `+3 if your card's type stat, buffs included, is higher than its ${type} ${stat}.`;
    case "underdog":
      return enemy.rarity === "full_art"
        ? "Never fires here: nothing outranks a full-art."
        : `+3 if you play a card rarer than ${enemy.rarity === "common" ? "a common" : "an uncommon"}.`;
    case "purist":
      return "+3 if your card has no ability, or has it switched off.";
    case "brace":
      return `+3 defence if your card has the type advantage - a ${TYPE_NAME[TYPE_BEATEN_BY[enemy.type]]} card.`;
    case "feint":
      return "Hits your card's lowest stat instead of the matching one, whenever that is lower.";
    case "intimidate":
      return "Your card gets −2 to its type stat, whatever you play.";
    case "mimic":
      return "Fights with your card's ability instead of its own - a card with none leaves it with none.";
    case "silence":
      return "Your card's ability does nothing this fight.";
    case "guard":
      return "Your card never gets the type multiplier against it.";
    case "adapt":
      return "Always gets the type multiplier against your card, unless your card has Guard.";
    case "bulwark":
    case "fortress":
    case "glass_cannon":
    case "pierce":
      return "Always on, whatever you play.";
    case "first_strike":
      return "If you would beat it by 2 or less, the fight is a stalemate instead and you play another card.";
    case "edge":
      return "A stalemate goes to it instead - which counts as a lost fight for you.";
    case "overwhelm":
    case "grit":
    case "relentless":
    case "mercy":
      return "Does nothing in a dungeon: each fight is one round, so there is no tiebreaker.";
    default:
      return null;
  }
};

/** Bonuses earlier fights in the leg have already handed to this fight. */
const carriedLines = (leg: Leg): string[] => {
  const lines: string[] = [];
  const forEnemy = [
    ...(leg.dungeon.pendingRally
      ? [`Rally ${signed(leg.dungeon.pendingRally)}`]
      : []),
    ...leg.dungeon.incoming.map(
      ({ label, amount }) => `${label} ${signed(amount)}`,
    ),
  ];
  const forYou = [
    ...(leg.player.pendingRally
      ? [`Rally ${signed(leg.player.pendingRally)}`]
      : []),
    ...leg.player.incoming.map(
      ({ label, amount }) => `${label} ${signed(amount)}`,
    ),
    ...(leg.player.silenceNext ? ["Spoiler: its ability is switched off"] : []),
  ];
  if (forEnemy.length)
    lines.push(
      `-# ↳ Carried in from earlier this leg, for the enemy: ${forEnemy.join(", ")}.`,
    );
  if (forYou.length)
    lines.push(
      `-# ↳ Carried in from earlier this leg, for your card: ${forYou.join(", ")}.`,
    );
  return lines;
};

/**
 * Lines for the fight room, under the enemy's keyword legend: what its ability
 * does in this fight, and anything earlier fights in the leg handed on. Empty
 * for an enemy without an ability and with nothing carried in.
 */
export const enemyAbilityLines = (
  state: DungeonState,
  enemy: BattleCard,
  config: DungeonConfig = DUNGEON,
): string[] => {
  const leg = legOf(state, config);
  const keyword = activeKeyword(enemy);
  const lines: string[] = [];

  if (keyword) {
    const own = ownSideReason(keyword.slug, enemy, leg);
    const explained = own
      ? (() => {
          const bonus = bonusFor(keyword, enemy, leg);
          return `${bonus === 0 ? "No bonus this fight" : `**${signed(bonus)}** this fight`}: ${own}.`;
        })()
      : (handOnReason(keyword.slug, leg) ??
        yourCardReason(keyword.slug, enemy));
    if (explained) lines.push(`-# ↳ **Here:** ${explained}`);
  }

  return [...lines, ...carriedLines(leg)];
};

/** Every keyword slug this file explains, so a new keyword can't slip past it. */
export const explainsKeyword = (slug: string, enemy: BattleCard): boolean => {
  const leg: Leg = {
    slot: 1,
    length: DUNGEON.legLength,
    rounds: [],
    dungeon: createSideState(),
    player: createSideState(),
  };
  return (
    ownSideReason(slug, enemy, leg) !== null ||
    handOnReason(slug, leg) !== null ||
    yourCardReason(slug, enemy) !== null
  );
};
