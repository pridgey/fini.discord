import type { ReactNode } from "react";
import { TYPE_ICON, TYPE_LABEL, type Composition } from "../lib/cards";
import { TYPES, type CardType } from "../lib/types";

export const TypeIcon = ({ type, size = 14 }: { type: CardType; size?: number }) => (
  <svg
    className="type-icon"
    width={size}
    height={size}
    viewBox="0 0 10 10"
    fill={type === "heart" ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={type === "heart" ? 0 : 1}
    strokeLinejoin="round"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d={TYPE_ICON[type]} />
  </svg>
);

/** A bar split by type, with the counts beside it. */
export const MixBar = ({ mix, showCounts = true }: { mix: Composition; showCounts?: boolean }) => {
  const total = TYPES.reduce((sum, type) => sum + mix[type], 0);
  return (
    <div className="mix">
      <div className="mix-bar" role="img" aria-label={TYPES.map((t) => `${mix[t]} ${TYPE_LABEL[t]}`).join(", ")}>
        {total === 0 ? (
          <span className="mix-empty" />
        ) : (
          TYPES.filter((type) => mix[type] > 0).map((type) => (
            <span key={type} data-type={type} style={{ flexGrow: mix[type] }} />
          ))
        )}
      </div>
      {showCounts && (
        <div className="mix-counts">
          {TYPES.map((type) => (
            <span key={type} data-type={type} title={TYPE_LABEL[type]}>
              <TypeIcon type={type} size={12} />
              {mix[type]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export const Chip = ({
  active,
  onClick,
  children,
  type,
  title,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  type?: CardType;
  title?: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    className="chip"
    disabled={disabled}
    data-active={active}
    data-type={type}
    aria-pressed={active}
    title={title}
    onClick={onClick}
  >
    {children}
  </button>
);

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="empty">
    <div className="empty-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
    <h3>{title}</h3>
    {children && <p>{children}</p>}
  </div>
);
