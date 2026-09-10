import type { ParsedDataset } from "./dataset";
import { describeRule, describeTreeSplit, type SplitCandidate, type TreeNode } from "./domain";
import type { SplitApplication } from "./split-operations";
import { VariablePicker } from "./VariablePicker";

type Props = {
  dataset: ParsedDataset;
  node: TreeNode;
  target: string | null;
  candidates: SplitCandidate[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  elapsedSeconds: number;
  feature: string;
  selectedSplitId: string;
  onFeatureChange: (feature: string) => void;
  onCandidateChange: (candidateId: string) => void;
  onManual: () => void;
  onRandom: () => void;
  onPercentile: () => void;
  onApply: (mode: SplitApplication) => void;
  onRemoveSplit: () => void;
};

export function candidateMatchesCurrentSplit(candidate: SplitCandidate, node: TreeNode): boolean {
  return node.split?.kind === "binary" && node.split.feature === candidate.feature &&
    node.split.operator === candidate.operator && String(node.split.value) === String(candidate.value);
}

export function rankedSplitFeatures(dataset: ParsedDataset, target: string | null, candidates: SplitCandidate[]) {
  const bestByFeature = new Map<string, { score: number; count: number }>();
  candidates.forEach((candidate) => {
    const current = bestByFeature.get(candidate.feature);
    bestByFeature.set(candidate.feature, {
      score: Math.max(current?.score ?? Number.NEGATIVE_INFINITY, candidate.gain),
      count: (current?.count ?? 0) + 1,
    });
  });
  return dataset.columns
    .map((feature) => ({ feature, score: feature === target ? undefined : bestByFeature.get(feature)?.score, count: feature === target ? 0 : bestByFeature.get(feature)?.count ?? 0 }))
    .sort((left, right) => {
      if (left.feature === target) return 1;
      if (right.feature === target) return -1;
      if (left.score !== undefined && right.score !== undefined) return right.score - left.score || left.feature.localeCompare(right.feature);
      if (left.score !== undefined) return -1;
      if (right.score !== undefined) return 1;
      return left.feature.localeCompare(right.feature);
    });
}

export function SplitPane({ dataset, node, target, candidates, status, error, elapsedSeconds, feature, selectedSplitId, onFeatureChange, onCandidateChange, onManual, onRandom, onPercentile, onApply, onRemoveSplit }: Props) {
  const features = rankedSplitFeatures(dataset, target, candidates);
  const featureCandidates = candidates.filter((candidate) => candidate.feature === feature).slice(0, 3);
  const selected = featureCandidates.find((candidate) => candidate.id === selectedSplitId);

  if (!feature) {
    return (
      <div className="split-variable-pane">
        {node.split && (
          <div className="current-split-card">
            <span>Current split</span>
            <strong>{describeTreeSplit(node.split)}</strong>
            <button type="button" onClick={onRemoveSplit}>Remove split and descendants</button>
          </div>
        )}
        <div className="split-detail-heading">
          <span>First step</span>
          <h3>Choose a variable</h3>
          <p>{target ? "Variables are ranked by their best available split score." : "Choose any variable for a manual split. Select a target to add recommendation scores."}</p>
        </div>
        <button className="more-action split-special-choice" type="button" onClick={onRandom}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h3c5 0 5 10 10 10h3M17 14l3 3-3 3M4 17h3c2.7 0 3.9-2.9 5.2-5.5C13.4 9.1 14.7 7 17 7h3M17 4l3 3-3 3"/></svg>
          <span><strong>Random sample</strong><small>Create train/test or other randomly assigned groups.</small></span>
        </button>
        {status === "loading" && (
          <div className="split-loading" role="status">
            <span className="split-loading__spinner" />
            <span><strong>Ranking variables…</strong><small>{elapsedSeconds.toFixed(1)} seconds</small></span>
          </div>
        )}
        {status === "error" && <p className="form-error" role="alert">{error}</p>}
        <VariablePicker items={features.map((item) => ({
          variable: item.feature,
          score: item.score,
          detail: item.feature === target ? "Target variable · manual or percentile split" : item.count ? `${item.count} suggested rule${item.count === 1 ? "" : "s"}` : target && status === "ready" ? "No valid recommended rule" : "Manual split available",
        }))} onSelect={onFeatureChange} />
      </div>
    );
  }

  return (
    <div className="split-variable-pane">
      <button className="split-back-button" type="button" onClick={() => onFeatureChange("")}>← All variables</button>
      {node.split && (
        <div className="current-split-card">
          <span>Current split</span>
          <strong>{describeTreeSplit(node.split)}</strong>
          <button type="button" onClick={onRemoveSplit}>Remove split and descendants</button>
        </div>
      )}
      <div className="split-detail-heading">
        <span>Split variable</span>
        <h3>{feature}</h3>
        <p>Choose a suggested rule or define the branches yourself.</p>
      </div>

      <div className="split-section-heading"><strong>Recommended rules</strong><small>{target ? `Ranked for ${target}` : "Target required"}</small></div>
      {status === "loading" ? (
        <div className="split-loading" role="status">
          <span className="split-loading__spinner" />
          <span><strong>Computing recommendations…</strong><small>{elapsedSeconds.toFixed(1)} seconds</small></span>
        </div>
      ) : featureCandidates.length ? (
        <div className="suggestions" role="radiogroup" aria-label={`Recommended ${feature} splits`}>
          {featureCandidates.map((candidate, index) => (
            <label className={`suggestion${selectedSplitId === candidate.id ? " suggestion--selected" : ""}`} key={candidate.id}>
              <input type="radio" name="split" value={candidate.id} checked={selectedSplitId === candidate.id} onChange={() => onCandidateChange(candidate.id)} />
              <span className="suggestion__rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="suggestion__body"><strong>{describeRule(candidate)}</strong><span>{candidate.leftCount} / {candidate.rightCount} rows</span></span>
              <span className="gain">+{candidate.gain.toFixed(3)}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="mini-empty">{target ? "No valid recommended rule for this variable." : "Choose a target to calculate recommendations."}</div>
      )}

      {selected && (
        <>
          <div className="selection-summary"><span>{selected.criterion ?? "Expected gain"}</span><strong>{selected.gain.toFixed(4)}</strong></div>
          <button className="primary-button" type="button" onClick={() => onApply("replace")}>
            {node.children.length ? "Replace current split" : "Apply recommended split"}<span aria-hidden="true">→</span>
          </button>
          {node.children.length > 0 && (
            <>
              <button className="secondary-button split-insert-button" type="button" onClick={() => onApply("insert")}>Insert above current split</button>
              <p className="split-action-note">Reapplies the current subtree inside each new child wherever the data supports it.</p>
            </>
          )}
        </>
      )}

      <button className="more-action split-manual-choice" type="button" onClick={onManual}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h7M17 10v8M14 15l3 3 3-3"/></svg>
        <span><strong>Define manually</strong><small>Create custom thresholds or multiway category branches for {feature}.</small></span>
      </button>
      <button className="more-action split-percentile-choice" type="button" onClick={onPercentile}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19h16M6 16V8M12 16V4M18 16v-5M3 8h6M9 4h6M15 11h6"/></svg>
        <span><strong>Split by percentiles</strong><small>Create equal-sized groups from the ranked values of {feature}.</small></span>
      </button>
    </div>
  );
}
