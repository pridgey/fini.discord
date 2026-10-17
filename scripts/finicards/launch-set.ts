import { appendFile } from "fs/promises";
import path from "path";
import { V2_CARD_DEFINITION } from "../../modules/finicards/cardStore";
import { FINICARDS_WORK_DIR } from "../../modules/finicards/workDir";
import { pb } from "../../utilities/pocketbase";
import type { V2CardDefinitionRecord } from "../../types/PocketbaseTablesV2";

/**
 * Launches a set: makes every card in it active, so packs can pull them.
 *
 *   bun --env-file=.env run scripts/finicards/launch-set.ts 4                    dry run
 *   bun --env-file=.env run scripts/finicards/launch-set.ts 4 --commit
 *   bun --env-file=.env run scripts/finicards/launch-set.ts 4 --except "Umberlee" --commit
 *
 * `--except` keeps named characters back (repeat it, or separate names with
 * commas). Each change is logged in the card manager's edits.jsonl, so it can
 * be undone card by card. Set packs offer the set once the commands are
 * registered again (`bun run register-commands`).
 */

const args = process.argv.slice(2);
const set = Number(args.find((arg) => /^\d+$/.test(arg)));
const commit = args.includes("--commit");
const held = new Set(
  args
    .flatMap((arg, i) => (args[i - 1] === "--except" ? arg.split(",") : []))
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean),
);

if (!set) {
  console.log(
    "Which set? e.g. scripts/finicards/launch-set.ts 4 [--except Name] [--commit]",
  );
  process.exit(1);
}

const cards = await pb
  .collection<V2CardDefinitionRecord>(V2_CARD_DEFINITION)
  .getFullList({
    filter: pb.filter("set = {:set} && active = false", { set }),
  });
const launching = cards.filter(
  (card) => !held.has(card.card_name.toLowerCase()),
);
const kept = cards.length - launching.length;

console.log(
  `Set ${set}: ${launching.length} card(s) to activate across ${new Set(launching.map((card) => card.card_name)).size} characters${kept ? `, ${kept} held back` : ""}.`,
);
if (!commit) {
  console.log("Dry run - nothing changed. Add --commit to launch.");
  process.exit(0);
}

const log = path.join(FINICARDS_WORK_DIR, "card-manager", "edits.jsonl");
for (const card of launching) {
  const after = await pb
    .collection<V2CardDefinitionRecord>(V2_CARD_DEFINITION)
    .update(card.id!, { active: true });
  await appendFile(
    log,
    `${JSON.stringify({ at: new Date().toISOString(), action: "update", id: card.id, name: card.card_name, before: card, after, by: `launch set ${set}` })}\n`,
  );
}
console.log(
  `Set ${set} is live: ${launching.length} cards activated. Run \`bun run register-commands\` so set packs offer it.`,
);
process.exit(0);
