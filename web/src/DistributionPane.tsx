import { useMemo } from "react";

import type { ParsedDataset } from "./dataset";
import {
  createDistributionSnapshot,
  formatStatistic,
  type DistributionSettings,
  type DistributionSnapshot,
} from "./distribution";
import type { TreeNode } from "./domain";

type Props = {
  dataset: ParsedDataset;
  node: TreeNode;
  settings: DistributionSettings;
  showInPresentation: boolean;
  lockVariable?: boolean;
  onSettingsChange: (settings: DistributionSettings) => void;
  onShowInPresentationChange: (show: boolean) => void;
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="profile-stat"><span>{label}</span><strong>{value}</strong></div>;
}

export function DistributionResults({ snapshot }: { snapshot: DistributionSnapshot }) {
  const chartCounts = snapshot.numeric
    ? snapshot.histogram.map((item) => item.count)
    : snapshot.categories.map((item) => item.count);
  const maximumCount = Math.max(...chartCounts, 1);
  const observed = Math.max(snapshot.count, 1);

  function chartValue(count: number): string {
    return snapshot.scale === "count"
      ? count.toLocaleString()
      : `${((count / observed) * 100).toFixed(1)}%`;
  }

  return (
    <>
      <div className="profile-stats">
        <Stat label="Count" value={snapshot.count.toLocaleString()} />
        <Stat label="Missing" value={snapshot.missing.toLocaleString()} />
        <Stat label="Distinct" value={snapshot.distinct.toLocaleString()} />
        {snapshot.statistics && (
          <>
            <Stat label="Average" value={formatStatistic(snapshot.statistics.average)} />
            <Stat label="Median" value={formatStatistic(snapshot.statistics.median)} />
            <Stat label="Std. deviation" value={formatStatistic(snapshot.statistics.standardDeviation)} />
            <Stat label="Minimum" value={formatStatistic(snapshot.statistics.minimum)} />
            <Stat label="Maximum" value={formatStatistic(snapshot.statistics.maximum)} />
            <Stat label="Variance" value={formatStatistic(snapshot.statistics.variance)} />
          </>
        )}
      </div>

      {snapshot.count === 0 ? (
        <div className="mini-empty">This variable has no values in the selected node.</div>
      ) : snapshot.histogramError ? (
        <div className="mini-empty">{snapshot.histogramError}</div>
      ) : snapshot.numeric ? (
        <div className="histogram" aria-label={`${snapshot.variable} histogram`}>
          <div className="histogram__plot">
            {snapshot.histogram.map((bin, index) => (
              <div className="histogram__column" key={`${bin.start}-${index}`}>
                <span>{chartValue(bin.count)}</span>
                <div
                  className="histogram__bar"
                  style={{ height: `${Math.max(3, (bin.count / maximumCount) * 100)}%` }}
                  title={`${formatStatistic(bin.start)} to ${formatStatistic(bin.end)}: ${chartValue(bin.count)}`}
                />
              </div>
            ))}
          </div>
          <div className="histogram__axis">
            <span>{formatStatistic(snapshot.histogram[0]?.start ?? 0)}</span>
            <span>{formatStatistic(snapshot.histogram[snapshot.histogram.length - 1]?.end ?? 0)}</span>
          </div>
        </div>
      ) : (
        <div className="category-chart" aria-label={`${snapshot.variable} value distribution`}>
          {snapshot.categories.map((item) => (
            <div className="category-bar" key={item.label}>
              <div className="category-bar__label"><span title={item.label}>{item.label}</span><strong>{chartValue(item.count)}</strong></div>
              <div className="category-bar__track"><span style={{ width: `${(item.count / maximumCount) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      {snapshot.missing > 0 && <p className="distribution-note">Missing values are reported above and excluded from the chart.</p>}
    </>
  );
}

export function DistributionPane({ dataset, node, settings, showInPresentation, lockVariable = false, onSettingsChange, onShowInPresentationChange }: Props) {
  const snapshot = useMemo(
    () => createDistributionSnapshot(dataset, node, settings),
    [dataset, node, settings],
  );

  return (
    <div className="distribution-pane">
      {lockVariable ? (
        <div className="automatic-target-context"><span>Target distribution</span><strong>{settings.variable}</strong></div>
      ) : (
        <>
          <label className="field-label" htmlFor="distribution-variable">Variable</label>
          <select id="distribution-variable" value={settings.variable} onChange={(event) => {
            onSettingsChange({ ...settings, variable: event.target.value, binWidth: null });
            onShowInPresentationChange(false);
          }}>
            {dataset.columns.map((column) => <option key={column} value={column}>{column}</option>)}
          </select>
        </>
      )}

      <div className="profile-context">
        <span>Node {node.id}</span>
        <strong>{node.samples.toLocaleString()} rows</strong>
      </div>

      <div className="distribution-heading">
        <div>
          <p className="kicker">Selected-node profile</p>
          <h3>{snapshot.numeric ? "Histogram" : "Value distribution"}</h3>
        </div>
        <select aria-label="Chart scale" value={settings.scale} onChange={(event) => onSettingsChange({
          ...settings,
          scale: event.target.value as DistributionSettings["scale"],
        })}>
          <option value="count">Count</option>
          <option value="percentage">Percent</option>
        </select>
      </div>

      {snapshot.numeric && (
        <div className="bin-width-control">
          <label htmlFor="histogram-bin-width">
            <span>Bin width</span>
            <small>Leave empty for automatic widths.</small>
          </label>
          <div>
            <input
              id="histogram-bin-width"
              type="number"
              min="0"
              step="any"
              placeholder="Auto"
              value={settings.binWidth ?? ""}
              onChange={(event) => {
                const value = Number(event.target.value);
                onSettingsChange({
                  ...settings,
                  binWidth: event.target.value && Number.isFinite(value) && value > 0 ? value : null,
                });
              }}
            />
            {settings.binWidth !== null && <button type="button" onClick={() => onSettingsChange({ ...settings, binWidth: null })}>Auto</button>}
          </div>
        </div>
      )}

      <DistributionResults snapshot={snapshot} />

      <label className="present-distribution-toggle">
        <input
          type="checkbox"
          checked={showInPresentation}
          onChange={(event) => onShowInPresentationChange(event.target.checked)}
        />
        <span>
          <strong>Show in presentation</strong>
          <small>Add this node’s distribution below the tree and keep it synchronized.</small>
        </span>
      </label>
    </div>
  );
}
