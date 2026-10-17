import type {
  CardRarity,
  V2DungeonRunRecord,
} from "../../types/PocketbaseTablesV2";
import {
  getCardDefinitions,
  getPopulationCounts,
  grantCard,
  rollCopyKeyword,
  toBattleCard,
} from "./cardStore";
import { payoutFor, type DungeonReward } from "./dungeon";
import { FOIL_CHANCE, selectCard } from "./packs";
import type { BattleCard } from "./types";
import { loadHand, recordReward, stateOf } from "./dungeonStore";
import {
  buildDungeonMessage,
  type BuiltDungeonMessage,
} from "./ui/dungeonMessage";
import { refundWager, stakeWager, type WagerParty } from "./wagers";

/**
 * What a dungeon run costs and pays.
 *
 * The fee goes to the Reserve. Inside the dungeon the only currency is geld,
 * which buys buffs and is worth nothing outside; when the run ends, what is
 * left converts to Finicoin at `DUNGEON.coinPerGeld` and is paid back out of
 * the Reserve. A run that walks out past the first boss or two pays more than its fee.
 *
 * Bosses drop cards. Those are banked on the run and granted here when it
 * ends - on a walk out or a fall alike - so a card is only ever granted once.
 */

/** Moves the entry fee into the Reserve. */
export const payEntryFee = (party: WagerParty, fee: number): Promise<void> =>
  stakeWager(party, fee);

/**
 * Draws and grants the cards a run banked. A drop the server has no unclaimed
 * card for steps down a rarity, and is skipped if the pool is claimed out.
 */
const grantLoot = async (
  run: V2DungeonRunRecord,
  party: WagerParty,
  loot: CardRarity[],
): Promise<BattleCard[]> => {
  if (loot.length === 0) return [];

  const definitions = await getCardDefinitions();
  const cards: BattleCard[] = [];

  for (const rolled of loot) {
    // Re-counted per card, so two drops cannot both take a last copy.
    const counts = await getPopulationCounts(run.server_id);
    const definition = selectCard(definitions, counts, rolled);

    if (!definition) continue;

    const record = await grantCard({
      userId: run.user_id,
      serverId: run.server_id,
      identifier: `${party.username}-${party.servername}`,
      definitionId: definition.id ?? "",
      foil: Math.random() < FOIL_CHANCE,
      keyword: rollCopyKeyword(definition.rarity),
      acquiredFrom: "dungeon",
    });

    cards.push(toBattleCard({ ...record, definition }));
  }

  return cards;
};

/**
 * Pays out a finished run and records what it paid.
 *
 * A run that already carries a reward is returned as it stands rather than paid
 * again, so settling twice - a retried click, a handler that crashed after
 * paying - cannot pay a second time.
 */
export const settleRun = async (
  run: V2DungeonRunRecord,
  party: WagerParty,
): Promise<DungeonReward> => {
  if (run.state === "active") return { kind: "none" };
  if (run.reward) return run.reward as DungeonReward;

  const progress = stateOf(run);
  const payout = payoutFor(progress?.geld ?? 0, run.state === "failed");
  const cards = await grantLoot(run, party, progress?.loot ?? []);
  const reward: DungeonReward =
    payout.coin > 0
      ? { kind: "coin", amount: payout.coin, ...payout, cards }
      : { kind: "none", cards };

  if (reward.kind === "coin") await refundWager(party, reward.amount);
  await recordReward(run, reward);
  return reward;
};

/**
 * The message for a run as it stands. One builder for the first reply, every
 * click and a resumed run, so the three can never show different things.
 */
export const buildRunMessage = async (
  run: V2DungeonRunRecord,
): Promise<BuiltDungeonMessage> => {
  const progress = stateOf(run);
  if (!progress) throw new Error(`Run ${run.id} predates the endless dungeon`);

  return buildDungeonMessage({
    runId: run.id!,
    userId: run.user_id,
    playerName: run.player_name,
    state: run.state,
    entryFee: run.entry_fee,
    progress,
    hand: run.state === "active" ? await loadHand(run) : [],
    reward: (run.reward as DungeonReward | null) ?? null,
  });
};
