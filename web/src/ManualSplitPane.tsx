import { useMemo, useState } from "react";

import { parseLocalizedNumber, type ParsedDataset } from "./dataset";
import { describeTreeSplit, type ManualSplitResult, type TreeNode } from "./domain";
import type { SplitApplication } from "./split-operations";
import { requestManualSplit } from "./manual-splits";
import { distinctValues, isNumericVariable } from "./tree-settings";

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
  const [categories, setCategories] = useState<string[]>(existingManual?.forceCategorical ? existingManual.values.map(String) : []);
  const [includeOther, setIncludeOther] = useState(existingManual?.includeOther ?? true);
  const [treatAsCategories, setTreatAsCategories] = useState(existingManual?.forceCategorical ?? false);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState("");
  const inferredNumeric = feature ? isNumericVariable(dataset, feature, node.rowIndices) : false;
  const numeric = inferredNumeric && !treatAsCategories;
  const availableCategories = useMemo(
    () => feature && !numeric ? distinctValues(dataset, feature, node.rowIndices).slice(0, 20) : [],
    [dataset, feature, node.rowIndices, numeric],
  );

  function toggleCategory(value: string) {
    setCategories((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  async function handleApply() {
    const commaDecimals = dataset.numberFormats?.[feature] === "comma";
    const values = numeric
      ? cutpoints
        .split(commaDecimals ? /[;\n]+/ : /[,;\n]+/)
        .map((value) => parseLocalizedNumber(value.trim(), dataset.numberFormats?.[feature]))
        .filter((value): value is number => value !== null)
      : availableCategories.filter((value) => categories.includes(String(value)));
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
          <div className="category-list">
            {availableCategories.map((value) => (
              <label className="category-option" key={String(value)}>
                <input
                  type="checkbox"
                  checked={categories.includes(String(value))}
                  onChange={() => toggleCategory(String(value))}
                />
                <span>{String(value)}</span>
              </label>
            ))}
          </div>
          {distinctValues(dataset, feature, node.rowIndices).length > 20 && (
            <p>Showing the first 20 categories. Group the rest into Other.</p>
          )}
        </div>
      )}

      <label className="toggle-row">
        <input type="checkbox" checked={includeOther} onChange={(event) => setIncludeOther(event.target.checked)} />
        <span>Include unmatched and missing values as Other</span>
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
            : availableCategories.filter((value) => categories.includes(String(value)));
          if (!values.length) {
            setError(numeric ? "Enter at least one numeric cut point." : "Choose at least one category.");
            return;
          }
          setStatus("loading");
          setError("");
          try {
            const result = await requestManualSplit(dataset, node.rowIndices ?? [], feature, values, !numeric, includeOther);
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
