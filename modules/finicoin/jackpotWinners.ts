import type { JackpotWinnerRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

/**
 * Records a jackpot payout in `jackpot_winners` so `/jackpot history` can list
 * it later.
 *
 * Deliberately swallows its own errors: this is bookkeeping that runs after the
 * coin has already changed hands, and a failed history write must not surface
 * to the winner as a broken jackpot.
 *
 * @param win The payout to record. `wonAt` defaults to now, and is only passed
 *   explicitly by the backfill script recovering historical wins.
 */
export const recordJackpotWin = async (win: {
  userId: string;
  serverId: string;
  username: string;
  servername: string;
  amount: number;
  wonAt?: Date;
  messageId?: string;
  channelId?: string;
  source?: JackpotWinnerRecord["source"];
}): Promise<JackpotWinnerRecord | null> => {
  try {
    const record: JackpotWinnerRecord = {
      server_id: win.serverId,
      user_id: win.userId,
      username: win.username,
      amount: parseFloat(win.amount.toFixed(2)),
      won_at: (win.wonAt ?? new Date()).toISOString(),
      message_id: win.messageId ?? "",
      channel_id: win.channelId ?? "",
      source: win.source ?? "live",
      identifier: `${win.username}-${win.servername}`,
    };

    return await pb
      .collection<JackpotWinnerRecord>("jackpot_winners")
      .create(record);
  } catch (err) {
    console.error("Error running recordJackpotWin", { err });
    return null;
  }
};

/**
 * Renders a date the way PocketBase stores and compares one.
 *
 * PocketBase accepts a plain ISO string on write but normalises it to a
 * space-separated form, and its filters compare the stored text literally - so
 * an ISO `T` in a `won_at =` filter silently matches nothing.
 */
const toPocketbaseDate = (date: Date) => date.toISOString().replace("T", " ");

/**
 * Looks up a single win by the key the unique index uses, so the backfill can
 * tell an already-recovered win from a new one and stay re-runnable.
 */
export const findJackpotWin = async (
  serverId: string,
  userId: string,
  wonAt: Date,
): Promise<JackpotWinnerRecord | null> => {
  try {
    return await pb
      .collection<JackpotWinnerRecord>("jackpot_winners")
      .getFirstListItem(
        pb.filter(
          "server_id = {:server_id} && user_id = {:user_id} && won_at = {:won_at}",
          {
            server_id: serverId,
            user_id: userId,
            won_at: toPocketbaseDate(wonAt),
          },
        ),
        { requestKey: null },
      );
  } catch {
    // getFirstListItem throws a 404 when nothing matches, which is the common
    // case during a first backfill, not an error worth logging.
    return null;
  }
};
