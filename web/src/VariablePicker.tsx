import { useMemo, useState } from "react";

export type VariablePickerItem = {
  variable: string;
  score?: number;
  detail?: string;
  disabled?: boolean;
};

type Props = {
  items: VariablePickerItem[];
  selected?: string[];
  multiple?: boolean;
  maximumSelections?: number;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onSelect: (variable: string) => void;
};

export function VariablePicker({ items, selected = [], multiple = false, maximumSelections, searchPlaceholder = "Search variables…", emptyMessage = "No variables match your search.", onSelect }: Props) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? items.filter((item) => item.variable.toLocaleLowerCase().includes(normalized)) : items;
  }, [items, query]);
  const maximumScore = Math.max(0, ...items.map((item) => item.score ?? 0));
  const hasScores = items.some((item) => item.score !== undefined);

  return (
    <div className="variable-picker">
      <label className="variable-search">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear variable search">×</button>}
      </label>
      <div className={`split-variable-list${hasScores ? "" : " split-variable-list--plain"}`}>
        {visible.map((item) => {
          const checked = selected.includes(item.variable);
          const atLimit = multiple && maximumSelections !== undefined && selected.length >= maximumSelections && !checked;
          return (
            <button className={checked ? "split-variable--selected" : ""} type="button" key={item.variable} disabled={item.disabled || atLimit} onClick={() => onSelect(item.variable)}>
              <span className="split-variable-rank">{multiple ? checked ? "✓" : "+" : String(items.indexOf(item) + 1).padStart(2, "0")}</span>
              <span className="split-variable-name"><strong>{item.variable}</strong><small>{item.detail ?? "Available"}</small></span>
              {hasScores && <span className="split-variable-score">
                <i style={{ width: `${item.score === undefined || maximumScore <= 0 ? 0 : Math.max(4, item.score / maximumScore * 100)}%` }} />
                <b>{item.score === undefined ? "—" : item.score.toFixed(3)}</b>
              </span>}
            </button>
          );
        })}
        {!visible.length && <div className="mini-empty">{emptyMessage}</div>}
      </div>
    </div>
  );
}
