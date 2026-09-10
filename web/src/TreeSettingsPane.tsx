import { useEffect, useRef } from "react";

import type { ParsedDataset, VariableType } from "./dataset";
import { inferredVariableType } from "./data-engine";
import type { TreeNode } from "./domain";
import {
  allAggregations,
  defaultAppearance,
  isNumericVariable,
  type NodeFieldVisibility,
  type SummaryMetric,
  type TreeAppearance,
} from "./tree-settings";

type Props = {
  section: "tree" | "metrics" | "variables";
  dataset?: ParsedDataset;
  appearance: TreeAppearance;
  nodeFields: NodeFieldVisibility;
  metrics: SummaryMetric[];
  selectedNode?: TreeNode;
  onAppearanceChange: (appearance: TreeAppearance) => void;
  onNodeFieldsChange: (fields: NodeFieldVisibility) => void;
  onMetricsChange: (metrics: SummaryMetric[]) => void;
  onNodeTitleChange: (title: string) => void;
  onNodeTitleCommit?: (title: string) => void;
  onNodeTitleCancel?: () => void;
  nodeNameSuggestions?: string[];
  renameRequestId?: number;
  onVariableTypeChange: (variable: string, type: VariableType) => void;
};

export function TreeSettingsPane({ section, dataset, appearance, nodeFields, metrics, selectedNode, onAppearanceChange, onNodeFieldsChange, onMetricsChange, onNodeTitleChange, onNodeTitleCommit, onNodeTitleCancel, nodeNameSuggestions = [], renameRequestId = 0, onVariableTypeChange }: Props) {
  const nodeNameInputRef = useRef<HTMLInputElement>(null);
  const renameOriginalRef = useRef("");
  const renameCancelledRef = useRef(false);

  useEffect(() => {
    if (!renameRequestId || section !== "metrics" || !selectedNode) return;
    nodeNameInputRef.current?.focus();
    nodeNameInputRef.current?.select();
  }, [renameRequestId, section, selectedNode?.id]);

  function updateMetric(id: string, patch: Partial<SummaryMetric>) {
    onMetricsChange(metrics.map((metric) => metric.id === id ? { ...metric, ...patch } : metric));
  }

  function addMetric() {
    const variable = dataset?.columns[0];
    if (!variable) return;
    onMetricsChange([...metrics, {
      id: `metric-${Date.now()}`,
      variable,
      aggregation: isNumericVariable(dataset, variable) ? "average" : "distinct",
      highlighted: false,
      format: "number",
    }]);
  }

  function moveMetric(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= metrics.length) return;
    const reordered = [...metrics];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    onMetricsChange(reordered);
  }

  return (
    <div className="tree-settings">
      {section === "tree" && (
      <section className="settings-section">
        <div className="settings-section__heading">
          <div>
            <p className="kicker">Appearance</p>
            <h3>Tree colors</h3>
          </div>
          <button className="text-button" type="button" onClick={() => onAppearanceChange(defaultAppearance)}>Reset</button>
        </div>
        {([
          ["nodeColor", "Node fill"],
          ["accentColor", "Selected node"],
          ["connectorColor", "Connectors"],
          ["backgroundColor", "Canvas background"],
        ] as const).map(([key, label]) => (
          <label className="color-row" key={key}>
            <span>{label}</span>
            <span className="color-control">
              <code>{appearance[key].toUpperCase()}</code>
              <input
                type="color"
                value={appearance[key]}
                onChange={(event) => onAppearanceChange({ ...appearance, [key]: event.target.value })}
              />
            </span>
          </label>
        ))}
        <label className="setting-check-row">
          <input
            type="checkbox"
            checked={appearance.showGrid}
            onChange={(event) => onAppearanceChange({ ...appearance, showGrid: event.target.checked })}
          />
          <span>
            <strong>Show dotted grid</strong>
            <small>Turn this off for a clean, solid screenshot background.</small>
          </span>
        </label>
      </section>
      )}

      {section === "variables" && (
      <section className="settings-section">
        {!dataset && <div className="mini-empty">Upload a dataset to configure variable types.</div>}
        {dataset && (
          <div className="variable-type-list">
            {dataset.columns.map((variable) => {
              const inferred = inferredVariableType(dataset, variable);
              const selected = dataset.variableTypes?.[variable] ?? "automatic";
              const format = dataset.numberFormats?.[variable];
              const detectedLabel = inferred === "numeric" && format
                ? `numeric · ${format === "comma" ? "comma decimal" : format === "dot" ? "dot decimal" : "grouped whole numbers"}`
                : inferred;
              return (
                <label className="variable-type-row" key={variable}>
                  <span>
                    <strong>{variable}</strong>
                    <small>Detected as {detectedLabel}</small>
                  </span>
                  <select
                    aria-label={`Type for ${variable}`}
                    value={selected}
                    onChange={(event) => onVariableTypeChange(variable, event.target.value as VariableType)}
                  >
                    <option value="automatic">Automatic</option>
                    <option value="numeric">Numeric</option>
                    <option value="categorical">Categorical</option>
                  </select>
                </label>
              );
            })}
          </div>
        )}
      </section>
      )}

      {section === "metrics" && (
      <section className="settings-section">
        <div className="node-name-editor">
          <label className="field-label" htmlFor="selected-node-name">Selected node name</label>
          {selectedNode ? (
            <>
              <input
                ref={nodeNameInputRef}
                className="text-input"
                id="selected-node-name"
                list="recent-node-names"
                value={selectedNode.title}
                onFocus={(event) => { renameOriginalRef.current = event.currentTarget.value; renameCancelledRef.current = false; }}
                onChange={(event) => onNodeTitleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    renameCancelledRef.current = true;
                    onNodeTitleChange(renameOriginalRef.current);
                    onNodeTitleCancel?.();
                    event.currentTarget.blur();
                  }
                }}
                onBlur={(event) => {
                  if (renameCancelledRef.current) { renameCancelledRef.current = false; return; }
                  const title = event.target.value.trim() || "Untitled node";
                  if (title !== event.target.value) onNodeTitleChange(title);
                  onNodeTitleCommit?.(title);
                }}
              />
              <datalist id="recent-node-names">
                {nodeNameSuggestions.map((name) => <option value={name} key={name} />)}
              </datalist>
              <small>Click another node on the canvas to rename it without leaving Metrics.</small>
            </>
          ) : (
            <div className="mini-empty">Select a node on the canvas to rename it.</div>
          )}
        </div>
        <div className="metric-visibility-list">
          {([
            ["nodeName", "Node ID"],
            ["nodeTitle", "Node name"],
          ] as const).map(([key, label]) => (
            <label className="setting-check-row" key={key}>
              <input
                type="checkbox"
                checked={nodeFields[key]}
                onChange={(event) => onNodeFieldsChange({ ...nodeFields, [key]: event.target.checked })}
              />
              <span><strong>{label}</strong></span>
            </label>
          ))}
          <div className="setting-check-row setting-check-row--with-select">
            <label>
              <input
                type="checkbox"
                checked={nodeFields.rowCount}
                onChange={(event) => onNodeFieldsChange({ ...nodeFields, rowCount: event.target.checked })}
              />
              <span><strong>Row count</strong></span>
            </label>
            <select
              aria-label="Row count display"
              disabled={!nodeFields.rowCount}
              value={nodeFields.rowCountFormat}
              onChange={(event) => onNodeFieldsChange({ ...nodeFields, rowCountFormat: event.target.value as NodeFieldVisibility["rowCountFormat"] })}
            >
              <option value="count">Number of rows</option>
              <option value="percent_root">% of root rows</option>
              <option value="percent_parent">% of parent rows</option>
            </select>
          </div>
        </div>
        <div className="calculated-metrics-heading">
          <strong>Calculated metrics</strong>
          <button className="text-button" type="button" onClick={addMetric} disabled={!dataset}>Add</button>
        </div>
        {!dataset && <div className="mini-empty">Upload a dataset to configure summary variables.</div>}
        {dataset && metrics.length === 0 && <div className="mini-empty">No calculated metrics yet.</div>}
        {dataset && metrics.map((metric, index) => {
          const numeric = isNumericVariable(dataset, metric.variable);
          const options = allAggregations.filter((item) => numeric || item.value === "count" || item.value === "distinct" || item.value === "missing" || item.value === "mode");
          const canUseRelativeFormats = metric.aggregation !== "mode";
          const canShowPercentage = ["average", "sum", "min", "max", "mode"].includes(metric.aggregation);
          return (
            <div className={`metric-editor${metric.target ? " metric-editor--target" : ""}`} key={metric.id}>
              <div className="metric-editor__heading">
                <strong>{metric.target ? "Target metric" : `Metric ${index + 1}`}</strong>
                <div>
                  <button type="button" disabled={index === 0} aria-label={`Move ${metric.variable} metric up`} onClick={() => moveMetric(index, -1)}>↑</button>
                  <button type="button" disabled={index === metrics.length - 1} aria-label={`Move ${metric.variable} metric down`} onClick={() => moveMetric(index, 1)}>↓</button>
                </div>
              </div>
              <label className="metric-label-row">
                <span>Display name</span>
                <input
                  className="text-input metric-label-input"
                  aria-label={`Display name for ${metric.variable} metric`}
                  placeholder={`${allAggregations.find((item) => item.value === metric.aggregation)?.label} ${metric.variable}`}
                  value={metric.label ?? ""}
                  onChange={(event) => updateMetric(metric.id, { label: event.target.value })}
                />
              </label>
              <div className="metric-editor__inputs">
                <select value={metric.variable} disabled={metric.target} aria-label={metric.target ? "Project target variable" : "Metric variable"} onChange={(event) => {
                  const variable = event.target.value;
                  const nextNumeric = isNumericVariable(dataset, variable);
                  updateMetric(metric.id, {
                    variable,
                    aggregation: nextNumeric ? metric.aggregation : "mode",
                    ...(!nextNumeric && metric.format !== "percentage" ? { format: "number" } : {}),
                  });
                }}>
                  {dataset.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                </select>
                <select value={metric.aggregation} onChange={(event) => {
                  const aggregation = event.target.value as SummaryMetric["aggregation"];
                  const percentageAllowed = ["average", "sum", "min", "max", "mode"].includes(aggregation);
                  const relativeAllowed = aggregation !== "mode";
                  const formatAllowed = metric.format === undefined || metric.format === "number" ||
                    (metric.format === "percentage" && percentageAllowed) ||
                    (metric.format !== "percentage" && relativeAllowed);
                  updateMetric(metric.id, {
                    aggregation,
                    ...(!formatAllowed ? { format: "number" } : {}),
                  });
                }}>
                  {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <label className="metric-format-row">
                <span>Display format</span>
                <select value={metric.format ?? "number"} onChange={(event) => updateMetric(metric.id, { format: event.target.value as SummaryMetric["format"] })}>
                  <option value="number">Standard number</option>
                  {canUseRelativeFormats && <option value="compact">Compact (4K, 5M, 1T)</option>}
                  {canShowPercentage && <option value="percentage">Percentage</option>}
                  {canUseRelativeFormats && <option value="percent_root">% of root node</option>}
                  {canUseRelativeFormats && <option value="percent_parent">% of parent node</option>}
                </select>
              </label>
              <div className="metric-editor__actions">
                <label>
                  <input type="checkbox" checked={metric.highlighted} disabled={metric.target} onChange={(event) => updateMetric(metric.id, { highlighted: event.target.checked })} />
                  <span>Highlight in node</span>
                </label>
                {metric.target
                  ? <span className="metric-editor__managed">Managed in Target</span>
                  : <button className="remove-metric-button" type="button" aria-label={`Remove ${metric.variable} summary`} onClick={() => onMetricsChange(metrics.filter((item) => item.id !== metric.id))}>Remove</button>}
              </div>
            </div>
          );
        })}
      </section>
      )}
    </div>
  );
}
