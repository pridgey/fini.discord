import { AniStock_Transaction } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

type ActionStockArgs = {
  animeId: string;
  userId: string;
  userName: string;
  serverId: string;
  serverName: string;
  price: number;
  quantity: number;
};

export const buyStock = async ({
  animeId,
  userId,
  userName,
  quantity,
  serverId,
  serverName,
  price,
}: ActionStockArgs) => {
  await pb.collection<AniStock_Transaction>("anistock_transactions").create({
    anime: animeId,
    shares: quantity,
    price: price,
    action: "BUY",
    user_id: userId,
    server_id: serverId,
    identifier: `${userName}-${serverName}`,
  });
};

export const sellStock = async ({
  animeId,
  userId,
  userName,
  quantity,
  serverId,
  serverName,
  price,
}: ActionStockArgs) => {
  await pb.collection<AniStock_Transaction>("anistock_transactions").create({
    anime: animeId,
    shares: quantity,
    price: price,
    action: "SELL",
    user_id: userId,
    server_id: serverId,
    identifier: `${userName}-${serverName}`,
  });
};
