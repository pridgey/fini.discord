import type {
  V2DeckRecord,
  V2DungeonRunRecord,
  V2DungeonRunState,
} from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
import { getCardDefinitions, loadLineupByIds } from "./cardStore";
import { getDeck, loadDeck, unplayableReason } from "./decks";
import { dealHandFromDeck } from "./draw";
import { summariseRun } from "./dungeonStats";
import {
  DUNGEON,
  DungeonRuleError,
  buyOffer,
  chooseDoor,
  createRun,
  drinkCoffee,
  enemyCard,
  leaveShop,
  playEvent,
  playFight,
  previewCards,
  redealHand,
  skipEvent,
  type DungeonState,
  type RoomSource,
} from "./dungeon";
import type { BattleCard } from "./types";

/**
 * Dungeon run lifecycle.
 *
 *   1. The player enters with a deck. A hand is dealt and room 1 is drawn, and
 *      both are shown only after the fee is paid - so there is no draw to fish
 *      for and no room to scout for free.
 *   2. Each click is one move: a card into a fight or an event, something off a
 *      shop's shelf, or a door.
 *   3. The run ends on a lost fight or when the player walks out.
 *
 * Progress lives in the row, not in button ids the way a lineup pick does: a
 * card on cooldown and a purse of geld are worth something, so a stale or
 * replayed button must not be able to move a run. Every button carries the
 * step it was drawn for, and a click for any other step is refused.
 *
 * Finicoin never moves in this file; `dungeonFlow.ts` settles a run so the
 * store stays a pure persistence boundary.
 */

export const V2_DUNGEON_RUN = "v2_dungeon_run";

export const getRun = async (
  runId: string,
): Promise<V2DungeonRunRecord | null> => {
  try {
    return await pb
      .collection<V2DungeonRunRecord>(V2_DUNGEON_RUN)
      .getOne(runId);
  } catch {
    return null;
  }
};

/**
 * A run's state, or null for a row written by the old five-room dungeon.
 *
 * Fields added since a run started are filled in, so a run in flight across a
 * deploy carries on rather than breaking.
 */
export const stateOf = (run: V2DungeonRunRecord): DungeonState | null => {
  const state = run.progress as DungeonState | null;
  if (state?.version !== 2) return null;

  return {
    ...state,
    bossesWon: state.bossesWon ?? 0,
    loot: state.loot ?? [],
    sinceShop: state.sinceShop ?? 0,
    path: state.path ?? [],
    stats: state.stats ?? {
      geldEarned: 0,
      geldSpent: 0,
      eventsPassed: 0,
      cardWins: {},
    },
  };
};

/** The run a player is in the middle of, if any. One at a time per server. */
export const getActiveRun = async (
  userId: string,
  serverId: string,
): Promise<V2DungeonRunRecord | null> => {
  const runs = await pb
    .collection<V2DungeonRunRecord>(V2_DUNGEON_RUN)
    .getFullList({
      filter: pb.filter(
        'user_id = {:user_id} && server_id = {:server_id} && state = "active"',
        { user_id: userId, server_id: serverId },
      ),
      sort: "-created",
    });

  return runs.find((run) => stateOf(run) !== null) ?? null;
};

/** The hand as dealt, each card with its index. A card sold mid-run drops out. */
export const loadHand = async (
  run: V2DungeonRunRecord,
): Promise<{ card: BattleCard; index: number }[]> => {
  const ids = run.hand ?? [];
  const cards = await loadLineupByIds(ids);
  const byId = new Map(cards.map((card) => [card.instanceId, card]));

  return ids.flatMap((id, index) => {
    const card = byId.get(id);
    return card ? [{ card, index }] : [];
  });
};

/**
 * The pool every enemy is built from, the next set's sneak peeks, and - once a
 * run is under way - its hand, for the effects that reach into it.
 */
const roomSource = async (run?: V2DungeonRunRecord): Promise<RoomSource> => {
  const [definitions, hand] = await Promise.all([
    getCardDefinitions({ includeInactive: true }),
    run ? loadHand(run) : Promise.resolve([]),
  ]);
  return {
    pool: definitions.filter((definition) => definition.active).map(enemyCard),
    preview: previewCards(definitions).map(enemyCard),
    hand: hand.map((entry) => entry.card),
  };
};

/** Resolves a pending redraw: deals from the run's deck and says who swapped. */
const applyRedraw = async (
  run: V2DungeonRunRecord,
  progress: DungeonState,
): Promise<{ progress: DungeonState; hand: string[] }> => {
  const hand = run.hand ?? [];
  if (!progress.redraw?.length) return { progress, hand };

  const deck = run.deck ? await getDeck(run.deck) : null;
  const contents = deck ? await loadDeck(deck, run.server_id) : null;
  const deckCards = contents?.cards ?? [];
  const { hand: next, swapped } = redealHand(
    hand,
    progress.redraw,
    deckCards.map((card) => card.instanceId),
  );

  const names = new Map(
    [...deckCards, ...(await loadLineupByIds(progress.redraw))].map((card) => [
      card.instanceId,
      card.name,
    ]),
  );
  const readyAt = { ...progress.readyAt };
  // New cards come in ready, even one that was played and swapped out before.
  for (const { from, to } of swapped) {
    delete readyAt[from];
    delete readyAt[to];
  }
  const line =
    swapped.length > 0
      ? `🔀 ${swapped.map(({ from, to }) => `${names.get(from) ?? "a card"} → **${names.get(to) ?? "a card"}**`).join(", ")}.`
      : "🔀 Your deck has no other cards to deal, so your hand stays as it is.";

  return {
    hand: next,
    progress: {
      ...progress,
      readyAt,
      redraw: undefined,
      recap: {
        ...(progress.recap ?? {}),
        lines: [...(progress.recap?.lines ?? []), line],
      },
    },
  };
};

export type StartRunInput = {
  serverId: string;
  channelId: string;
  userId: string;
  playerName: string;
  deck: V2DeckRecord;
};

export type StartRunOutcome =
  { ok: true; run: V2DungeonRunRecord } | { ok: false; reason: string };

export const startRun = async (
  input: StartRunInput,
): Promise<StartRunOutcome> => {
  const contents = await loadDeck(input.deck, input.serverId);

  const unplayable = unplayableReason(contents);
  if (unplayable) return { ok: false, reason: unplayable };

  if (contents.cards.length < DUNGEON.handSize) {
    return {
      ok: false,
      reason: `**${input.deck.name}** can only field ${contents.cards.length} cards and a dungeon run deals ${DUNGEON.handSize}.${
        contents.missing.length > 0
          ? ` ${contents.missing.length} of its cards are no longer in your collection.`
          : ""
      }`,
    };
  }

  const progress = createRun(await roomSource());

  if (!progress) {
    return {
      ok: false,
      reason:
        "The card pool is empty, so there is nothing to put in the rooms.",
    };
  }

  const run = await pb.collection<V2DungeonRunRecord>(V2_DUNGEON_RUN).create({
    user_id: input.userId,
    server_id: input.serverId,
    channel_id: input.channelId,
    player_name: input.playerName,
    deck: input.deck.id ?? "",
    hand: dealHandFromDeck(contents.cards, DUNGEON.handSize),
    progress,
    state: "active",
    entry_fee: DUNGEON.entryFee,
    reward: null,
  });

  return { ok: true, run };
};

/** One click on a run. */
export type DungeonAction =
  /** The card at this index of the dealt hand, into a fight or an event. */
  | { kind: "card"; handIndex: number }
  | { kind: "door"; index: number }
  | { kind: "buy"; index: number }
  /** Leave a shop, or walk past an event. */
  | { kind: "leave" }
  /** Walk out of the dungeon. */
  | { kind: "retreat" }
  /** Spend a strong coffee on the resting card at this index of the hand. */
  | { kind: "wake"; handIndex: number };

export type ActionOutcome =
  { ok: false; reason: string } | { ok: true; run: V2DungeonRunRecord };

/**
 * Applies one click to a run.
 *
 * `step` is the step the clicked button was drawn for. It has to be the run's
 * current one, which is what makes a double-click or a button on an old
 * message harmless rather than a second card played.
 */
export const act = async (
  runId: string,
  userId: string,
  step: number,
  action: DungeonAction,
): Promise<ActionOutcome> => {
  const run = await getRun(runId);

  if (!run) return { ok: false, reason: "That run no longer exists." };
  if (run.user_id !== userId) {
    return { ok: false, reason: "This isn't your run." };
  }

  const state = stateOf(run);

  if (run.state !== "active" || !state) {
    return { ok: false, reason: "That run is already over." };
  }
  if (step !== state.step) {
    return {
      ok: false,
      reason: "That button is out of date. Use the newest run message.",
    };
  }

  const save = async (
    moved: DungeonState,
    next: V2DungeonRunState = "active",
  ): Promise<ActionOutcome> => {
    const { progress, hand } = await applyRedraw(run, moved);
    return {
      ok: true,
      run: await pb
        .collection<V2DungeonRunRecord>(V2_DUNGEON_RUN)
        .update(runId, { progress, hand, state: next }),
    };
  };

  try {
    switch (action.kind) {
      case "retreat":
        return await save({ ...state, step: state.step + 1 }, "retreated");

      case "door":
        return await save(chooseDoor(state, action.index));

      case "buy":
        return await save(buyOffer(state, action.index, await roomSource(run)));

      case "wake": {
        const cardId = (run.hand ?? [])[action.handIndex];
        const [card] = cardId ? await loadLineupByIds([cardId]) : [];
        if (!card) {
          return {
            ok: false,
            reason: "That card is no longer in your collection.",
          };
        }
        return await save(drinkCoffee(state, card));
      }

      case "leave": {
        const source = await roomSource(run);
        return await save(
          state.room.kind === "event"
            ? skipEvent(state, source)
            : leaveShop(state, source),
        );
      }

      case "card": {
        const cardId = (run.hand ?? [])[action.handIndex];
        // Re-read at the moment of play, so a card sold mid-run cannot be played.
        const [card] = cardId ? await loadLineupByIds([cardId]) : [];

        if (!card) {
          return {
            ok: false,
            reason: "That card is no longer in your collection. Pick another.",
          };
        }

        const source = await roomSource(run);

        if (state.room.kind === "event") {
          return await save(playEvent(state, card, source).state);
        }

        const outcome = playFight(state, card, source);
        return await save(
          outcome.state,
          outcome.result === "fell" ? "failed" : "active",
        );
      }
    }
  } catch (error) {
    if (error instanceof DungeonRuleError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
};

/**
 * Records what a finished run paid, and with it the run's numbers for the
 * record (`dungeonStats.ts`): a run is summarised once, here, as it is settled.
 */
export const recordReward = async (
  run: V2DungeonRunRecord,
  reward: unknown,
): Promise<V2DungeonRunRecord> =>
  pb.collection<V2DungeonRunRecord>(V2_DUNGEON_RUN).update(run.id ?? "", {
    reward,
    ...summariseRun(run, reward),
    ended: new Date().toISOString(),
  });
