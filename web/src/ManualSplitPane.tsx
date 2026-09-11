import { useEffect, useMemo, useState } from "react";

import { searchCategoryValues, type CategoryValue } from "./category-search";
import { parseLocalizedNumber, type ParsedDataset } from "./dataset";
import { columnPosition, isMissing } from "./data-engine";
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

function categoryKey(value: CategoryValue): string {
  return `${typeof value}:${String(value)}`;
}

export function ManualSplitPane({ dataset, node, feature, onBack, onApply, onRemoveSplit }: Props) {
  const existingManual = node.split?.kind === "manual" && node.split.feature === feature ? node.split : undefined;
  const inferredNumeric = feature ? isNumericVariable(dataset, feature, node.rowIndices) : false;
  const [cutpoints, setCutpoints] = useState(existingManual && !existingManual.forceCategorical ? existingManual.values.join(dataset.numberFormats?.[feature] === "comma" ? "; " : ", ") : "");
  const [categories, setCategories] = useState<CategoryValue[]>(existingManual?.forceCategorical ? existingManual.values : []);
  const [includeOther, setIncludeOther] = useState(existingManual?.includeOther ?? true);
  const existingMissingValue = existingManual?.missingValue ?? (!inferredNumeric && typeof existingManual?.missingDestination === "number" ? existingManual.values[existingManual.missingDestination] : undefined);
  const [missingNumericValue, setMissingNumericValue] = useState(existingMissingValue === undefined ? "" : String(existingMissingValue));
  const [missingCategoryKey, setMissingCategoryKey] = useState(existingMissingValue !== undefined ? categoryKey(existingMissingValue) : "__other");
  const [treatAsCategories, setTreatAsCategories] = useState(existingManual?.forceCategorical ?? false);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryStatus, setCategoryStatus] = useState<"idle" | "loading">("idle");
  const [availableCategories, setAvailableCategories] = useState<CategoryValue[]>([]);
  const [error, setError] = useState("");
  const numeric = inferredNumeric && !treatAsCategories;
  const numericCutpoints = useMemo(() => {
    const commaDecimals = dataset.numberFormats?.[feature] === "comma";
    return [...new Set(cutpoints.split(commaDecimals ? /[;\n]+/ : /[,;\n]+/).map((value) => parseLocalizedNumber(value.trim(), dataset.numberFormats?.[feature])).filter((value): value is number => value !== null))].sort((left, right) => left - right);
  }, [cutpoints, dataset.numberFormats, feature]);
  const missingCount = useMemo(() => {
    if (!feature) return 0;
    const position = columnPosition(dataset, feature);
    return (node.rowIndices ?? []).reduce((count, rowIndex) => count + (isMissing(dataset.rows[rowIndex]?.[position]) ? 1 : 0), 0);
  }, [dataset, feature, node.rowIndices]);

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
    const key = categoryKey(value);
    setCategories((current) => current.some((item) => categoryKey(item) === key)
      ? current.filter((item) => categoryKey(item) !== key)
      : [...current, value]);
  }

  async function apply(application: SplitApplication) {
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

    let missingDestination: number | "other" | "exclude" = "exclude";
    let missingValue: CategoryValue | undefined;
    if (missingCount > 0 && numeric) {
      const parsed = parseLocalizedNumber(missingNumericValue.trim(), dataset.numberFormats?.[feature]);
      if (parsed === null) { setError("Enter a valid number to use for missing values."); return; }
      missingValue = parsed;
    } else if (missingCount > 0) {
      if (missingCategoryKey === "__other" && includeOther) missingDestination = "other";
      else {
        missingValue = categories.find((value) => categoryKey(value) === missingCategoryKey);
        if (missingValue === undefined) { setError("Choose one of the selected categories for missing values."); return; }
        missingDestination = categories.findIndex((value) => categoryKey(value) === missingCategoryKey);
      }
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
        missingValue,
      );
      onApply(result, application);
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
                  checked={categories.some((item) => categoryKey(item) === categoryKey(value))}
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
      {missingCount > 0 && <div className="manual-control missing-value-control">
        <label className="field-label" htmlFor="manual-missing-value">Treat {missingCount.toLocaleString()} missing {missingCount === 1 ? "value" : "values"} as</label>
        {numeric ? (
          <input id="manual-missing-value" className="text-input" inputMode="decimal" value={missingNumericValue} onChange={(event) => setMissingNumericValue(event.target.value)} placeholder="Enter a number" />
        ) : (
          <select id="manual-missing-value" value={missingCategoryKey} onChange={(event) => setMissingCategoryKey(event.target.value)}>
            {includeOther && <option value="__other">Other / unmatched values</option>}
            {categories.map((value) => <option value={categoryKey(value)} key={categoryKey(value)}>{String(value)}</option>)}
          </select>
        )}
        <p>Missing rows will follow the same branch as this value, and the branch label will identify the treatment.</p>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="button" onClick={() => apply("replace")} disabled={status === "loading" || !feature}>
        {status === "loading" ? "Applying split…" : node.children.length ? "Replace current split" : "Apply manual split"}
        <span aria-hidden="true">→</span>
      </button>
      {node.children.length > 0 && (
        <><button className="secondary-button split-insert-button" type="button" disabled={status === "loading" || !feature} onClick={() => apply("insert")}>Insert above current split</button><p className="split-action-note">Reapplies the current subtree inside each new child wherever the data supports it.</p></>
      )}
    </div>
  );
}
