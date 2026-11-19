import { AttachmentBuilder, type Message } from "discord.js";
import { isAdmin } from "../../utilities/discord/isAdmin";
import { resolveMatch } from "./battleEngine";
import { getCardDefinitions, rollCopyKeyword, toBattleCard } from "./cardStore";
import { renderBattleBoard } from "./cardArt/battleBoard";
import { renderDungeonClash } from "./cardArt/dungeonClash";
import { DUNGEON_SIDE, PLAYER_SIDE, type FightResult, type FightTier } from "./dungeon";
import { RULES } from "./rules";
import type { BattleCard } from "./types";
import type { V2CardDefinitionRecord } from "../../types/PocketbaseTablesV2";

/**
 * Sample fight images from random real cards, for looking over the battle
 * board and the dungeon fight without playing one. Used by the bot admin's
 * `!test`; nothing is stored, paid or posted anywhere else.
 */

const NAMES = ["Aya", "Fen", "Bo", "Juniper", "Marisol", "Ottoline"];

const pick = <T>(items: T[], random: () => number): T =>
  items[Math.floor(random() * items.length)];

/** Random active cards that have art, as fresh copies with rolled keywords. */
export const randomCards = async (
  count: number,
  random: () => number = Math.random,
): Promise<BattleCard[]> => {
  const withArt = (await getCardDefinitions()).filter(
    (definition) =>
      !!definition.art || !!definition.art_url || !!definition.legacy_card,
  );
  const chosen: V2CardDefinitionRecord[] = [];
  const pool = [...withArt];
  while (chosen.length < count && pool.length) {
    chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return chosen.map((definition, i) =>
    toBattleCard({
      id: `sample${i}`,
      definition,
      keyword: rollCopyKeyword(definition.rarity, random),
    } as Parameters<typeof toBattleCard>[0]),
  );
};

/** A random PvP match between two random lineups, as the battle board. */
export const sampleBattleBoard = async (
  random: () => number = Math.random,
): Promise<Buffer | null> => {
  const cards = await randomCards(RULES.rounds * 2, random);
  const challenger = pick(NAMES, random);
  const defender = pick(
    NAMES.filter((name) => name !== challenger),
    random,
  );
  const result = resolveMatch({
    challengerLineup: cards.slice(0, RULES.rounds),
    defenderLineup: cards.slice(RULES.rounds),
  });
  return renderBattleBoard(result, { challenger, defender });
};

/**
 * A random dungeon fight: a random card against a random enemy, at a random
 * depth and tier. The result follows the round - a loss is a fall or a
 * broken ward, at random.
 */
export const sampleDungeonClash = async (
  random: () => number = Math.random,
): Promise<Buffer | null> => {
  const [card, enemy] = await randomCards(2, random);
  const lineups =
    PLAYER_SIDE === "challenger"
      ? { challengerLineup: [card], defenderLineup: [enemy] }
      : { challengerLineup: [enemy], defenderLineup: [card] };
  const [round] = resolveMatch(lineups).rounds;
  const tier: FightTier = pick(["normal", "normal", "elite", "boss"], random);
  const result: FightResult =
    round.winner === PLAYER_SIDE
      ? "won"
      : round.winner === DUNGEON_SIDE
        ? random() < 0.5
          ? "fell"
          : "warded"
        : "stalemate";
  return renderDungeonClash({
    round,
    result,
    depth: 1 + Math.floor(random() * 20),
    tier,
    playerName: pick(NAMES, random),
    playerSide: PLAYER_SIDE,
    geld: result === "won" ? 8 + Math.floor(random() * 30) : 0,
  });
};

/**
 * `!test` from the bot admin: fresh samples in the channel. `!test pvp` or
 * `!test dungeon` for one kind; a bare `!test` sends a board and two dungeon
 * fights.
 */
export const isBattleSampleCommand = (text: string, userId: string): boolean =>
  /^!test(\s+(pvp|dungeon))?$/i.test(text.trim()) && isAdmin(userId);

export const postBattleSamples = async (message: Message) => {
  const kind = message.content.trim().split(/\s+/)[1]?.toLowerCase();
  const wanted = [
    ...(kind !== "dungeon" ? [{ name: "battle-board.png", make: sampleBattleBoard }] : []),
    ...(kind !== "pvp"
      ? [
          { name: "dungeon-fight-1.png", make: sampleDungeonClash },
          { name: "dungeon-fight-2.png", make: sampleDungeonClash },
        ]
      : []),
  ];
  const images = await Promise.all(
    wanted.map(async ({ name, make }) => {
      const image = await make().catch((error) => {
        console.error("Couldn't make a battle sample:", error);
        return null;
      });
      return image && new AttachmentBuilder(image, { name });
    }),
  );
  const files = images.filter((file) => file !== null);
  await message.reply(
    files.length
      ? { content: "-# 🧪 Sample fights from random cards. Nothing was played.", files }
      : "Couldn't draw any samples - check the logs.",
  );
};
