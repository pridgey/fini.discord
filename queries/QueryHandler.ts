import {
  AniStock_Detail,
  AniStock_Holdings,
  UserCardRecord,
} from "../types/PocketbaseTables";
import { QueryFunction } from "../types/QueryTypes";
import { animeDetailsQuery } from "./queryFunctions/AnimeDetails.query";
import { animeHoldingQuery } from "./queryFunctions/AnimeHolding.query";
import { boosterPackQuery } from "./queryFunctions/BoosterPack.query";
import { cardCollectionQuery } from "./queryFunctions/CardCollection.query";
import { cardCollectionListQuery } from "./queryFunctions/cardCollectionList.query";

const queryDictionary = {
  anistock_details: animeDetailsQuery,
  anistock_portfolio: animeHoldingQuery,
  user_card: boosterPackQuery,
  card_collection: cardCollectionQuery,
  card_collection_list: cardCollectionListQuery,
};

export type QueryMap = {
  anistock_details: AniStock_Detail;
  anistock_portfolio: AniStock_Holdings;
  user_card: UserCardRecord;
  card_collection: UserCardRecord;
  card_collection_list: UserCardRecord;
};

/* Utility function to retrieve the appropriate query function based on the query identifier */
export const QueryHandler = <K extends keyof QueryMap>(
  queryIdentifier: K,
): QueryFunction<QueryMap[K]> => {
  const queryFunction = queryDictionary[queryIdentifier];

  if (!queryFunction) {
    throw new Error(
      `No query function found for identifier: ${queryIdentifier}`,
    );
  }

  return queryFunction as unknown as QueryFunction<QueryMap[K]>;
};
