/**
 * Serves a mailbox file - card art, a card face, a Legendary's animation -
 * through Vercel's CDN.
 *
 * The mailbox's host allows each visitor a thousand requests an hour, and a
 * collection is hundreds of pictures: loaded straight from the mailbox, one
 * page of browsing spends the whole allowance and locks the visitor out. A
 * file never changes once it is made (a new picture gets a new name), so it
 * is fetched from the mailbox once and kept by the CDN for good.
 *
 *   /api/file?p=<collection>/<record>/<file name>
 */
export const config = { runtime: "edge" };

const MAILBOX = (process.env.VITE_POCKETBASE_URL ?? "").replace(/\/+$/, "");
/** A collection id or name, a record id, a file name. Nothing else gets through. */
const PATH = /^[A-Za-z0-9_]+\/[a-z0-9]+\/[A-Za-z0-9_.-]+$/;

export default async function handler(request: Request): Promise<Response> {
  const path = new URL(request.url).searchParams.get("p") ?? "";
  if (!MAILBOX || !PATH.test(path) || path.includes("..")) {
    return new Response("not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const upstream = await fetch(`${MAILBOX}/api/files/${path}`);
  if (!upstream.ok) {
    // Not kept: a file that is missing or held up now may be there shortly.
    return new Response("not found", {
      status: upstream.status === 404 ? 404 : 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
