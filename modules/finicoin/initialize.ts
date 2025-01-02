import { BankRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

/**
 * Checks if the server has the proper system accounts in the bank table
 * @param serverId The server id being checked
 * @param servername The server name being checked
 */
export const initializeServerBank = async (
  serverId: string,
  servername: string
) => {
  // Grab the record
  // Not using getUserBalance because we need to know if the record doesn't exist
  const bankQueryResponse = await pb
    .collection<BankRecord>("bank")
    .getFullList({
      filter: `server_id = "${serverId}" && user_id = "Reserve"`,
    });

  const bankReserveRecord = bankQueryResponse?.[0];

  if (!bankReserveRecord) {
    // Create bank reserve record if it doesn't exist
    await pb.collection<BankRecord>("bank").create({
      user_id: "Reserve",
      server_id: serverId,
      identifier: `Reserve-${servername}`,
      balance: 5_000_000,
    });
  }

  // Doing the same for the Jackpot record
  const jackpotQueryResponse = await pb
    .collection<BankRecord>("bank")
    .getFullList({
      filter: `server_id = "${serverId}" && user_id = "Jackpot"`,
    });

  const jackpotRecord = jackpotQueryResponse?.[0];

  if (!jackpotRecord) {
    // Create bank reserve record if it doesn't exist
    await pb.collection<BankRecord>("bank").create({
      user_id: "Jackpot",
      server_id: serverId,
      identifier: `Jackpot-${servername}`,
      balance: 0,
    });
  }
};
