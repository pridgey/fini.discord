import { useCallback, useEffect, useRef, useState } from "react";
import { pb } from "./pb";
import {
  DEFAULT_META,
  type Card,
  type CardRow,
  type Deck,
  type Definition,
  type Meta,
  type Player,
  type RequestRow,
} from "./types";

/** Everything the signed-in player may see, as the mailbox last had it. */
export type Data = {
  meta: Meta;
  players: Player[];
  cards: Card[];
  decks: Deck[];
};

const META_ID = "finicardsmeta00";

const load = async (): Promise<Data> => {
  const [meta, players, definitions, rows, decks] = await Promise.all([
    pb
      .collection("web_meta")
      .getOne(META_ID)
      .then((row) => ({ ...DEFAULT_META, ...(row.data as Partial<Meta>) }))
      .catch(() => DEFAULT_META),
    pb.collection("web_player").getFullList<Player>({ sort: "-cards" }),
    pb.collection("web_definition").getFullList<Definition>({ batch: 500 }),
    pb.collection("web_card").getFullList<CardRow>({ batch: 500 }),
    pb.collection("web_deck").getFullList<Deck>({ sort: "name" }),
  ]);

  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const cards = rows.flatMap((row) => {
    const def = byId.get(row.definition);
    return def ? [{ ...row, def }] : [];
  });
  return { meta, players, cards, decks };
};

export type DataState =
  | { status: "loading"; data: null }
  | { status: "error"; data: null; error: string }
  | { status: "ready"; data: Data };

/** Loads the player's data, and again whenever the tab is come back to. */
export const useData = (signedIn: boolean) => {
  const [state, setState] = useState<DataState>({ status: "loading", data: null });
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const turn = ++latest.current;
    try {
      const data = await load();
      if (turn === latest.current) setState({ status: "ready", data });
    } catch (error) {
      if (turn !== latest.current) return;
      // A refresh that fails leaves what is on screen alone.
      setState((current) =>
        current.status === "ready"
          ? current
          : { status: "error", data: null, error: (error as Error)?.message ?? "Could not load." },
      );
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    setState({ status: "loading", data: null });
    void reload();
    const onFocus = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [signedIn, reload]);

  return { state, reload };
};

/* -------------------------------------------------------------- requests --- */

export type DeckRequest =
  | { kind: "deck_save"; payload: { deckId?: string; name: string; cards: string[] } }
  | { kind: "deck_delete"; payload: { deckId: string } }
  /** Fini posts the card in the server's Finicards channel, as the View button does. */
  | { kind: "card_show"; payload: { card: string } };

const ANSWER_EVERY_MS = 600;
const ANSWER_WITHIN_MS = 25_000;

export type RequestResult = { ok: boolean; message: string; deck: string };

/**
 * Leaves a request for Fini and waits for the answer. The site changes
 * nothing itself: until Fini has checked the request and done it, nothing
 * has happened.
 */
export const ask = async (serverId: string, request: DeckRequest): Promise<RequestResult> => {
  const user = pb.authStore.record?.id;
  if (!user) return { ok: false, message: "Sign in again.", deck: "" };

  let left: RequestRow;
  try {
    left = await pb.collection("web_request").create<RequestRow>({
      user,
      server_id: serverId,
      kind: request.kind,
      payload: request.payload,
      status: "pending",
    });
  } catch {
    return { ok: false, message: "The request could not be sent. Nothing was changed.", deck: "" };
  }

  const deadline = Date.now() + ANSWER_WITHIN_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, ANSWER_EVERY_MS));
    const row = await pb
      .collection("web_request")
      .getOne<RequestRow>(left.id)
      .catch(() => null);
    if (row && row.status !== "pending") {
      return { ok: row.status === "applied", message: row.message, deck: row.deck };
    }
  }
  return {
    ok: false,
    message: "Fini has not answered. It may be offline - your change will not be made late.",
    deck: "",
  };
};

/* ---------------------------------------------------------------- routes --- */

export type Route =
  | { page: "collection" }
  | { page: "decks" }
  | { page: "deck"; id: string };

export const parseRoute = (hash: string): Route => {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "decks" && parts[1]) return { page: "deck", id: parts[1] };
  if (parts[0] === "decks") return { page: "decks" };
  return { page: "collection" };
};

export const useRoute = (): Route => {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
};

export const go = (path: string): void => {
  location.hash = path;
};

const remembered = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

/** A value kept between visits, where the browser allows it. */
export const useRemembered = (key: string, fallback = "") => {
  const [value, setValue] = useState(() => remembered(key) || fallback);
  const set = useCallback(
    (next: string) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Private windows may refuse; the choice just lasts the visit.
      }
    },
    [key],
  );
  return [value, set] as const;
};
