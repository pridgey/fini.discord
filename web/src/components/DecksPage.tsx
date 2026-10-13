import { compositionOf } from "../lib/cards";
import { artUrl } from "../lib/pb";
import { go } from "../lib/store";
import type { Card, Deck, Meta } from "../lib/types";
import { MixBar } from "./bits";

export const DecksPage = ({ cards, decks, meta }: { cards: Card[]; decks: Deck[]; meta: Meta }) => {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const full = decks.length >= meta.limits.maxDecks;
  const enough = cards.length >= meta.limits.deckSize;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Decks</h1>
          <p>
            Every deck is {meta.limits.deckSize} cards. A battle deals five from the one you bring, a
            dungeon run six. {decks.length} of {meta.limits.maxDecks} used.
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          disabled={full || !enough}
          title={
            full
              ? "Delete a deck to make room"
              : enough
                ? undefined
                : `A deck needs ${meta.limits.deckSize} cards and you have ${cards.length}`
          }
          onClick={() => go("/decks/new")}
        >
          New deck
        </button>
      </header>

      <div className="deck-grid">
        {decks.map((deck) => {
          const held = (deck.cards ?? []).flatMap((id) => byId.get(id) ?? []);
          const missing = (deck.cards ?? []).length - held.length;
          const playable = held.length >= meta.limits.deckSize;
          const faces = [...held]
            .sort((a, b) => b.def[b.def.card_type] - a.def[a.def.card_type])
            .slice(0, 3);
          return (
            <button type="button" key={deck.id} className="deck-tile" onClick={() => go(`/decks/${deck.id}`)}>
              <span className="deck-fan" aria-hidden="true">
                {faces.map((card, index) => (
                  <span key={card.id} data-type={card.def.card_type} style={{ ["--i" as string]: index }}>
                    {artUrl(card.def) && (
                      <img
                        src={artUrl(card.def)}
                        alt=""
                        loading="lazy"
                        style={{ objectPosition: `${card.def.focus_x * 100}% ${card.def.focus_y * 100}%` }}
                      />
                    )}
                  </span>
                ))}
              </span>
              <span className="deck-tile-body">
                <b>{deck.name}</b>
                <span className="deck-tile-count" data-ok={playable}>
                  {held.length} cards
                  {!playable && ` · needs ${meta.limits.deckSize}`}
                  {missing > 0 && ` · ${missing} gone`}
                </span>
                <MixBar mix={compositionOf(held)} />
              </span>
            </button>
          );
        })}
        {decks.length === 0 && (
          <div className="deck-none">
            <h3>No decks yet</h3>
            <p>
              {enough
                ? "Build one here, or in Discord with /finicard deck."
                : `You need ${meta.limits.deckSize} cards to build a deck. You have ${cards.length}.`}
            </p>
          </div>
        )}
      </div>
    </>
  );
};
