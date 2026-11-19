import type { DungeonState } from "./dungeon";
import { itemByKey } from "./items";
import { FOIL_CHANCE, PACK_SIZE, type PackOdds } from "./packs";

/**
 * What a boon does when it's spent (issue #8). Pure: the pack and the
 * dungeon call these with the boon a player activated, then spend it.
 *
 * Pack boons change one pack's draw, and only the common / uncommon /
 * full-art split - never Legendary or Secret Art odds. A pack can't pay out a
 * card the server has run out of, whatever the boon: the draw still steps
 * down a rarity when a tier is claimed out.
 */

export type PackBoon = {
  odds?: (base: PackOdds) => PackOdds;
  foilChance?: number;
  size?: number;
  uncommonFloor?: boolean;
};

export const PACK_BOONS: Record<string, PackBoon> = {
  // At least one uncommon or better.
  boon_uncommon_floor: { uncommonFloor: true },
  // Five times the foil chance on every card.
  boon_foil: { foilChance: FOIL_CHANCE * 5 },
  boon_extra_card: { size: PACK_SIZE + 1 },
  // Fifteen points moved off commons: ten to uncommons, five to full-arts.
  boon_lucky: {
    odds: (base) => ({
      ...base,
      common: base.common - 15,
      uncommon: base.uncommon + 10,
      full_art: base.full_art + 5,
    }),
  },
};

/** "🍀 Four-Leaf Clover", for the pack's note. */
export const boonLabel = (key: string): string => {
  const item = itemByKey(key);
  return item ? `${item.emoji} ${item.name}` : key;
};

/**
 * A run as it starts with a dungeon boon spent on it. Buffs ride on the run's
 * own machinery, so they show and wear off like a shop's: a map is scouting
 * for ten door choices, a lantern is fog held off for the run.
 */
export const withDungeonBoon = (
  state: DungeonState,
  key: string,
): DungeonState => {
  const next = structuredClone(state);
  const name = itemByKey(key)?.name ?? key;
  let line: string;
  switch (key) {
    case "boon_spare_ward":
      next.wards += 1;
      line = "you start with an extra ward charm.";
      break;
    case "boon_purse":
      next.geld += 30;
      line = "you start with 30 geld.";
      break;
    case "boon_scout_map":
      next.buffs.push({
        name,
        note: "doors show who's behind them",
        mods: { scout: 1 },
        rooms: 10,
      });
      line = "for the next ten doors, you'll see who's behind them.";
      break;
    case "boon_lantern":
      next.buffs.push({
        name,
        note: "no fog",
        mods: { fog: -100 },
        rooms: null,
      });
      line = "no fog will hide a door this run.";
      break;
    case "boon_grindstone":
      next.buffs.push({
        name,
        note: "+1 type stat",
        mods: { type: 1 },
        rooms: null,
      });
      line = "every card has +1 to its type stat this run.";
      break;
    default:
      return state;
  }
  next.boon = key;
  next.recap = { lines: [`🎒 Your **${name}** is spent on this run: ${line}`] };
  return next;
};
