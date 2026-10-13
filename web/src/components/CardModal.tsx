import { useEffect } from "react";
import {
  keywordOf,
  legendaryTier,
  limitedLabel,
  setLabel,
  TIER_LABEL,
  tierOf,
  TYPE_LABEL,
} from "../lib/cards";
import { TYPES, type Card, type Deck, type Meta } from "../lib/types";
import { TypeIcon } from "./bits";
import { CardView } from "./CardView";

const SOURCE: Record<string, string> = {
  pack: "a pack",
  convert: "your v1 collection",
  grant: "a gift from Fini",
  trade: "a trade",
  dungeon: "a dungeon run",
  purchase: "another player",
};

const date = (stamp: string): string => {
  const parsed = new Date(stamp.replace(" ", "T"));
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export const CardModal = ({
  card,
  copies = [],
  meta,
  decks,
  onPick,
  onClose,
}: {
  card: Card;
  /** Every copy in the pile the card was opened from, this one included. */
  copies?: Card[];
  meta: Meta;
  decks: Deck[];
  /** Called to show another copy from the pile. */
  onPick?: (card: Card) => void;
  onClose: () => void;
}) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const tier = tierOf(card);
  const keyword = keywordOf(card, meta);
  const effect = card.legendary ? meta.legendary[card.legendary] : null;
  const inDecks = decks.filter((deck) => (deck.cards ?? []).includes(card.id));
  const limited = limitedLabel(card);
  const obtained = date(card.acquired);
  const ceiling = Math.max(meta.rules.statTotal - 3, 1);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={card.def.card_name} onClick={onClose}>
      <div className="modal-body" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <div className="modal-card">
          <CardView card={card} meta={meta} size="hero" animated />
        </div>

        <div className="modal-info">
          <p className="eyebrow" data-type={card.def.card_type}>
            <TypeIcon type={card.def.card_type} size={13} />
            {TYPE_LABEL[card.def.card_type]}
          </p>
          <h2>{card.def.card_name}</h2>
          <p className="modal-series">{card.def.series}</p>

          <div className="tags">
            <span className="tag" data-tier={tier}>
              {tier === "legendary" ? `Legendary · Tier ${legendaryTier(card, meta)}` : TIER_LABEL[tier]}
            </span>
            {card.foil && <span className="tag" data-tier="foil">✦ Foil</span>}
            {setLabel(card) && <span className="tag">{setLabel(card)}</span>}
            {limited && <span className="tag">{limited}</span>}
          </div>

          <div className="statbars">
            {TYPES.map((type) => (
              <div key={type} className="statbar" data-type={type} data-lead={type === card.def.card_type}>
                <span>
                  <TypeIcon type={type} size={13} />
                  {TYPE_LABEL[type]}
                </span>
                <div className="statbar-track">
                  <i style={{ width: `${Math.min((card.def[type] / ceiling) * 100, 100)}%` }} />
                </div>
                <b>{card.def[type]}</b>
              </div>
            ))}
          </div>

          {copies.length > 1 ? (
            // A pile: every copy held, with the keyword each one rolled.
            <div className="copies">
              <h4>Your {copies.length} copies</h4>
              {copies.map((copy) => {
                const rolled = keywordOf(copy, meta);
                return (
                  <button
                    type="button"
                    key={copy.id}
                    className="copy"
                    data-active={copy.id === card.id}
                    aria-pressed={copy.id === card.id}
                    onClick={() => onPick?.(copy)}
                  >
                    <span className="copy-text">
                      <b>
                        {rolled ? rolled.name : "No keyword"}
                        {rolled?.grade && <em data-grade={rolled.grade.toLowerCase()}>{rolled.grade}</em>}
                      </b>
                      {rolled?.description && <small>{rolled.description}</small>}
                    </span>
                    {/* Only a copy that differs from the rest says how. */}
                    <span className="copy-marks">
                      {copy.legendary && <i data-mark="legendary">Legendary</i>}
                      {copy.foil && <i data-mark="foil">✦ Foil</i>}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : keyword && (
            <div className="note">
              <h4>
                {keyword.name}
                {keyword.grade && <em>{keyword.grade} keyword</em>}
              </h4>
              {keyword.description && <p>{keyword.description}</p>}
            </div>
          )}

          {effect && (
            <div className="note" data-tier="legendary">
              <h4>
                {card.legendary}
                <em>Legendary effect</em>
              </h4>
              <p>{effect.blurb.slice(0, 1).toUpperCase() + effect.blurb.slice(1)}.</p>
            </div>
          )}

          {card.def.flavour && <blockquote>{card.def.flavour}</blockquote>}

          <dl className="facts">
            {obtained && (
              <>
                <dt>Obtained</dt>
                <dd>
                  {obtained}
                  {SOURCE[card.acquired_from] ? `, from ${SOURCE[card.acquired_from]}` : ""}
                </dd>
              </>
            )}
            {card.def.artist && (
              <>
                <dt>Artist</dt>
                <dd>{card.def.artist}</dd>
              </>
            )}
            <dt>In decks</dt>
            <dd>{inDecks.length ? inDecks.map((deck) => deck.name).join(", ") : "None"}</dd>
            <dt>Copy</dt>
            <dd className="mono">{card.id}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
};
