import { useMemo, type CSSProperties } from "react";

import type { ParsedDataset } from "./dataset";
import type { TreeNode } from "./domain";
import { evaluateTree, qualityLabel } from "./tree-test";

type Props = {
  dataset: ParsedDataset;
  tree: TreeNode;
  variable: string;
  selectedNodeId: string;
  lockVariable?: boolean;
  onVariableChange: (variable: string) => void;
};

function Score({ value }: { value: number | null }) {
  return <strong>{value === null ? "—" : `${value.toFixed(1)}/100`}</strong>;
}

export function TreeTestPane({ dataset, tree, variable, selectedNodeId, lockVariable = false, onVariableChange }: Props) {
  const result = useMemo(() => evaluateTree(dataset, tree, variable), [dataset, tree, variable]);
  const focusedSplit = result.splits.find((split) => split.nodeId === selectedNodeId);

  return (
    <div className="test-pane">
      {lockVariable ? (
        <div className="automatic-target-context"><span>Testing project target</span><strong>{variable}</strong></div>
      ) : (
        <>
          <label className="field-label" htmlFor="test-variable">Variable to test</label>
          <select id="test-variable" value={variable} onChange={(event) => onVariableChange(event.target.value)}>
            {dataset.columns.map((column) => <option key={column} value={column}>{column}</option>)}
          </select>
        </>
      )}
      <p className="settings-help">Uses variance reduction for numeric variables and Gini reduction for categorical variables.</p>

      <div className="test-score-card">
        <div>
          <p className="kicker">Whole tree separation</p>
          <Score value={result.score} />
          <span>{qualityLabel(result.score)}</span>
        </div>
        <div className="test-score-ring" style={{ "--test-score": `${result.score ?? 0}%` } as CSSProperties} aria-hidden="true">
          <span>{result.score === null ? "—" : Math.round(result.score)}</span>
        </div>
      </div>

      <div className="profile-stats">
        <div className="profile-stat"><span>Observed rows</span><strong>{result.observed.toLocaleString()}</strong></div>
        <div className="profile-stat"><span>Missing</span><strong>{result.missing.toLocaleString()}</strong></div>
        <div className="profile-stat"><span>Terminal nodes</span><strong>{result.leafCount}</strong></div>
      </div>

      {!result.splitCount ? (
        <div className="mini-empty">Create a split to measure whether it makes the resulting nodes more homogeneous.</div>
      ) : (
        <section className="test-splits">
          <div className="settings-section__heading">
            <div><p className="kicker">Split quality</p><h3>{focusedSplit ? "Selected split" : "All splits"}</h3></div>
          </div>
          {!selectedNodeId && <p className="settings-help">Select a split node on the canvas to focus on it.</p>}
          {(focusedSplit ? [focusedSplit] : result.splits).map((split) => (
            <div className="test-split-card" key={split.nodeId}>
              <div className="test-split-card__heading">
                <span><strong>{split.nodeTitle}</strong><small>Node {split.nodeId} · {split.childCount} branches</small></span>
                <span><Score value={split.score} /><small>{qualityLabel(split.score)}</small></span>
              </div>
              <div className="test-meter"><span style={{ width: `${split.score ?? 0}%` }} /></div>
              <p>Smallest branch: {split.smallestBranchPercent.toFixed(1)}%</p>
              {split.warning && <p className="test-warning">{split.warning}</p>}
            </div>
          ))}
        </section>
      )}

      {result.score === null && <p className="test-note">A score needs observed variation in the chosen variable.</p>}
      <p className="test-note">This is a practical diagnostic, not proof that a tree is correct. Compare scores alongside branch sizes and business meaning.</p>
    </div>
  );
}
