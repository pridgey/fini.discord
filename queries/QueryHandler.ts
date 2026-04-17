import { animeDetailsQuery } from "./queryFunctions/AnimeDetailsQuery";

/* Utility function to retrieve the appropriate query function based on the query identifier */
export const QueryHandler = (queryIdentifier: string) => {
  const queryFunction = {
    anistock_details: animeDetailsQuery,
  }[queryIdentifier];

  if (!queryFunction) {
    throw new Error(
      `No query function found for identifier: ${queryIdentifier}`,
    );
  }

  return queryFunction;
};
