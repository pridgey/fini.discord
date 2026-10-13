import {
  AniStock_Detail,
  AniStock_Holdings,
  JackpotWinnerRecord,
  UserCardRecord,
} from "../types/PocketbaseTables";
import type { HelpCategory } from "../modules/help/commandIndex";
import type { V2UserCardRecord } from "../types/PocketbaseTablesV2";
import { QueryFunction } from "../types/QueryTypes";
import { animeDetailsQuery } from "./queryFunctions/AnimeDetails.query";
import { animeHoldingQuery } from "./queryFunctions/AnimeHolding.query";
import { boosterPackQuery } from "./queryFunctions/BoosterPack.query";
import { cardCollectionQuery } from "./queryFunctions/CardCollection.query";
import { cardCollectionListQuery } from "./queryFunctions/cardCollectionList.query";
import { helpCategoriesQuery } from "./queryFunctions/helpCategories.query";
import { jackpotHistoryQuery } from "./queryFunctions/JackpotHistory.query";
import { v2CardBinderQuery } from "./queryFunctions/v2CardBinder.query";
import { v2CardCollectionQuery } from "./queryFunctions/v2CardCollection.query";

const queryDictionary = {
  anistock_details: animeDetailsQuery,
  anistock_portfolio: animeHoldingQuery,
  user_card: boosterPackQuery,
  card_collection: cardCollectionQuery,
  card_collection_list: cardCollectionListQuery,
  jackpot_history: jackpotHistoryQuery,
  help_commands: helpCategoriesQuery,
  v2_card_collection: v2CardCollectionQuery,
  v2_card_binder: v2CardBinderQuery,
};

export type QueryMap = {
  anistock_details: AniStock_Detail;
  anistock_portfolio: AniStock_Holdings;
  user_card: UserCardRecord;
  card_collection: UserCardRecord;
  card_collection_list: UserCardRecord;
  jackpot_history: JackpotWinnerRecord;
  help_commands: HelpCategory;
  v2_card_collection: V2UserCardRecord;
  v2_card_binder: V2UserCardRecord;
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
