import { AniStock_Stock } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

/**
 * Utility function to get the details of a specific anime stock by its ID
 */
export const getStockDetails = async (aniStockId: string) => {
  const response = await pb
    .collection<AniStock_Stock>("anistock_stock")
    .getFirstListItem(`anime = "${aniStockId}"`, {
      sort: "-created",
    });

  return response;
};
