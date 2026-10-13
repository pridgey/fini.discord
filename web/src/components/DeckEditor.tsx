import { useEffect, useMemo, useState } from "react";
import {
  applyFilters,
  autoFill,
  compositionOf,
  deckProblem,
  leadStat,
  NO_FILTERS,
  rarityCode,
  setProgress,
  tierOf,
  TIERS,
  type Filters,
} from "../lib/cards";
import { artUrl } from "../lib/pb";
import { ask, go } from "../lib/store";
import { TYPES, type Card, type Deck, type Meta } from "../lib/types";
import { MixBar, TypeIcon } from "./bits";
import { CardView } from "./CardView";
import { FilterBar } from "./FilterBar";

type Props = {
  /** The deck being edited, or null for a new one. */
  deck: Deck | null;
  cards: Card[];
  decks: Deck[];
  meta: Meta;
  serverId: string;
  onSaved: (message: string, ok: boolean) => Promise<void>;
};

export const DeckEditor = ({ deck, cards, decks, meta, serverId, onSaved }: Props) => {
  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  // Copies sold or traded since the deck was built are dropped on the way in.
  const original = useMemo(
    () => (deck?.cards ?? []).filter((id) => byId.has(id)),
    [deck, byId],
  );

  const [name, setName] = useState(deck?.name ?? "");
  const [chosen, setChosen] = useState<string[]>(original);
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, sort: "strongest" });
  const [busy, setBusy] = useState<"" | "save" | "delete">("");
  const [confirming, setConfirming] = useState(false);

  const picked = useMemo(() => new Set(chosen), [chosen]);
  const inDeck = useMemo(() => chosen.flatMap((id) => byId.get(id) ?? []), [chosen, byId]);
  const shown = useMemo(() => applyFilters(cards, filters, meta), [cards, filters, meta]);
  const sets = useMemo(() => setProgress(cards).map((entry) => entry.set), [cards]);
  const held = useMemo(() => {
    const tiers = new Set(cards.map(tierOf));
    return TIERS.filter((tier) => tiers.has(tier));
  }, [cards]);

  const { limits } = meta;
  const dirty =
    name.trim() !== (deck?.name ?? "") ||
    chosen.length !== original.length ||
    chosen.some((id, index) => id !== original[index]);
  const problem = deckProblem(
    name,
    chosen.length,
    limits,
    decks.filter((other) => other.id !== deck?.id).map((other) => other.name),
  );
  const full = chosen.length >= limits.deckSize;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : current.length >= limits.deckSize
          ? current
          : [...current, id],
    );

  const leave = () => {
    if (dirty && !window.confirm("Leave without saving this deck?")) return;
    go("/decks");
  };

  const save = async () => {
    if (problem || busy) return;
    setBusy("save");
    const result = await ask(serverId, {
      kind: "deck_save",
      payload: { deckId: deck?.id, name: name.trim(), cards: chosen },
    });
    await onSaved(result.message, result.ok);
    setBusy("");
    if (result.ok) go("/decks");
  };

  const remove = async () => {
    if (!deck || busy) return;
    setBusy("delete");
    const result = await ask(serverId, { kind: "deck_delete", payload: { deckId: deck.id } });
    await onSaved(result.message, result.ok);
    setBusy("");
    if (result.ok) go("/decks");
  };

  const sorted = [...inDeck].sort(
    (a, b) =>
      TYPES.indexOf(a.def.card_type) - TYPES.indexOf(b.def.card_type) ||
      leadStat(b) - leadStat(a) ||
      a.def.card_name.localeCompare(b.def.card_name),
  );
  const fraction = Math.min(chosen.length / limits.deckSize, 1);

  return (
    <div className="editor">
      <section className="editor-pool">
        <header className="page-head">
          <div>
            <button type="button" className="link back" onClick={leave}>
              ← Decks
            </button>
            <h1>{deck ? "Edit deck" : "New deck"}</h1>
            <p>Click a card to add it, and again to take it out.</p>
          </div>
        </header>
        <FilterBar
          compact
          filters={filters}
          onChange={setFilters}
          sets={sets}
          tiers={held}
          shown={shown.length}
          total={cards.length}
        />
        <div className="grid grid-build">
          {shown.map((card) => (
            <CardView
              key={card.id}
              card={card}
              meta={meta}
              drawn
              detail
              selected={picked.has(card.id)}
              dimmed={full && !picked.has(card.id)}
              onClick={() => toggle(card.id)}
              label={`${picked.has(card.id) ? "Remove" : "Add"} ${card.def.card_name}`}
            />
          ))}
        </div>
      </section>

      <aside className="editor-deck">
        <label className="field">
          <span>Deck name</span>
          <input
            type="text"
            value={name}
            maxLength={limits.maxDeckName}
            placeholder="Name this deck"
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div className="meter" data-ok={chosen.length === limits.deckSize}>
          <div className="meter-head">
            <b>{chosen.length}</b>
            <span>
              of {limits.deckSize} cards
            </span>
          </div>
          <div className="meter-track">
            <i style={{ width: `${fraction * 100}%` }} />
          </div>
        </div>

        <MixBar mix={compositionOf(inDeck)} />

        <div className="editor-tools">
          <button
            type="button"
            className="button"
            disabled={chosen.length >= limits.deckSize || cards.length <= chosen.length}
            onClick={() => setChosen(autoFill(chosen, shown, limits.deckSize))}
            title="Adds the strongest cards that match the filters"
          >
            Fill to {limits.deckSize}
          </button>
          <button type="button" className="button" disabled={chosen.length === 0} onClick={() => setChosen([])}>
            Clear
          </button>
        </div>

        <ol className="deck-list">
          {sorted.map((card) => (
            <li key={card.id} data-type={card.def.card_type}>
              <span className="deck-thumb">
                {artUrl(card.def) && (
                  <img
                    src={artUrl(card.def)}
                    alt=""
                    loading="lazy"
                    style={{ objectPosition: `${card.def.focus_x * 100}% ${card.def.focus_y * 100}%` }}
                  />
                )}
              </span>
              <span className="deck-row-name">
                <span>{card.def.card_name}</span>
                <small>
                  {rarityCode(card, meta)}
                  {card.keyword ? ` · ${meta.keywords[card.keyword]?.name ?? card.keyword}` : ""}
                </small>
              </span>
              <span className="deck-row-stat">
                <TypeIcon type={card.def.card_type} size={12} />
                {leadStat(card)}
              </span>
              <button type="button" aria-label={`Remove ${card.def.card_name}`} onClick={() => toggle(card.id)}>
                ✕
              </button>
            </li>
          ))}
          {sorted.length === 0 && <li className="deck-list-none">No cards yet. Pick some from the left.</li>}
        </ol>

        <div className="editor-actions">
          {problem && dirty && <p className="hint">{problem}</p>}
          <button type="button" className="button primary" disabled={!!problem || !dirty || !!busy} onClick={save}>
            {busy === "save" ? "Asking Fini…" : deck ? "Save changes" : "Save deck"}
          </button>
          {deck &&
            (confirming ? (
              <div className="confirm">
                <span>Delete {deck.name}?</span>
                <button type="button" className="button danger" disabled={!!busy} onClick={remove}>
                  {busy === "delete" ? "Deleting…" : "Delete"}
                </button>
                <button type="button" className="button" disabled={!!busy} onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </div>
            ) : (
              <button type="button" className="link danger" onClick={() => setConfirming(true)}>
                Delete this deck
              </button>
            ))}
        </div>
      </aside>
    </div>
  );
};
