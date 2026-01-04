import { queryAnime } from "./utilities";

const test = async () => {
  await queryAnime(); // No query - all anime (seems to work)
  // await queryAnime("w7yvxfxitrgdqm7"); // By id (seems to work)
  // await queryAnime("57555"); // By mal_id (seems to work)
  // await queryAnime("Spy Family"); // By title, should be loose (seems to work)
  // await queryAnime("Blah Blah"); // Should find nothing
};

test();

/**
- Expected commands for Anime Stocks:
1. Query an anime -> Get it's current price, hype score, volatility rating, and other stats
2. See Upcoming anime
3. See Currently Ongoing anime
4. See Finished anime
5. See portfolio of owned anime stocks


 */
