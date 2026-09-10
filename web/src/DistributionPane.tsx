import { useEffect, useMemo, useState } from "react";

import type { DataValue, ParsedDataset } from "./dataset";
import { createDistributionSnapshot, createScatterSnapshot, formatStatistic, takeExampleRows, type DistributionSettings, type DistributionSnapshot, type ScatterBounds } from "./distribution";
import type { TreeNode } from "./domain";
import { isNumericVariable } from "./tree-settings";
import { VariablePicker } from "./VariablePicker";

type Props = {
  dataset: ParsedDataset;
  node: TreeNode;
  target?: string | null;
  settings: DistributionSettings;
  showInPresentation: boolean;
  onSettingsChange: (settings: DistributionSettings) => void;
  onShowInPresentationChange: (show: boolean) => void;
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="profile-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function bucketLabel(snapshot: DistributionSnapshot, index: number): string {
  if (!snapshot.numeric) return snapshot.categories[index]?.label ?? "Bucket";
  const bin = snapshot.histogram[index];
  if (!bin) return "Bucket";
  return bin.overflow ? `${formatStatistic(bin.start)} and above` : `${formatStatistic(bin.start)}–${formatStatistic(bin.end)}`;
}

function DistributionChart({ snapshot, selectedBucket = -1, onBucketSelect }: { snapshot: DistributionSnapshot; selectedBucket?: number; onBucketSelect?: (index: number) => void }) {
  const values = snapshot.numeric ? snapshot.histogram : snapshot.categories;
  const maximumCount = Math.max(...values.map((item) => item.count), 1);
  const observed = Math.max(snapshot.count, 1);
  const targetValues = values.map((item) => item.targetAverage).filter((value): value is number => value !== undefined);
  const targetMinimum = targetValues.length ? Math.min(...targetValues) : 0;
  const targetMaximum = targetValues.length ? Math.max(...targetValues) : 1;
  const targetRange = targetMaximum - targetMinimum || 1;
  const targetPosition = (value: number) => targetMaximum === targetMinimum ? .5 : (value - targetMinimum) / targetRange;
  const linePoints = values.map((item, index) => item.targetAverage === undefined ? null : {
    x: (index + .5) / Math.max(values.length, 1) * 100,
    y: 94 - targetPosition(item.targetAverage) * 84,
  });
  const segments: string[][] = [];
  linePoints.forEach((point, index) => {
    if (!point) return;
    if (index === 0 || linePoints[index - 1] === null) segments.push([]);
    segments.at(-1)!.push(`${point.x},${point.y}`);
  });
  const chartValue = (count: number) => snapshot.scale === "count" ? count.toLocaleString() : `${((count / observed) * 100).toFixed(1)}%`;

  if (!snapshot.numeric) return <div className="category-chart" aria-label={`${snapshot.variable} value distribution`}>
    {snapshot.categories.map((item, index) => <button type="button" className={`category-bar${selectedBucket === index ? " category-bar--selected" : ""}`} key={item.label} onClick={() => onBucketSelect?.(index)} disabled={!onBucketSelect}>
      <div className="category-bar__label"><span title={item.label}>{item.label}</span><strong>{chartValue(item.count)}</strong></div>
      <div className="category-bar__track"><span style={{ width: `${(item.count / maximumCount) * 100}%` }} />{item.targetAverage !== undefined && <i style={{ left: `${targetPosition(item.targetAverage) * 100}%` }} title={`Average ${snapshot.targetVariable}: ${formatStatistic(item.targetAverage)}`} />}</div>
    </button>)}
  </div>;

  const labelStride = Math.max(1, Math.ceil(snapshot.histogram.length / 6));
  return <div className="histogram" aria-label={`${snapshot.variable} histogram`}>
    <div className="histogram__plot">
      {snapshot.histogram.map((bin, index) => <button type="button" className={`histogram__column${selectedBucket === index ? " histogram__column--selected" : ""}`} key={`${bin.start}-${index}`} onClick={() => onBucketSelect?.(index)} disabled={!onBucketSelect}>
        <span>{bucketLabel(snapshot, index)}: {chartValue(bin.count)}{bin.targetAverage !== undefined ? ` · average ${snapshot.targetVariable}: ${formatStatistic(bin.targetAverage)}` : ""}</span>
        <div className="histogram__bar" style={{ height: bin.count === 0 ? "0" : `${Math.max(1.5, (bin.count / maximumCount) * 100)}%` }} />
      </button>)}
      {snapshot.targetComparison && <svg className="histogram__target-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`Average ${snapshot.targetVariable} by bucket`}>
        {segments.map((points, index) => points.length > 1 && <polyline key={index} points={points.join(" ")} />)}
        {linePoints.map((point, index) => point && <circle key={index} cx={point.x} cy={point.y} r="1.4"><title>Average {snapshot.targetVariable}: {formatStatistic(values[index].targetAverage!)}</title></circle>)}
      </svg>}
    </div>
    <div className="histogram__axis">{snapshot.histogram.map((bin, index) => (index % labelStride === 0 || index === snapshot.histogram.length - 1) ? <span key={index} style={{ left: `${(index + .5) / snapshot.histogram.length * 100}%` }}>{bin.overflow ? `≥${formatStatistic(bin.start)}` : formatStatistic(bin.start)}</span> : null)}</div>
    {snapshot.targetComparison && <div className="target-line-legend"><i /> Average {snapshot.targetVariable}</div>}
  </div>;
}

export function DistributionResults({ snapshot }: { snapshot: DistributionSnapshot }) {
  return <>
    {snapshot.count === 0 ? <div className="mini-empty">This variable has no values in the selected node.</div> : snapshot.histogramError ? <div className="mini-empty">{snapshot.histogramError}</div> : <DistributionChart snapshot={snapshot} />}
    <div className="profile-stats"><Stat label="Count" value={snapshot.count.toLocaleString()} /><Stat label="Missing" value={snapshot.missing.toLocaleString()} /><Stat label="Distinct" value={snapshot.distinct.toLocaleString()} />{snapshot.statistics && <><Stat label="Average" value={formatStatistic(snapshot.statistics.average)} /><Stat label="Median" value={formatStatistic(snapshot.statistics.median)} /><Stat label="Std. deviation" value={formatStatistic(snapshot.statistics.standardDeviation)} /><Stat label="Minimum" value={formatStatistic(snapshot.statistics.minimum)} /><Stat label="Maximum" value={formatStatistic(snapshot.statistics.maximum)} /><Stat label="Variance" value={formatStatistic(snapshot.statistics.variance)} /></>}</div>
    {snapshot.missing > 0 && <p className="distribution-note">Missing values are reported above and excluded from the chart.</p>}
  </>;
}

function valueText(value: DataValue): string {
  if (value === null || String(value).trim() === "") return "Missing";
  return value instanceof Date ? value.toLocaleString() : String(value);
}

export function DistributionPane({ dataset, node, target, settings, showInPresentation, onSettingsChange, onShowInPresentationChange }: Props) {
  const [mode, setMode] = useState<"landing" | "profile" | "examples" | "scatter">("landing");
  const [variableChosen, setVariableChosen] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState(-1);
  const [exampleVariables, setExampleVariables] = useState<string[]>([]);
  const [exampleSeed, setExampleSeed] = useState(1);
  const [scatterVariables, setScatterVariables] = useState<string[]>([]);
  const [bounds, setBounds] = useState<ScatterBounds>({ xMin: null, xMax: null, yMin: null, yMax: null });
  const snapshot = useMemo(() => createDistributionSnapshot(dataset, node, settings, target), [dataset, node, settings, target]);
  const selectedRows = selectedBucket < 0 ? [] : (snapshot.numeric ? snapshot.histogram[selectedBucket]?.rowIndices : snapshot.categories[selectedBucket]?.rowIndices) ?? [];
  const examples = useMemo(() => takeExampleRows(dataset, selectedRows, exampleVariables, exampleSeed), [dataset, selectedRows, exampleVariables, exampleSeed]);
  const numericVariables = dataset.columns.filter((variable) => isNumericVariable(dataset, variable, node.rowIndices));
  const scatterX = scatterVariables[0] ?? "";
  const scatterY = scatterVariables[1] ?? (target && target !== scatterX && numericVariables.includes(target) ? target : "");
  const scatter = useMemo(() => scatterX && scatterY ? createScatterSnapshot(dataset, node, scatterX, scatterY, bounds) : null, [dataset, node, scatterX, scatterY, bounds]);
  const variableItems = dataset.columns.map((variable) => ({ variable, detail: variable === target ? "Target variable" : isNumericVariable(dataset, variable, node.rowIndices) ? "Numeric" : "Categorical" }));
  const chooseVariable = (variable: string) => { onSettingsChange({ ...settings, variable, binWidth: null }); onShowInPresentationChange(false); setVariableChosen(true); setSelectedBucket(-1); };
  useEffect(() => setSelectedBucket(-1), [node.id, settings.variable]);

  if (mode === "landing") return <div className="distribution-pane distribution-landing">
    <button className="more-action" type="button" onClick={() => { setMode("profile"); setVariableChosen(false); }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20V10M9.3 20V5M14.7 20v-8M20 20V8M2 20h20"/></svg><span><strong>Basic statistics & histogram</strong><small>Inspect one variable and compare it with the target.</small></span></button>
    <button className="more-action" type="button" onClick={() => { setMode("examples"); setVariableChosen(false); }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16M4 10h16M4 15h10M4 20h7"/></svg><span><strong>Take examples</strong><small>Select a bucket and inspect random source rows.</small></span></button>
    <button className="more-action" type="button" onClick={() => setMode("scatter")}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 4v16h16M8 15h.01M11 10h.01M15 13h.01M18 7h.01"/></svg><span><strong>Scatter plot</strong><small>Explore the relationship between two numeric variables.</small></span></button>
  </div>;

  if (mode === "scatter") {
    const toggleScatter = (variable: string) => setScatterVariables((current) => current.includes(variable) ? current.filter((item) => item !== variable) : [...current, variable].slice(-2));
    return <div className="distribution-pane"><button className="split-back-button" type="button" onClick={() => setMode("landing")}>← Distribution tools</button><div className="split-detail-heading"><span>Scatter plot</span><h3>Choose one or two variables</h3><p>With one variable selected, a numeric target is used automatically; otherwise choose a second variable.</p></div>
      <VariablePicker items={numericVariables.map((variable) => ({ variable, detail: variable === target ? "Target variable" : "Numeric" }))} selected={scatterVariables} multiple maximumSelections={2} onSelect={toggleScatter} searchPlaceholder="Search numeric variables…" />
      {scatter && <><div className="scatter-heading"><strong>{scatter.yVariable}</strong><span>versus</span><strong>{scatter.xVariable}</strong></div><div className="scatter-plot"><span className="scatter-axis scatter-axis--y">{scatter.yVariable}</span><svg viewBox="0 0 600 320" role="img" aria-label={`${scatter.yVariable} by ${scatter.xVariable} scatter plot`}><line x1="38" y1="10" x2="38" y2="286"/><line x1="38" y1="286" x2="590" y2="286"/>{scatter.displayedPoints.map((point) => <circle key={point.rowIndex} cx={38 + (point.x - scatter.xDomain[0]) / (scatter.xDomain[1] - scatter.xDomain[0]) * 552} cy={286 - (point.y - scatter.yDomain[0]) / (scatter.yDomain[1] - scatter.yDomain[0]) * 276} r="2.2" />)}</svg><span className="scatter-axis scatter-axis--x">{scatter.xVariable}</span></div>
        <div className="scatter-bounds">{(["xMin", "xMax", "yMin", "yMax"] as const).map((key) => <label key={key}><span>{key === "xMin" ? "X minimum" : key === "xMax" ? "X maximum" : key === "yMin" ? "Y minimum" : "Y maximum"}</span><input type="number" step="any" placeholder="Auto" value={bounds[key] ?? ""} onChange={(event) => setBounds((current) => ({ ...current, [key]: event.target.value === "" ? null : Number(event.target.value) }))} /></label>)}</div>
        <div className="scatter-excluded"><strong>{scatter.excluded.toLocaleString()} points excluded</strong><span>{scatter.total ? (scatter.excluded / scatter.total * 100).toFixed(1) : "0.0"}% of node rows, including missing and out-of-range values.</span>{scatter.points.length > scatter.displayedPoints.length && <small>Showing a representative sample of {scatter.displayedPoints.length.toLocaleString()} visible points for performance.</small>}</div></>}
    </div>;
  }

  if (!variableChosen) return <div className="distribution-pane"><button className="split-back-button" type="button" onClick={() => setMode("landing")}>← Distribution tools</button><div className="split-detail-heading"><span>{mode === "profile" ? "Basic statistics" : "Take examples"}</span><h3>Choose a variable</h3><p>{mode === "profile" ? "Select the variable to profile inside this node." : "Select the variable whose buckets you want to sample."}</p></div><VariablePicker items={variableItems} onSelect={chooseVariable} /></div>;

  return <div className="distribution-pane"><button className="split-back-button" type="button" onClick={() => setVariableChosen(false)}>← All variables</button><div className="profile-context"><span>Node {node.id}</span><strong>{node.samples.toLocaleString()} rows</strong></div>
    <div className="distribution-heading"><div><p className="kicker">{settings.variable}</p><h3>{snapshot.numeric ? "Histogram" : "Value distribution"}</h3></div><select aria-label="Chart scale" value={settings.scale} onChange={(event) => onSettingsChange({ ...settings, scale: event.target.value as DistributionSettings["scale"] })}><option value="count">Count</option><option value="percentage">Percent</option></select></div>
    {snapshot.numeric && <div className="bin-width-control"><label htmlFor="histogram-bin-width"><span>Bin width</span><small>Leave empty for automatic widths.</small></label><div><input id="histogram-bin-width" type="number" min="0" step="any" placeholder="Auto" value={settings.binWidth ?? ""} onChange={(event) => { const value = Number(event.target.value); onSettingsChange({ ...settings, binWidth: event.target.value && Number.isFinite(value) && value > 0 ? value : null }); }} />{settings.binWidth !== null && <button type="button" onClick={() => onSettingsChange({ ...settings, binWidth: null })}>Auto</button>}</div></div>}
    {mode === "profile" ? <><DistributionResults snapshot={snapshot}/><label className="present-distribution-toggle"><input type="checkbox" checked={showInPresentation} onChange={(event) => onShowInPresentationChange(event.target.checked)} /><span><strong>Show in presentation</strong><small>Add this node’s distribution beside the tree and keep it synchronized.</small></span></label></> : <><p className="bucket-instruction">Choose a bar or category below to take examples from that bucket.</p><DistributionChart snapshot={snapshot} selectedBucket={selectedBucket} onBucketSelect={setSelectedBucket}/>{selectedBucket >= 0 && <><div className="examples-heading"><span>Selected bucket</span><strong>{bucketLabel(snapshot, selectedBucket)}</strong><small>{selectedRows.length.toLocaleString()} rows available</small></div><VariablePicker items={variableItems} selected={exampleVariables} multiple onSelect={(variable) => setExampleVariables((current) => current.includes(variable) ? current.filter((item) => item !== variable) : [...current, variable])} searchPlaceholder="Search columns to include…" />{exampleVariables.length > 0 && <><button className="secondary-button examples-reshuffle" type="button" onClick={() => setExampleSeed((current) => current + 1)}>↻ Reshuffle examples</button><div className="examples-table-wrap"><table className="examples-table"><thead><tr>{exampleVariables.map((variable) => <th key={variable}>{variable}</th>)}</tr></thead><tbody>{examples.map((row, index) => <tr key={index}>{exampleVariables.map((variable) => <td key={variable} title={valueText(row[variable])}>{valueText(row[variable])}</td>)}</tr>)}</tbody></table></div></>}</>}</>}
  </div>;
}
