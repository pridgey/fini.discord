import { remote, remoteUrl, signIn } from "./remote";

/**
 * Listens for new requests in the mailbox.
 *
 * Pocketbase announces changes over a server-sent event stream. Its client
 * expects the browser's `EventSource`, which Bun does not have, so the stream
 * is read by hand: open it, take the client id it greets with, and say what
 * to be told about. It is a connection Fini opens outward and holds.
 *
 * A stream can go quiet without closing, so this is a nudge and never the
 * only way a request is found - `index.ts` also looks on a timer.
 */

const TOPIC = "web_request/*";
const RETRY_MS = 5_000;
const MAX_RETRY_MS = 60_000;

/** Calls `onRequest` whenever a request is left, until `signal` aborts. */
export const watchRequests = async (
  onRequest: () => void,
  signal: AbortSignal,
): Promise<void> => {
  let wait = RETRY_MS;

  while (!signal.aborted) {
    try {
      await signIn();
      const response = await fetch(`${remoteUrl()}/api/realtime`, {
        headers: { Accept: "text/event-stream" },
        signal,
      });
      if (!response.ok || !response.body) throw new Error(`stream refused: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const message = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const field = (name: string) =>
            message
              .split("\n")
              .find((line) => line.startsWith(`${name}:`))
              ?.slice(name.length + 1)
              .trim() ?? "";

          if (field("event") === "PB_CONNECT") {
            const { clientId } = JSON.parse(field("data"));
            const subscribed = await fetch(`${remoteUrl()}/api/realtime`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: remote.authStore.token,
              },
              body: JSON.stringify({ clientId, subscriptions: [TOPIC] }),
              signal,
            });
            if (!subscribed.ok) throw new Error(`subscribe refused: ${subscribed.status}`);
            wait = RETRY_MS;
            // Anything left while the stream was down.
            onRequest();
          } else if (field("event") === TOPIC) {
            if (JSON.parse(field("data")).action === "create") onRequest();
          }
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      // A quiet stream is closed after a few minutes and simply opened again;
      // only a drop for some other reason is worth a line in the log.
      const reason = (error as Error)?.message ?? String(error);
      if (!/timed out/i.test(reason)) console.error("Web sync: request stream dropped:", reason);
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait = Math.min(wait * 2, MAX_RETRY_MS);
  }
};
