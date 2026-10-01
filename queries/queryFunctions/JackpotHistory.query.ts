import { ContainerBuilder } from "discord.js";
import { JackpotWinnerRecord } from "../../types/PocketbaseTables";
import {
  QueryFunction,
  QueryParams,
  ResultsBuilder,
} from "../../types/QueryTypes";
import { pb } from "../../utilities/pocketbase";

/** Newest win first. Sorted on `won_at`, not `created` - see the record type. */
const DEFAULT_SORT = "-won_at";

/**
 * Deliberately not date-fns: the test suite mocks that module wholesale for
 * the /remind tests, and a partial mock leaks into every file loaded after it.
 */
const WON_AT_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * PocketBase hands back dates as "2024-01-18 23:17:18.878Z". Engines happen to
 * parse that, but only ISO-8601 with the `T` is actually specified, so restore
 * it rather than depend on lenient parsing.
 */
const parseWonAt = (wonAt: string) => new Date(wonAt.replace(" ", "T"));

const queryJackpotHistory = async ({
  page,
  perPage,
  filterOption,
  sortOption,
}: QueryParams) => {
  const results = await pb
    .collection<JackpotWinnerRecord>("jackpot_winners")
    .getList(page, perPage, {
      sort: sortOption || DEFAULT_SORT,
      filter: filterOption,
    });

  return {
    // buildResults is handed only the page's items, never the page number, so
    // the running position has to be baked in here or numbering would restart
    // at 1 on every page.
    items: results.items.map((item, index) => ({
      ...item,
      rank: (results.page - 1) * results.perPage + index + 1,
    })),
    totalItems: results.totalItems,
    totalPages: results.totalPages,
    currentPage: results.page,
    perPage: results.perPage,
  };
};

const buildJackpotHistoryResult = async ({
  items,
}: ResultsBuilder<JackpotWinnerRecord>) => {
  const lines = items.map((item) => {
    const when = item.won_at
      ? WON_AT_FORMAT.format(parseWonAt(item.won_at))
      : "unknown date";
    const who = item.username || item.user_id;

    return `\`${String(item.rank ?? 0).padStart(2, " ")}.\` **${who}** — ${item.amount.toLocaleString()} Finicoin — *${when}*`;
  });

  const resultContainer = new ContainerBuilder().addTextDisplayComponents(
    (text) =>
      text.setContent(`## 🎰 Jackpot Winners\n${lines.join("\n")}`),
  );

  return {
    components: [resultContainer],
    useComponentsV2: true,
  };
};

export const jackpotHistoryQuery: QueryFunction<JackpotWinnerRecord> = {
  query: queryJackpotHistory,
  id: "jackpot_history",
  buildResults: buildJackpotHistoryResult,
};
