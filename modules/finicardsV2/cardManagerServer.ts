import { timingSafeEqual } from "crypto";
import { handleCardManager } from "../../scripts/finicards_v2_card_manager";

/**
 * The card manager, kept up by the bot.
 *
 * The same tool `scripts/finicards_v2_art_check.ts --serve` puts on localhost,
 * started with Fini and reachable from the home network, so managing cards
 * does not need an ssh tunnel. Off unless FINI_CARD_MANAGER_PORT is set.
 *
 * It can change and delete cards, so it answers only to addresses that are
 * on a private network - the house's, or the tailnet - whatever a router may
 * one day forward to it. Set FINI_CARD_MANAGER_PASSWORD to have it ask for a
 * password as well; on plain HTTP that keeps out the curious, not the
 * determined.
 */

const port = Number(process.env.FINI_CARD_MANAGER_PORT ?? "");
const host = process.env.FINI_CARD_MANAGER_HOST || "0.0.0.0";
const password = process.env.FINI_CARD_MANAGER_PASSWORD ?? "";

/** Loopback, the private IPv4 ranges, Tailscale's, and their IPv6 kin. */
export const isPrivateAddress = (address: string): boolean => {
  const ip = address.replace(/^::ffff:/i, "").toLowerCase();
  if (ip === "::1") return true;
  if (ip.includes(":")) return /^(fc|fd|fe[89ab])/.test(ip);
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    // Tailscale hands out 100.64.0.0/10.
    (a === 100 && b >= 64 && b <= 127)
  );
};

const passwordGiven = (request: Request): boolean => {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("basic ")) return false;
  const given = Buffer.from(header.slice(6), "base64").toString("utf8");
  // Any user name; only the password is checked.
  const sent = Buffer.from(given.slice(given.indexOf(":") + 1));
  const wanted = Buffer.from(password);
  return sent.length === wanted.length && timingSafeEqual(sent, wanted);
};

/** Starts the card manager, if a port is configured. True if it is up. */
export const startCardManager = (): boolean => {
  if (!Number.isInteger(port) || port <= 0) return false;

  try {
    Bun.serve({
      hostname: host,
      port,
      // The default is ten seconds, and searching a large wiki takes longer.
      // Spread in because the installed Bun types predate the option.
      ...({ idleTimeout: 120 } as object),
      async fetch(request, server) {
        const from = server.requestIP(request)?.address ?? "";
        if (!isPrivateAddress(from)) return new Response("no", { status: 403 });
        if (password && !passwordGiven(request)) {
          return new Response("password needed", {
            status: 401,
            headers: { "WWW-Authenticate": 'Basic realm="Finicards card manager"' },
          });
        }

        const url = new URL(request.url);
        if (url.pathname === "/cards" || url.pathname.startsWith("/cards/")) {
          return handleCardManager(request, url);
        }
        if (url.pathname === "/") return Response.redirect("/cards/", 302);
        return new Response("not found", { status: 404 });
      },
    });
  } catch (error) {
    // Most likely the port is taken - a card manager started by hand, say.
    console.error(`Card manager could not start on ${host}:${port}:`, (error as Error)?.message ?? error);
    return false;
  }

  console.log(`Card manager on http://${host}:${port}/cards/${password ? " (password needed)" : ""}`);
  return true;
};
