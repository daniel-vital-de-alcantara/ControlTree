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
  if (branches.length < 2) throw new Error("This split needs at least two non-empty groups.");
  if (definition.kind === "random" && branches.length !== definition.percentages.length) {
    throw new Error("This node has too few rows to give every random group at least one row.");
  }
  return { definition, branches: branches.map((branch) => ({ ...branch, count: branch.rowIndices.length })) };
}

export function SpecialSplitPane({ dataset, node, mode, feature = "", onBack, onApply, onRemoveSplit }: Props) {
  const existingRandom = node.split?.kind === "random" ? node.split : undefined;
  const existingPercentile = node.split?.kind === "percentile" && node.split.feature === feature ? node.split : undefined;
  const [percentages, setPercentages] = useState((existingRandom?.percentages ?? [80, 20]).join(", "));
  const [seed, setSeed] = useState(existingRandom?.seed ?? Math.floor(Math.random() * 2_000_000_000));
  const [buckets, setBuckets] = useState(existingPercentile?.buckets ?? 4);
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
        <div className="manual-control">
          <label className="field-label" htmlFor="percentile-buckets">Number of groups</label>
          <select id="percentile-buckets" value={buckets} onChange={(event) => setBuckets(Number(event.target.value))}>
            {[2, 3, 4, 5, 10].map((value) => <option value={value} key={value}>{value} groups · approximately {(100 / value).toFixed(value === 3 ? 1 : 0)}% each</option>)}
          </select>
          {!numeric && <p className="form-error">{feature} is not currently numeric.</p>}
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="button" disabled={mode === "percentile" && !numeric} onClick={() => apply("replace")}>{node.children.length ? "Replace current split" : "Apply split"}<span aria-hidden="true">→</span></button>
      {node.children.length > 0 && <><button className="secondary-button split-insert-button" type="button" disabled={mode === "percentile" && !numeric} onClick={() => apply("insert")}>Insert above current split</button><p className="split-action-note">Reapplies the current subtree inside each new child wherever the data supports it.</p></>}
    </div>
  );
}
