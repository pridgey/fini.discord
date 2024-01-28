import { pb } from "../../utilities/pocketbase";
import type { BankRecord } from "../../types/PocketbaseTables";

/**
 * utility function to help with wager based games
 * @param userID The UserID of the user playing the game
 * @param guildID The server where the call is coming from
 * @param wager The amount being wagered
 * @returns An object the the user's funds, the user's current balance, and a function to run post game
 */
export const runGame = async (
  userID: string,
  guildID: string,
  wager: number
) => {
  let userHasFunds = false;
  let userBalance = (await getUserBalance(userID, guildID)) || 0;
  const betAmount = wager || 1;

  // Check if user has funds
  userHasFunds = userBalance >= betAmount;

  // If funds available, hold funds
  if (userHasFunds) {
    await removeCoin(userID, guildID, betAmount);
  }

  // Create command to run when game is over
  const rewardWager = async (win: boolean, multiplier: number) => {
    await addCoin(win ? userID : "Fini", guildID, multiplier * betAmount);
  };

  // A fallback function to run on error so we don't accidentally steal their coin
  const onError = async () => {
    await addCoin(userID, guildID, wager);
  };

  // return whether the user has funds, and the resulting function
  return {
    onError,
    userHasFunds,
    userBalance,
    rewardWager,
  };
};

/**
 * utility function to take finicoin away from a user
 * @param userID The UserID of the user to remove coin from
 * @param guildID The server ID of the server where the call is coming from
 * @param amount The amount to remove
 */
export const removeCoin = (userID: string, guildID, amount: number) => {
  addCoin(userID, guildID, amount * -1);
};

/**
 * utility function to reward finicoin to a user
 * @param userID The UserID of the user to add coin to
 * @param guildID The server ID of the server where the call is coming from
 * @param amount The amount to reward
 */
export const addCoin = async (
  userID: string,
  guildID: string,
  amount: number
) => {
  try {
    // Check if record exists
    const bankRecord = await pb
      .collection<BankRecord>("bank")
      .getFirstListItem(`user_id = "${userID}" && server_id = "${guildID}"`);

    if (bankRecord.id) {
      // Update
      await pb.collection<BankRecord>("bank").update(bankRecord.id, {
        balance: bankRecord.balance + amount,
      });
    } else {
      // Create
      const newBankRecord: BankRecord = {
        balance: amount,
        server_id: guildID,
        user_id: userID,
      };
      await pb.collection<BankRecord>("bank").create(newBankRecord);
    }
  } catch (err) {
    console.error("Error running finicoin.addCoin", { err });
  }
};

/**
 * utility function to get the user's current finicoin balance
 * @param userID The UserID of the user to get the balance of
 * @param guildID The GuildID of the server the call is coming from
 * @returns The balance
 */
export const getUserBalance = async (userID: string, guildID: string) => {
  try {
    const bankRecord = await pb
      .collection<BankRecord>("bank")
      .getFirstListItem(`user_id = "${userID}" && server_id = "${guildID}"`);

    return bankRecord.balance || 0;
  } catch (err) {
    console.error("Error running getUserBalance", { err });
  }
};
