import { useState } from "react";

import type { ParsedDataset } from "./dataset";
import { materializeSplit } from "./data-engine";
import { describeTreeSplit, type TreeNode, type TreeSplitDefinition } from "./domain";
import type { PreparedSplit, SplitApplication } from "./split-operations";
import { isNumericVariable } from "./tree-settings";

type Props = {
  dataset: ParsedDataset;
  node: TreeNode;
  mode: "random" | "percentile";
  feature?: string;
  onBack: () => void;
  onApply: (split: PreparedSplit, mode: SplitApplication) => void;
  onRemoveSplit: () => void;
};

function prepared(dataset: ParsedDataset, node: TreeNode, definition: TreeSplitDefinition): PreparedSplit {
  const branches = materializeSplit(dataset, node.rowIndices ?? [], definition);
  if (branches.length < 2) throw new Error("This split needs at least two configured groups.");
  return { definition, branches: branches.map((branch) => ({ ...branch, count: branch.rowIndices.length })) };
}

export function SpecialSplitPane({ dataset, node, mode, feature = "", onBack, onApply, onRemoveSplit }: Props) {
  const existingRandom = node.split?.kind === "random" ? node.split : undefined;
  const existingPercentile = node.split?.kind === "percentile" && node.split.feature === feature ? node.split : undefined;
  const [percentages, setPercentages] = useState((existingRandom?.percentages ?? [80, 20]).join(", "));
  const [seed, setSeed] = useState(existingRandom?.seed ?? Math.floor(Math.random() * 2_000_000_000));
  const [buckets, setBuckets] = useState(existingPercentile?.buckets ?? 4);
  const [percentileMode, setPercentileMode] = useState<"equal" | "custom">(existingPercentile?.cutpoints?.length ? "custom" : "equal");
  const [percentileCutpoints, setPercentileCutpoints] = useState(existingPercentile?.cutpoints?.length
    ? existingPercentile.cutpoints.join(", ")
    : "0.9, 0.95, 0.99, 0.999");
  const [error, setError] = useState("");
  const numeric = mode === "percentile" && isNumericVariable(dataset, feature, node.rowIndices);

  function createDefinition(): TreeSplitDefinition | null {
    if (mode === "random") {
      const values = percentages.split(/[,;\s]+/).map(Number).filter((value) => Number.isFinite(value) && value > 0);
      if (values.length < 2) {
        setError("Enter at least two positive percentages, such as 80, 20.");
        return null;
      }
      return { kind: "random", percentages: values, seed };
    }
    if (!numeric) {
      setError("Percentile splits require a numeric variable. You can correct its type in Variable types.");
      return null;
    }
    if (percentileMode === "custom") {
      const tokens = percentileCutpoints.split(/[,;\s]+/).filter(Boolean);
      const parsed = tokens.map((token) => Number(token.replace(/%$/, "")));
      if (!tokens.length || parsed.some((value) => !Number.isFinite(value) || value <= 0 || value >= 100)) {
        setError("Enter percentile cut points between 0 and 1, or percentages between 1 and 100.");
        return null;
      }
      const cutpoints = [...new Set(parsed.map((value) => value >= 1 ? value / 100 : value))].sort((left, right) => left - right);
      if (cutpoints.some((value) => value <= 0 || value >= 1) || cutpoints.length > 19) {
        setError("Choose between 1 and 19 unique cut points.");
        return null;
      }
      return { kind: "percentile", feature, buckets: cutpoints.length + 1, cutpoints };
    }
    return { kind: "percentile", feature, buckets };
  }

  function apply(application: SplitApplication) {
    setError("");
    try {
      const definition = createDefinition();
      if (definition) onApply(prepared(dataset, node, definition), application);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The split could not be created.");
    }
  }

  return (
    <div className="manual-pane special-split-pane">
      <button className="split-back-button" type="button" onClick={onBack}>← {mode === "random" ? "All variables" : feature}</button>
      {node.split && (
        <div className="current-split-card">
          <span>Current split</span><strong>{describeTreeSplit(node.split)}</strong>
          <button type="button" onClick={onRemoveSplit}>Remove split and descendants</button>
        </div>
      )}
      <div className="split-detail-heading">
        <span>Special split</span>
        <h3>{mode === "random" ? "Random sample" : "Percentile groups"}</h3>
        <p>{mode === "random" ? "Assign rows reproducibly to two or more random groups." : `Divide ${feature} into similarly sized groups by rank.`}</p>
      </div>

      {mode === "random" ? (
        <>
          <div className="manual-control">
            <label className="field-label" htmlFor="random-percentages">Group percentages</label>
            <input id="random-percentages" className="text-input" value={percentages} onChange={(event) => setPercentages(event.target.value)} placeholder="80, 20" />
            <p>Enter any number of groups. Values are normalized automatically, so 8, 2 behaves like 80, 20.</p>
          </div>
          <div className="random-seed-control">
            <span><strong>Random arrangement</strong><small>Kept stable when the project is reopened.</small></span>
            <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 2_000_000_000))}>Reshuffle</button>
          </div>
        </>
      ) : (
        <div className="manual-control percentile-controls">
          <div className="percentile-mode-picker" role="group" aria-label="Percentile split style">
            <button className={percentileMode === "equal" ? "percentile-mode--active" : ""} type="button" onClick={() => setPercentileMode("equal")}><strong>Equal groups</strong><small>Divide rows evenly by rank.</small></button>
            <button className={percentileMode === "custom" ? "percentile-mode--active" : ""} type="button" onClick={() => setPercentileMode("custom")}><strong>Custom cuts</strong><small>Focus on specific tails or ranges.</small></button>
          </div>
          {percentileMode === "equal" ? (
            <label className="appearance-slider percentile-group-slider" htmlFor="percentile-buckets">
              <span><strong>Number of groups</strong><small>Every group contains approximately {(100 / buckets).toFixed(buckets === 3 || buckets > 6 ? 1 : 0)}% of ranked values.</small></span>
              <output>{buckets}</output>
              <input id="percentile-buckets" type="range" min="2" max="20" step="1" value={buckets} onChange={(event) => setBuckets(Number(event.target.value))} />
            </label>
          ) : (
            <div className="manual-control percentile-custom-control">
              <label className="field-label" htmlFor="percentile-cutpoints">Percentile cut points</label>
              <input id="percentile-cutpoints" className="text-input" value={percentileCutpoints} onChange={(event) => setPercentileCutpoints(event.target.value)} placeholder="0.9, 0.95, 0.99, 0.999" />
              <p>Use proportions such as 0.9 and 0.99, or percentages such as 90%, 99 and 99.9. ControlTree sorts them automatically.</p>
            </div>
          )}
          {!numeric && <p className="form-error">{feature} is not currently numeric.</p>}
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="button" disabled={mode === "percentile" && !numeric} onClick={() => apply("replace")}>{node.children.length ? "Replace current split" : "Apply split"}<span aria-hidden="true">→</span></button>
      {node.children.length > 0 && <><button className="secondary-button split-insert-button" type="button" disabled={mode === "percentile" && !numeric} onClick={() => apply("insert")}>Insert above current split</button><p className="split-action-note">Reapplies the current subtree inside each new child wherever the data supports it.</p></>}
    </div>
  );
}
