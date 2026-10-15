import type { ReactNode } from "react";
import {
  filtersActive,
  NO_FILTERS,
  SORT_LABEL,
  TIER_LABEL,
  TIERS,
  TYPE_LABEL,
  type Filters,
  type SortKey,
  type Tier,
} from "../lib/cards";
import { TYPES, type CardType } from "../lib/types";
import { Chip, TypeIcon } from "./bits";

type Props = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** Sets and tiers the player holds, so no chip leads nowhere. */
  sets: number[];
  tiers: Tier[];
  shown: number;
  total: number;
  compact?: boolean;
  /** Extra chips, shown after the built-in ones. */
  extra?: ReactNode;
};

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export const FilterBar = ({ filters, onChange, sets, tiers, shown, total, compact, extra }: Props) => {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div className="filters" data-compact={compact}>
      <div className="filters-row">
        <label className="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            placeholder="Search name, series, tag or ability"
            aria-label="Search cards"
            value={filters.search}
            onChange={(event) => set({ search: event.target.value })}
          />
        </label>
        <label className="select">
          <span>Sort</span>
          <select value={filters.sort} onChange={(event) => set({ sort: event.target.value as SortKey })}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
        {sets.length > 1 && (
          <label className="select">
            <span>Set</span>
            <select value={filters.set} onChange={(event) => set({ set: Number(event.target.value) })}>
              <option value={0}>All</option>
              {sets.map((number) => (
                <option key={number} value={number}>
                  Set {number}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="filters-row filters-chips">
        <div className="chip-group" role="group" aria-label="Type">
          {TYPES.map((type: CardType) => (
            <Chip
              key={type}
              type={type}
              active={filters.types.includes(type)}
              onClick={() => set({ types: toggle(filters.types, type) })}
            >
              <TypeIcon type={type} size={13} />
              {TYPE_LABEL[type]}
            </Chip>
          ))}
        </div>
        <div className="chip-group" role="group" aria-label="Rarity">
          {TIERS.filter((tier) => tiers.includes(tier)).map((tier) => (
            <Chip
              key={tier}
              active={filters.tiers.includes(tier)}
              onClick={() => set({ tiers: toggle(filters.tiers, tier) })}
            >
              {TIER_LABEL[tier]}
            </Chip>
          ))}
        </div>
        <div className="chip-group" role="group" aria-label="More">
          <Chip active={filters.foil} onClick={() => set({ foil: !filters.foil })}>
            ✦ Foil
          </Chip>
          <Chip active={filters.keyword} onClick={() => set({ keyword: !filters.keyword })}>
            Has ability
          </Chip>
        </div>
        {extra && <div className="chip-group">{extra}</div>}
        <div className="filters-count">
          {filtersActive(filters) ? (
            <>
              <b>{shown}</b> of {total}
              <button type="button" className="link" onClick={() => onChange({ ...NO_FILTERS, sort: filters.sort })}>
                Clear
              </button>
            </>
          ) : (
            <>
              <b>{total}</b> cards
            </>
          )}
        </div>
      </div>
    </div>
  );
};
