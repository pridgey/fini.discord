/**
 * Runs the web sync without the bot.
 *
 *   bun --env-file=.env run scripts/finicards_v2_web_sync.ts           one pass, then exit
 *   bun --env-file=.env run scripts/finicards_v2_web_sync.ts --watch   keep going, answering requests
 *
 * Against an empty mailbox this sends every card, its artwork and its
 * rendered face, which takes several minutes; after that, only what changed.
 */
import { startWebSync, summaryLine, syncOnce, webSyncEnabled } from "../modules/finicards/webSync";

/** The bot knows its servers by name; a script only knows what it is told. */
const serverNames = (): Record<string, string> => {
  try {
    return JSON.parse(process.env.FINI_WEB_SERVER_NAMES ?? "{}");
  } catch {
    return {};
  }
};

if (!webSyncEnabled()) {
  console.error(
    "Set FINI_WEB_POCKETBASE_URL, FINI_WEB_POCKETBASE_EMAIL and FINI_WEB_POCKETBASE_PASSWORD first.",
  );
  process.exit(1);
}

if (process.argv.includes("--watch")) {
  startWebSync(serverNames);
} else {
  // Card faces are rendered a batch per pass, so keep going until none are left.
  let failed = 0;
  for (;;) {
    const started = Date.now();
    const summary = await syncOnce(serverNames());
    console.log(`${summaryLine(summary)} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    failed += summary.failed;
    if (!summary.facesLeft || summary.failed) break;
  }
  process.exit(failed ? 1 : 0);
}
