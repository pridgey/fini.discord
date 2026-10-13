import { renumberSets } from "../modules/finicardsV2/cardStore";

/**
 * Numbers every card within its release set, for the "12/217" in the footer.
 *
 *   bun --env-file=.env run scripts/finicards_v2_number_sets.ts
 *
 * Safe to run again: only cards whose number is out of date are written. The
 * card manager does the same after every save, so this is for the first run
 * and for cards changed some other way.
 */

const result = await renumberSets();

if (!result.ready) {
  console.log("The number columns are not there yet. Restart Fini to apply the migration, then run this again.");
  process.exit(1);
}

for (const [set, size] of [...result.sets].sort((a, b) => a[0] - b[0])) {
  console.log(`Set ${set}: ${size} cards`);
}
console.log(`${result.changed} cards renumbered.`);
process.exit(0);
