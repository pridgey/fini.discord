import { useMemo, useState } from "react";
import {
  applyFilters,
  compositionOf,
  NO_FILTERS,
  gapsApply,
  layoutCollection,
  setProgress,
  tierOf,
  TIERS,
  type Filters,
} from "../lib/cards";
import { faceUrl } from "../lib/pb";
import { useRemembered } from "../lib/store";
import type { Card, Deck, Meta } from "../lib/types";
import { Chip, Empty, MixBar } from "./bits";
import { CardModal } from "./CardModal";
import { CardView } from "./CardView";
import { FilterBar } from "./FilterBar";

export const CollectionPage = ({ cards, decks, meta }: { cards: Card[]; decks: Deck[]; meta: Meta }) => {
  // A collection opens as a binder: every set in number order.
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, sort: "set" });
  const [open, setOpen] = useState<{ card: Card; copies: Card[] } | null>(null);
  const [gapsChoice, setGapsChoice] = useRemembered("finicards.gaps", "on");
  const [pilesChoice, setPilesChoice] = useRemembered("finicards.piles", "on");
  const gaps = gapsChoice === "on";
  const piles = pilesChoice === "on";

  const sections = useMemo(
    () => layoutCollection(cards, filters, meta, { gaps, piles }),
    [cards, filters, meta, gaps, piles],
  );
  const shown = useMemo(() => applyFilters(cards, filters, meta).length, [cards, filters, meta]);
  const progress = useMemo(() => setProgress(cards), [cards]);
  const mix = useMemo(() => compositionOf(cards), [cards]);
  const held = useMemo(() => {
    const tiers = new Set(cards.map(tierOf));
    return TIERS.filter((tier) => tiers.has(tier));
  }, [cards]);

  const foils = cards.filter((card) => card.foil).length;
  const specials = cards.filter((card) => card.legendary || card.def.secret_art).length;
  const canGap = gapsApply(filters);

  if (cards.length === 0) {
    return (
      <Empty title="No cards on this server yet">
        Open a pack in Discord with <code>/finicard pack</code> and it will show up here.
      </Empty>
    );
  }

  return (
    <>
      <section className="summary">
        <div className="stat-tile">
          <span>Cards</span>
          <b>{cards.length}</b>
          <MixBar mix={mix} />
        </div>
        <div className="stat-tile">
          <span>Foils</span>
          <b>{foils}</b>
          <small>{specials ? `${specials} Secret Art or Legendary` : "No Secret Arts or Legendaries yet"}</small>
        </div>
        <div className="stat-tile stat-sets">
          <span>Sets</span>
          <div className="sets">
            {progress.map((entry) => (
              <button
                type="button"
                key={entry.set}
                className="set"
                data-active={filters.set === entry.set}
                onClick={() => setFilters({ ...filters, set: filters.set === entry.set ? 0 : entry.set })}
                title={`Show set ${entry.set}`}
              >
                <span>
                  Set {entry.set}
                  <b>
                    {entry.owned}
                    <i>/{entry.size || "?"}</i>
                  </b>
                </span>
                <span className="set-track">
                  <i style={{ width: `${entry.size ? Math.min((entry.owned / entry.size) * 100, 100) : 0}%` }} />
                </span>
                {entry.secrets > 0 && <em>+{entry.secrets} secret</em>}
              </button>
            ))}
          </div>
        </div>
      </section>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        sets={progress.map((entry) => entry.set)}
        tiers={held}
        shown={shown}
        total={cards.length}
        extra={
          <>
            <Chip
              active={gaps && canGap}
              disabled={!canGap}
              onClick={() => setGapsChoice(gaps ? "off" : "on")}
              title={
                canGap
                  ? "Leave a blank for each card of a set you do not have"
                  : "Blanks show when sorted by set number with no other filters"
              }
            >
              Gaps
            </Chip>
            <Chip
              active={piles}
              onClick={() => setPilesChoice(piles ? "off" : "on")}
              title="Stack copies of the same card into one pile"
            >
              Piles
            </Chip>
          </>
        }
      />

      {sections.length === 0 ? (
        <Empty title="Nothing matches">Loosen the filters to see more of your collection.</Empty>
      ) : (
        sections.map((section) => (
          <section key={section.set ?? "all"} className="binder">
            {section.set !== null && (
              <h2 className="binder-head">
                {section.set ? `Set ${section.set}` : "No set"}
                {section.size > 0 && (
                  <span>
                    <b>{section.owned}</b> of {section.size}
                  </span>
                )}
              </h2>
            )}
            <div className="grid">
              {section.tiles.map((tile) =>
                tile.kind === "gap" ? (
                  <div className="slot slot-empty" key={tile.key} aria-label={`Number ${tile.number}, not collected`}>
                    <b>{tile.number}</b>
                    <span>of {tile.of}</span>
                  </div>
                ) : (
                  <div className="slot" key={tile.key} data-pile={tile.cards.length > 1}>
                    {/* Duplicates sit under the best copy, as a pile. */}
                    {tile.cards
                      .slice(1, 3)
                      .reverse()
                      .map((under, index, below) => (
                        <span
                          key={under.id}
                          className="pile-under"
                          aria-hidden="true"
                          style={{ ["--depth" as string]: below.length - index }}
                        >
                          {faceUrl(under) && <img src={faceUrl(under)} alt="" loading="lazy" />}
                        </span>
                      ))}
                    <CardView
                      card={tile.cards[0]}
                      meta={meta}
                      onClick={() => setOpen({ card: tile.cards[0], copies: tile.cards })}
                    />
                    {tile.cards.length > 1 && <span className="slot-count">×{tile.cards.length}</span>}
                  </div>
                ),
              )}
            </div>
          </section>
        ))
      )}

      {open && (
        <CardModal
          card={open.card}
          copies={open.copies}
          meta={meta}
          decks={decks}
          onPick={(card) => setOpen({ card, copies: open.copies })}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
};
