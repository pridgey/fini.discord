import { pb } from "../../utilities/pocketbase";
import type { BankRecord } from "../../types/PocketbaseTables";

/**
 * utility function to help with wager based games
 * @param userID The UserID of the user playing the game
 * @param guildID The server where the call is coming from
 * @param wager The amount being wagered
 * @param username The username of the user playing the game
 * @param servername The server the game is being played on
 * @returns An object the the user's funds, the user's current balance, and a function to run post game
 */
export const runGame = async (
  userID: string,
  guildID: string,
  wager: number,
  username: string,
  servername: string
) => {
  let userHasFunds = false;
  let userBalance = (await getUserBalance(userID, guildID)) || 0;
  const betAmount = wager || 1;

  // Check if user has funds
  userHasFunds = userBalance >= betAmount;

  // Create command to run when game is over
  const rewardWager = async (win: boolean, multiplier: number) => {
    await addCoin(
      win ? userID : "Jackpot",
      guildID,
      win ? multiplier * betAmount : betAmount,
      username,
      servername,
      win ? "Reserve" : userID
    );
  };

  // return whether the user has funds, and the resulting function
  return {
    userHasFunds,
    userBalance,
    rewardWager,
  };
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
  amount: number,
  username: string,
  servername: string,
  fromUserID: string
) => {
  try {
    // Check if record exists
    const bankResponse = await pb.collection<BankRecord>("bank").getFullList({
      filter: `user_id = "${userID}" && server_id = "${guildID}"`,
    });

    let bankRecord = bankResponse?.[0];

    // Create it if it doesn't exist
    if (!bankRecord) {
      // Create
      const newBankRecord: BankRecord = {
        balance: 0,
        server_id: guildID,
        user_id: userID,
        identifier: `${username}-${servername}`,
      };
      bankRecord = await pb
        .collection<BankRecord>("bank")
        .create(newBankRecord);
    }

    // Ensure source account has the balance to transfer
    const sourceResponse = await pb.collection<BankRecord>("bank").getFullList({
      filter: `user_id = "${fromUserID}" && server_id = "${guildID}"`,
    });

    const sourceRecord = sourceResponse?.[0];

    if (!sourceRecord) {
      throw new Error(`Source Record ID ${fromUserID} does not exist`);
    }

    const parsedAmount = parseFloat(amount.toFixed(2));

    if (sourceRecord.balance < parsedAmount) {
      throw new Error(
        `Source Record ID ${fromUserID} does not have enough finicoin to transfer ${parsedAmount} to ${userID}`
      );
    }

    // Remove from source account
    const sourceBalance = parseFloat(
      (sourceRecord.balance - parsedAmount).toFixed(2)
    );
    await pb
      .collection<BankRecord>("bank")
      .update(sourceRecord.id ?? "unknown bank record id", {
        balance: sourceBalance,
      });

    // Add coin to recipient
    const recipientBalance = parseFloat(
      (bankRecord.balance + parsedAmount).toFixed(2)
    );
    await pb
      .collection<BankRecord>("bank")
      .update(bankRecord.id ?? "unknown bank record id", {
        balance: recipientBalance,
      });
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

    return parseFloat(bankRecord.balance.toFixed(2) || "0");
  } catch (err) {
    console.error("Error running getUserBalance", { err });
    return 0;
  }
};
