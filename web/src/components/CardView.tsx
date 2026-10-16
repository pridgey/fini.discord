import { memo, useRef, type PointerEvent } from "react";
import { leadStat, rarityCode, STAT_SHORT, tierOf } from "../lib/cards";
import { animationUrl, artUrl, faceUrl } from "../lib/pb";
import { TYPES, type Card, type Meta } from "../lib/types";
import { TypeIcon } from "./bits";

type Props = {
  card: Card;
  meta: Meta;
  /** "full" is the collection's card; "mini" the deck builder's. */
  size?: "full" | "mini" | "hero";
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  label?: string;
  /** Draw the card from its facts even when its real face is to hand. */
  drawn?: boolean;
  /** The deck builder's card: no series line, and what its keyword does spelled out. */
  detail?: boolean;
  /** Play a Legendary's animation in place of its still. */
  animated?: boolean;
};

/**
 * A card, drawn for the web: the same facts as the printed card - type, stats,
 * keyword, rarity code - laid over its artwork. It leans toward the pointer,
 * and a foil catches the light as it does.
 */
export const CardView = memo(function CardView({
  card,
  meta,
  size = "full",
  selected,
  dimmed,
  onClick,
  label,
  drawn,
  detail,
  animated,
}: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const tier = tierOf(card);
  const face = drawn ? "" : (animated && animationUrl(card)) || faceUrl(card);
  const about = card.keyword ? (meta.keywords[card.keyword]?.description ?? "") : "";
  const art = artUrl(card.def);
  const keyword = card.keyword ? (meta.keywords[card.keyword]?.name ?? card.keyword.replace(/_/g, " ")) : "";

  const lean = (event: PointerEvent) => {
    const node = ref.current;
    // A finger in the grid is scrolling. On the big card it is the pointer.
    if (!node || (event.pointerType === "touch" && size !== "hero")) return;
    node.dataset.active = "true";
    const box = node.getBoundingClientRect();
    // A finger keeps driving the card after it slides off the edge (touch
    // pointers stay with the element they started on). Held to the card, the
    // light and tilt stop at its edge rather than running the foil's gradient
    // past its end and showing where it stops.
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const x = clamp((event.clientX - box.left) / box.width);
    const y = clamp((event.clientY - box.top) / box.height);
    node.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    node.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    node.style.setProperty("--rx", `${((0.5 - y) * 14).toFixed(2)}deg`);
    node.style.setProperty("--ry", `${((x - 0.5) * 14).toFixed(2)}deg`);
  };
  const settle = () => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--rx", "0deg");
    node.style.setProperty("--ry", "0deg");
    delete node.dataset.active;
  };

  return (
    <button
      ref={ref}
      type="button"
      className="card"
      data-size={size}
      data-type={card.def.card_type}
      data-tier={tier}
      data-foil={card.foil}
      data-selected={selected}
      data-dimmed={dimmed}
      aria-pressed={selected}
      aria-label={label ?? `${card.def.card_name}, ${STAT_SHORT[card.def.card_type]} ${leadStat(card)}`}
      data-face={!!face}
      data-detail={!!detail}
      title={!face && !detail && about ? `${keyword}: ${about}` : undefined}
      onClick={onClick}
      onPointerDown={lean}
      onPointerMove={lean}
      onPointerLeave={settle}
      onPointerUp={(event) => event.pointerType === "touch" && settle()}
      onPointerCancel={settle}
    >
      {face ? (
        // The real card, as Fini renders it for Discord.
        <span className="card-face">
          <img className="card-img" src={face} alt="" loading="lazy" decoding="async" />
          {card.foil && <span className="card-holo" />}
          {tier === "legendary" && <span className="card-aura" />}
          <span className="card-glare" />
          {size === "full" && (card.foil || tier === "secret_art" || tier === "legendary") && (
            // At grid size the printed code is too small to pick out.
            <span className="card-badges">
              {tier === "legendary" && <span data-badge="legendary">Legendary</span>}
              {tier === "secret_art" && <span data-badge="secret_art">Secret Art</span>}
              {card.foil && <span data-badge="foil">✦ Foil</span>}
            </span>
          )}
          {selected && (
            <span className="card-check" aria-hidden="true">
              ✓
            </span>
          )}
        </span>
      ) : (
      <span className="card-face">
        {art ? (
          <img
            className="card-art"
            src={art}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ objectPosition: `${card.def.focus_x * 100}% ${card.def.focus_y * 100}%` }}
          />
        ) : (
          <span className="card-art card-art-none" />
        )}
        <span className="card-scrim" />
        {card.foil && <span className="card-holo" />}
        {tier === "legendary" && <span className="card-aura" />}
        <span className="card-glare" />

        <span className="card-top">
          <span className="card-lead">
            <TypeIcon type={card.def.card_type} />
            <b>{leadStat(card)}</b>
          </span>
          <span className="card-code">
            {card.foil && <i aria-hidden="true">✦</i>}
            {rarityCode(card, meta)}
          </span>
        </span>

        <span className="card-bottom">
          <span className="card-name">{card.def.card_name}</span>
          {size !== "mini" && !detail && <span className="card-series">{card.def.series}</span>}
          {size !== "mini" && (
            <span className="card-stats">
              {TYPES.map((type) => (
                <span key={type} data-type={type} data-lead={type === card.def.card_type}>
                  <TypeIcon type={type} />
                  {card.def[type]}
                </span>
              ))}
            </span>
          )}
          {size !== "mini" && keyword && <span className="card-keyword">{keyword}</span>}
          {detail && about && <span className="card-about">{about}</span>}
        </span>
        {selected && (
          <span className="card-check" aria-hidden="true">
            ✓
          </span>
        )}
      </span>
      )}
    </button>
  );
});
