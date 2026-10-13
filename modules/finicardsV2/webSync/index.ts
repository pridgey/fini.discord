import { watchRequests } from "./realtime";
import { signIn, webSyncEnabled } from "./remote";
import { answerRequest, pendingRequests, resolveRequest } from "./requests";
import { forgetMailbox, summaryLine, syncOnce } from "./sync";

/**
 * The web side of Finicards: a site where players browse their collection
 * and build decks. See `web/README.md` for the whole arrangement.
 *
 * This is Fini's half. It copies collections out to a public mailbox, and
 * takes deck requests back from it - both over connections Fini opens, so
 * nothing on the internet can reach Fini's own database.
 */

export * from "./remote";
export * from "./requests";
export * from "./snapshot";
export * from "./sync";

/** How often Fini's database is checked for something new to send. */
const SYNC_EVERY_MS = 15_000;
/**
 * How often the mailbox is checked for requests the stream did not announce.
 * Every look is a request, and the mailbox's host allows an address a thousand
 * an hour - shared, at home, with whoever is browsing the site.
 */
const REQUESTS_EVERY_MS = 120_000;
/** How often what the mailbox holds is read again from scratch. */
const REREAD_EVERY_MS = 6 * 60 * 60 * 1000;

/** Requests one player may have waiting before the rest are refused unread. */
const MAX_REQUESTS_AT_ONCE = 5;

/** One thing at a time: a pass and a request never interleave. */
let queue: Promise<unknown> = Promise.resolve();
const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
  const turn = queue.then(work, work);
  queue = turn.catch(() => undefined);
  return turn;
};

export type WebSyncHandle = { stop: () => void };

/**
 * Starts the sync, or does nothing if the mailbox is not configured.
 *
 * @param serverNames Called each pass for the names of the bot's servers
 */
export const startWebSync = (
  serverNames: () => Record<string, string>,
): WebSyncHandle | null => {
  if (!webSyncEnabled()) return null;

  const controller = new AbortController();
  let failing = false;
  // After a failure the mailbox is left alone for a while, longer each time:
  // it is most often refusing because it has been asked too much already.
  let failures = 0;
  let quietUntil = 0;
  const holdOff = () => {
    failures += 1;
    quietUntil = Date.now() + Math.min(30_000 * 2 ** (failures - 1), 10 * 60_000);
  };

  const pass = () =>
    inTurn(async () => {
      if (Date.now() < quietUntil) return;
      try {
        const summary = await syncOnce(serverNames());
        if (
          summary.created ||
          summary.updated ||
          summary.removed ||
          summary.art ||
          summary.faces ||
          summary.failed
        ) {
          console.log(`Web sync: ${summaryLine(summary)}`);
        }
        // A row that would not send is unknown ground: read the mailbox again.
        if (summary.failed) forgetMailbox();
        failing = false;
        failures = 0;
      } catch (error) {
        // Say so once, not every fifteen seconds while the mailbox is down.
        if (!failing) console.error("Web sync: pass failed:", (error as Error)?.message ?? error);
        failing = true;
        forgetMailbox();
        holdOff();
      }
    });

  let draining = false;
  const drain = async () => {
    if (draining || Date.now() < quietUntil) return;
    draining = true;
    try {
      await inTurn(async () => {
        await signIn();
        const requests = await pendingRequests();
        const asked = new Map<string, number>();
        for (const request of requests) {
          // Nobody saves decks faster than this by hand; the rest is a flood.
          const count = (asked.get(request.user) ?? 0) + 1;
          asked.set(request.user, count);
          if (count > MAX_REQUESTS_AT_ONCE) {
            await answerRequest(request, {
              status: "rejected",
              message: "Too many requests at once. Nothing was changed.",
            });
            continue;
          }
          const outcome = await resolveRequest(request).catch((error) => {
            console.error("Web sync: request failed:", error);
            return {
              status: "rejected" as const,
              message: "Something went wrong on Fini's side. Nothing was changed.",
            };
          });
          // The deck is in the mailbox before the site is told it was saved.
          if (outcome.status === "applied") await syncOnce(serverNames()).catch(() => undefined);
          await answerRequest(request, outcome);
        }
      });
    } catch (error) {
      if (!failing) console.error("Web sync: could not read requests:", (error as Error)?.message ?? error);
      failing = true;
      holdOff();
    } finally {
      draining = false;
    }
  };

  console.log("Web sync: on");
  void pass();
  void watchRequests(() => void drain(), controller.signal);

  const timers = [
    setInterval(() => void pass(), SYNC_EVERY_MS),
    setInterval(() => void drain(), REQUESTS_EVERY_MS),
    setInterval(() => void inTurn(async () => forgetMailbox()), REREAD_EVERY_MS),
  ];

  return {
    stop: () => {
      controller.abort();
      timers.forEach(clearInterval);
    },
  };
};
