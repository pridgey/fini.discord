import { db } from "./../../utilities";
import { BankRecord } from "./../../types";

export const runGame = async (
  userID: string,
  guildID: string,
  wager: number
) => {
  let userHasFunds = false;
  let userBalance = 0;
  const betAmount = Math.round(wager) || 1;

  // Check if user has funds
  await db()
    .select<BankRecord>("Bank", { Field: "User", Value: userID }, guildID)
    .then((results: BankRecord[]) => {
      const balance = Number(results[0].Balance);
      userBalance = balance;
      userHasFunds = balance >= betAmount;
    });

  // If funds available, hold funds
  if (userHasFunds) {
    await removeCoin(userID, guildID, betAmount);
  }

  // Create command to run when game is over
  const rewardWager = (win: boolean, multiplier: number) =>
    addCoin(win ? userID : "fini", guildID, multiplier * betAmount).then(
      ({ balance }) => ({
        balance: win ? balance : userBalance - betAmount,
        betAmount,
      })
    );

  // return whether the user has funds, and the resulting function
  return {
    userHasFunds,
    userBalance,
    rewardWager,
  };
};

export const removeCoin = (userID: string, guildID, amount: number) =>
  addCoin(userID, guildID, amount * -1);

export const addCoin = (userID: string, guildID: string, amount: number) =>
  db()
    .select<BankRecord>(
      "Bank",
      {
        Field: "User",
        Value: userID,
      },
      guildID
    )
    .then((results: BankRecord[]) => results[0])
    .then((userAccount) => {
      db().update<BankRecord>(
        "Bank",
        { Field: "ID", Value: userAccount.ID },
        {
          Field: "Balance",
          Value: Number(userAccount.Balance) + Number(amount),
        },
        guildID
      );
      return {
        balance: Number(userAccount.Balance) + Number(amount),
      };
    })
    .catch((err) => {
      console.error(err);
      return {
        balance: 0,
      };
    });

export const getUserBalance = (userID: string, guildID: string) =>
  db()
    .select<BankRecord>("Bank", { Field: "User", Value: userID }, guildID)
    .then((results: BankRecord[]) => results[0].Balance);
