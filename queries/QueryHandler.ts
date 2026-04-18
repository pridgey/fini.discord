import { AniStock_Detail, UserCardRecord } from "../types/PocketbaseTables";
import { QueryFunction } from "../types/QueryTypes";
import { animeDetailsQuery } from "./queryFunctions/AnimeDetailsQuery";
import { boosterPackQuery } from "./queryFunctions/BoosterPackQuery";

const queryDictionary = {
  anistock_details: animeDetailsQuery,
  user_card: boosterPackQuery,
};

export type QueryMap = {
  anistock_details: AniStock_Detail;
  user_card: UserCardRecord;
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
