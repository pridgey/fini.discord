import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty } from "./components/bits";
import { CollectionPage } from "./components/CollectionPage";
import { DeckEditor } from "./components/DeckEditor";
import { DecksPage } from "./components/DecksPage";
import { Login } from "./components/Login";
import { devSignIn, pb, signOut, viewer, type Viewer } from "./lib/pb";
import { go, useData, useRemembered, useRoute } from "./lib/store";

type Toast = { id: number; text: string; ok: boolean };

export const App = () => {
  const [who, setWho] = useState<Viewer | null>(viewer);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void devSignIn()
      .catch(() => undefined)
      .then(() => {
        setWho(viewer());
        setReady(true);
      });
    return pb.authStore.onChange(() => setWho(viewer()));
  }, []);

  if (!ready) return <div className="splash" />;
  if (!who) return <Login onSignedIn={() => setWho(viewer())} />;
  return <Signed who={who} />;
};

const Signed = ({ who }: { who: Viewer }) => {
  const route = useRoute();
  const { state, reload } = useData(true);
  const [server, setServer] = useRemembered("finicards.server");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, ok: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, text, ok }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), ok ? 3500 : 7000);
  }, []);

  const data = state.data;
  const players = data?.players ?? [];
  const serverId = players.some((player) => player.server_id === server)
    ? server
    : (players[0]?.server_id ?? "");

  const cards = useMemo(
    () => (data?.cards ?? []).filter((card) => card.server_id === serverId),
    [data, serverId],
  );
  const decks = useMemo(
    () => (data?.decks ?? []).filter((deck) => deck.server_id === serverId),
    [data, serverId],
  );

  const onSaved = useCallback(
    async (message: string, ok: boolean) => {
      if (ok) await reload();
      toast(message, ok);
    },
    [reload, toast],
  );

  const tab = route.page === "collection" ? "collection" : "decks";

  let page;
  if (state.status === "loading") {
    page = (
      <div className="grid" aria-busy="true" aria-label="Loading your cards">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} className="card-ghost" />
        ))}
      </div>
    );
  } else if (state.status === "error" || !data) {
    page = (
      <Empty title="The collection could not be loaded">
        <button type="button" className="link" onClick={() => void reload()}>
          Try again
        </button>
      </Empty>
    );
  } else if (players.length === 0) {
    page = (
      <Empty title="No cards found for this Discord account">
        Open a pack in a server with Fini using <code>/finicard pack</code>. New cards take a few seconds to
        appear here.
      </Empty>
    );
  } else if (route.page === "collection") {
    page = <CollectionPage key={serverId} cards={cards} decks={decks} meta={data.meta} />;
  } else if (route.page === "decks") {
    page = <DecksPage cards={cards} decks={decks} meta={data.meta} />;
  } else {
    const deck = route.id === "new" ? null : decks.find((item) => item.id === route.id);
    page =
      deck === undefined ? (
        <Empty title="That deck is not here">
          <button type="button" className="link" onClick={() => go("/decks")}>
            Back to decks
          </button>
        </Empty>
      ) : (
        <DeckEditor
          key={`${serverId}:${route.id}`}
          deck={deck}
          cards={cards}
          decks={decks}
          meta={data.meta}
          serverId={serverId}
          onSaved={onSaved}
        />
      );
  }

  return (
    <div className="shell">
      <header className="nav">
        <a className="brand" href="#/collection">
          <span className="brand-mark" aria-hidden="true" />
          Finicards
        </a>
        <nav aria-label="Sections">
          <a href="#/collection" data-active={tab === "collection"}>
            Collection
          </a>
          <a href="#/decks" data-active={tab === "decks"}>
            Decks
          </a>
        </nav>
        <div className="nav-end">
          {players.length > 1 && (
            <label className="select">
              <span>Server</span>
              <select
                value={serverId}
                onChange={(event) => {
                  setServer(event.target.value);
                  if (route.page === "deck") go("/decks");
                }}
              >
                {players.map((player) => (
                  <option key={player.server_id} value={player.server_id}>
                    {player.server_name || player.server_id}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="me">
            {who.avatar ? <img src={who.avatar} alt="" /> : <span>{who.name.slice(0, 1).toUpperCase()}</span>}
            <b>{who.name}</b>
            <button type="button" className="link" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="page">{page}</main>

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className="toast" data-ok={item.ok}>
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
};
