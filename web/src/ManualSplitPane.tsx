import { useEffect, useMemo, useState } from "react";

import { searchCategoryValues, type CategoryValue } from "./category-search";
import { parseLocalizedNumber, type ParsedDataset } from "./dataset";
import { describeTreeSplit, type ManualSplitResult, type TreeNode } from "./domain";
import type { SplitApplication } from "./split-operations";
import { requestManualSplit } from "./manual-splits";
import { isNumericVariable } from "./tree-settings";

type Props = {
  dataset: ParsedDataset;
  node: TreeNode;
  feature: string;
  onBack: () => void;
  onApply: (split: ManualSplitResult, mode: SplitApplication) => void;
  onRemoveSplit: () => void;
};

export function ManualSplitPane({ dataset, node, feature, onBack, onApply, onRemoveSplit }: Props) {
  const existingManual = node.split?.kind === "manual" && node.split.feature === feature ? node.split : undefined;
  const [cutpoints, setCutpoints] = useState(existingManual && !existingManual.forceCategorical ? existingManual.values.join(dataset.numberFormats?.[feature] === "comma" ? "; " : ", ") : "");
  const [categories, setCategories] = useState<CategoryValue[]>(existingManual?.forceCategorical ? existingManual.values : []);
  const [includeOther, setIncludeOther] = useState(existingManual?.includeOther ?? true);
  const [missingDestination, setMissingDestination] = useState<number | "other" | "exclude">(existingManual?.missingDestination ?? (existingManual?.includeOther === false ? "exclude" : "other"));
  const [treatAsCategories, setTreatAsCategories] = useState(existingManual?.forceCategorical ?? false);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryStatus, setCategoryStatus] = useState<"idle" | "loading">("idle");
  const [availableCategories, setAvailableCategories] = useState<CategoryValue[]>([]);
  const [error, setError] = useState("");
  const inferredNumeric = feature ? isNumericVariable(dataset, feature, node.rowIndices) : false;
  const numeric = inferredNumeric && !treatAsCategories;
  const numericCutpoints = useMemo(() => {
    const commaDecimals = dataset.numberFormats?.[feature] === "comma";
    return [...new Set(cutpoints.split(commaDecimals ? /[;\n]+/ : /[,;\n]+/).map((value) => parseLocalizedNumber(value.trim(), dataset.numberFormats?.[feature])).filter((value): value is number => value !== null))].sort((left, right) => left - right);
  }, [cutpoints, dataset.numberFormats, feature]);
  const missingBranches = numeric
    ? numericCutpoints.map((value, index) => index === 0 ? `≤ ${value}` : `${numericCutpoints[index - 1]} to ${value}`).concat(numericCutpoints.length ? [`> ${numericCutpoints.at(-1)}`] : [])
    : categories.map(String);

  useEffect(() => {
    if (typeof missingDestination === "number" && missingDestination >= missingBranches.length) setMissingDestination("other");
  }, [missingBranches.length, missingDestination]);

  useEffect(() => {
    if (!feature || numeric) { setAvailableCategories([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCategoryStatus("loading");
      searchCategoryValues(dataset, feature, node.rowIndices, categoryQuery, 50, controller.signal)
        .then(setAvailableCategories)
        .catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Category search failed."); })
        .finally(() => { if (!controller.signal.aborted) setCategoryStatus("idle"); });
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [dataset, feature, node.rowIndices, numeric, categoryQuery]);

  function toggleCategory(value: CategoryValue) {
    const key = `${typeof value}:${String(value)}`;
    setCategories((current) => current.some((item) => `${typeof item}:${String(item)}` === key)
      ? current.filter((item) => `${typeof item}:${String(item)}` !== key)
      : [...current, value]);
  }

  async function handleApply() {
    const commaDecimals = dataset.numberFormats?.[feature] === "comma";
    const values = numeric
      ? cutpoints
        .split(commaDecimals ? /[;\n]+/ : /[,;\n]+/)
        .map((value) => parseLocalizedNumber(value.trim(), dataset.numberFormats?.[feature]))
        .filter((value): value is number => value !== null)
      : categories;
    if (values.length === 0) {
      setError(numeric ? "Enter at least one numeric cut point." : "Choose at least one category.");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const result = await requestManualSplit(
        dataset,
        node.rowIndices ?? [],
        feature,
        values,
        !numeric,
        includeOther,
        missingDestination,
      );
      onApply(result, "replace");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The manual split could not be applied.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="manual-pane">
      <button className="split-back-button" type="button" onClick={onBack}>← All variables</button>
      {node.split && (
        <div className="current-split-card">
          <span>Current split</span>
          <strong>{describeTreeSplit(node.split)}</strong>
          <button type="button" onClick={onRemoveSplit}>Remove split and descendants</button>
        </div>
      )}
      <div className="split-detail-heading">
        <span>Manual split</span>
        <h3>{feature}</h3>
        <p>Choose the exact groups or thresholds for this variable.</p>
      </div>

      {inferredNumeric && (
        <label className="toggle-row compact-toggle">
          <input type="checkbox" checked={treatAsCategories} onChange={(event) => setTreatAsCategories(event.target.checked)} />
          <span>Treat numeric values as categories</span>
        </label>
      )}

      {numeric ? (
        <div className="manual-control">
          <label className="field-label" htmlFor="manual-cutpoints">Cut points</label>
          <input
            id="manual-cutpoints"
            className="text-input"
            value={cutpoints}
            onChange={(event) => setCutpoints(event.target.value)}
            placeholder={dataset.numberFormats?.[feature] === "comma" ? "Example: 25,5; 40; 65" : "Example: 25, 40, 65"}
          />
          <p>Each cut point adds another child branch. Use semicolons between comma-decimal values.</p>
        </div>
      ) : (
        <div className="manual-control">
          <span className="field-label">Categories as separate branches</span>
          <label className="variable-search category-search">
            <span aria-hidden="true">⌕</span>
            <input value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Search all category values…" aria-label="Search all category values" />
            {categoryStatus === "loading" && <small>Searching…</small>}
            {categoryQuery && <button type="button" onClick={() => setCategoryQuery("")} aria-label="Clear category search">×</button>}
          </label>
          <div className="category-list">
            {availableCategories.map((value) => (
              <label className="category-option" key={`${typeof value}:${String(value)}`}>
                <input
                  type="checkbox"
                  checked={categories.some((item) => `${typeof item}:${String(item)}` === `${typeof value}:${String(value)}`)}
                  onChange={() => toggleCategory(value)}
                />
                <span>{String(value)}</span>
              </label>
            ))}
          </div>
          <p>Showing up to 50 matches. Search scans all values in this node without blocking the tree.</p>
        </div>
      )}

      {!numeric && <label className="toggle-row">
        <input type="checkbox" checked={includeOther} onChange={(event) => setIncludeOther(event.target.checked)} />
        <span>Include unmatched values as Other</span>
      </label>}
      <label className="manual-missing-control">
        <span><strong>Treat missing values as</strong><small>The selected branch label will identify when missing rows are included.</small></span>
        <select value={typeof missingDestination === "number" ? `branch:${missingDestination}` : missingDestination} onChange={(event) => setMissingDestination(event.target.value.startsWith("branch:") ? Number(event.target.value.slice(7)) : event.target.value as "other" | "exclude")}>
          <option value="other">Separate missing branch</option>
          <option value="exclude">Exclude from this split</option>
          {missingBranches.map((label, index) => <option value={`branch:${index}`} key={`${label}-${index}`}>{label}</option>)}
        </select>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="button" onClick={handleApply} disabled={status === "loading" || !feature}>
        {status === "loading" ? "Applying split…" : node.children.length ? "Replace current split" : "Apply manual split"}
        <span aria-hidden="true">→</span>
      </button>
      {node.children.length > 0 && (
        <><button className="secondary-button split-insert-button" type="button" disabled={status === "loading" || !feature} onClick={async () => {
          const commaDecimals = dataset.numberFormats?.[feature] === "comma";
          const values = numeric
            ? cutpoints.split(commaDecimals ? /[;\n]+/ : /[,;\n]+/).map((value) => parseLocalizedNumber(value.trim(), dataset.numberFormats?.[feature])).filter((value): value is number => value !== null)
            : categories;
          if (!values.length) {
            setError(numeric ? "Enter at least one numeric cut point." : "Choose at least one category.");
            return;
          }
          setStatus("loading");
          setError("");
          try {
            const result = await requestManualSplit(dataset, node.rowIndices ?? [], feature, values, !numeric, includeOther, missingDestination);
            onApply(result, "insert");
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "The manual split could not be applied.");
          } finally {
            setStatus("idle");
          }
        }}>Insert above current split</button><p className="split-action-note">Reapplies the current subtree inside each new child wherever the data supports it.</p></>
      )}
    </div>
  );
}
