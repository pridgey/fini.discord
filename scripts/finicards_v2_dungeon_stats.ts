import { V2_DUNGEON_RUN } from "../modules/finicards/dungeonStore";
import { summariseYears } from "../modules/finicards/dungeonStats";
import type { V2DungeonRunRecord } from "../types/PocketbaseTablesV2";
import { pb } from "../utilities/pocketbase";

/**
 * Dungeon runs, year by year.
 *
 *   bun --env-file=.env run scripts/finicards_v2_dungeon_stats.ts
 *   bun --env-file=.env run scripts/finicards_v2_dungeon_stats.ts --year 2026
 *   bun --env-file=.env run scripts/finicards_v2_dungeon_stats.ts --server <id>
 *   bun --env-file=.env run scripts/finicards_v2_dungeon_stats.ts --json
 *
 * Reads only. Every run is kept after it ends, so this is the whole history.
 */

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const server = flag("server");
const runs = await pb.collection<V2DungeonRunRecord>(V2_DUNGEON_RUN).getFullList({
  ...(server ? { filter: `server_id = "${server.replace(/["\\]/g, "")}"` } : {}),
  sort: "created",
});

const wanted = flag("year");
const years = summariseYears(runs).filter((year) => !wanted || year.year === Number(wanted));

if (args.includes("--json")) {
  console.log(JSON.stringify(years, null, 2));
  process.exit(0);
}

if (years.length === 0) console.log("No dungeon runs to report.");

for (const year of years) {
  const endings = Object.entries(year.endings)
    .map(([state, count]) => `${count} ${state}`)
    .join(", ");

  console.log(`\n=== ${year.year}${server ? ` · server ${server}` : ""} ===`);
  console.log(`Runs            ${year.runs}  (${endings})`);
  console.log(`Players         ${year.players.length}`);
  console.log(`Deepest         room ${year.deepest?.depth ?? 0}${year.deepest ? `, by ${year.deepest.name}` : ""}`);
  console.log(`Average depth   ${year.averageDepth.toFixed(1)} rooms`);
  console.log(`Fights won      ${year.fightsWon}  (bosses: ${year.bossesWon})`);
  console.log(`Geld earned     ${year.geldEarned}`);
  console.log(`Finicoin        ${year.feesPaid} in entry fees, ${year.coinPaid} paid out, ${year.feesPaid - year.coinPaid} kept by the Reserve`);
  console.log(`Cards won       ${year.cardsWon}`);

  console.log("\nPlayers, by deepest run");
  for (const player of year.players.slice(0, 10)) {
    console.log(
      `  ${player.name.padEnd(22)} room ${String(player.deepest).padStart(3)} · ${String(player.runs).padStart(3)} runs · ${String(player.fightsWon).padStart(4)} fights won · ${String(player.coinPaid - player.feesPaid).padStart(5)} fc net`,
    );
  }

  const cards = Object.entries(year.cardWins).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (cards.length > 0) {
    console.log("\nCards, by fights won");
    for (const [card, wins] of cards) console.log(`  ${card.padEnd(30)} ${wins}`);
  }
}
process.exit(0);
