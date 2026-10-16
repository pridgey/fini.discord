import { addCoin, getUserBalance } from "../finicoin";

/**
 * Finicoin movement for wagered battles.
 *
 * Both sides stake into the Reserve when they commit a lineup, and the pot is
 * paid out from the Reserve on resolution. Escrowing up front is what stops a
 * player from committing a lineup and then spending the stake before the
 * defender answers - which matters here precisely because battles are async.
 *
 * The design doc lists battle wins as an economy *source* and flags Finicoin as
 * badly inflated with only one sink. A cut of every decided pot is raked into the
 * server Jackpot, which makes a wagered battle a net *sink* for the players while
 * the coin stays in circulation - it comes back through `rollJackpot`. Nothing is
 * ever minted: the pot is exactly what the two players put in.
 */

/** Pot-splitting configuration. */
export type RakeConfig = {
  /** Share of a decided pot raked to the server Jackpot account. */
  jackpotShare: number;
  /** Whether a draw is also raked. Off - a draw just returns both stakes. */
  rakeDraws: boolean;
};

export const RAKE: RakeConfig = {
  jackpotShare: 0.1,
  rakeDraws: false,
};

export type WagerParty = {
  userId: string;
  serverId: string;
  username: string;
  servername: string;
};

export const canAfford = async (
  party: WagerParty,
  amount: number,
): Promise<boolean> => {
  if (amount <= 0) return true;
  const balance = (await getUserBalance(party.userId, party.serverId)) || 0;
  return balance >= amount;
};

/** Moves a player's stake into the Reserve. */
export const stakeWager = async (
  party: WagerParty,
  amount: number,
): Promise<void> => {
  if (amount <= 0) return;
  await addCoin(
    "Reserve",
    party.serverId,
    amount,
    party.username,
    party.servername,
    party.userId,
  );
};

/** Returns a stake - used on decline, expiry, and each side of a draw. */
export const refundWager = async (
  party: WagerParty,
  amount: number,
): Promise<void> => {
  if (amount <= 0) return;
  await addCoin(
    party.userId,
    party.serverId,
    amount,
    party.username,
    party.servername,
    "Reserve",
  );
};

export type PotSplit = {
  /** Both stakes together. */
  pot: number;
  /** Raked to the server Jackpot. */
  jackpotCut: number;
  /** Paid to the winner. */
  payout: number;
};

/**
 * Splits a pot. Pure, so the arithmetic is testable and the rake can never
 * silently mint or destroy coin: `jackpotCut + payout` always equals `pot`.
 */
export const calculatePotSplit = (
  wager: number,
  config: RakeConfig = RAKE,
): PotSplit => {
  const pot = Math.max(0, wager) * 2;
  const jackpotCut = Math.floor(pot * Math.min(1, Math.max(0, config.jackpotShare)));
  return { pot, jackpotCut, payout: pot - jackpotCut };
};

/**
 * Pays out a decided match: the Jackpot takes its cut, the winner takes the rest.
 * Both transfers come out of the Reserve, where the two stakes are held.
 */
export const awardPot = async (
  winner: WagerParty,
  wager: number,
  config: RakeConfig = RAKE,
): Promise<PotSplit> => {
  const split = calculatePotSplit(wager, config);
  if (split.pot <= 0) return split;

  if (split.jackpotCut > 0) {
    await addCoin(
      "Jackpot",
      winner.serverId,
      split.jackpotCut,
      winner.username,
      winner.servername,
      "Reserve",
    );
  }

  if (split.payout > 0) {
    await addCoin(
      winner.userId,
      winner.serverId,
      split.payout,
      winner.username,
      winner.servername,
      "Reserve",
    );
  }

  return split;
};

/**
 * A draw. Both stakes go back by default; if `rakeDraws` is on, the Jackpot
 * takes its cut first and the remainder is split evenly.
 */
export const settleDraw = async (
  challenger: WagerParty,
  defender: WagerParty,
  wager: number,
  config: RakeConfig = RAKE,
): Promise<PotSplit> => {
  if (wager <= 0) return { pot: 0, jackpotCut: 0, payout: 0 };

  if (!config.rakeDraws) {
    await refundWager(challenger, wager);
    await refundWager(defender, wager);
    return { pot: wager * 2, jackpotCut: 0, payout: wager * 2 };
  }

  const split = calculatePotSplit(wager, config);
  if (split.jackpotCut > 0) {
    await addCoin(
      "Jackpot",
      challenger.serverId,
      split.jackpotCut,
      challenger.username,
      challenger.servername,
      "Reserve",
    );
  }

  // Odd remainders favour the challenger, who staked first.
  const defenderShare = Math.floor(split.payout / 2);
  await refundWager(challenger, split.payout - defenderShare);
  await refundWager(defender, defenderShare);

  return split;
};
