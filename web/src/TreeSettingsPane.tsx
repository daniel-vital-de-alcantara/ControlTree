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
  onVariableTypeChange: (variable: string, type: VariableType) => void;
};

export function TreeSettingsPane({ section, dataset, appearance, nodeFields, metrics, selectedNode, onAppearanceChange, onNodeFieldsChange, onMetricsChange, onNodeTitleChange, onVariableTypeChange }: Props) {
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
                className="text-input"
                id="selected-node-name"
                value={selectedNode.title}
                onChange={(event) => onNodeTitleChange(event.target.value)}
                onBlur={(event) => { if (!event.target.value.trim()) onNodeTitleChange("Untitled node"); }}
              />
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
            ["rowCount", "Row count"],
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
          const canShowPercentage = metric.aggregation === "average" || metric.aggregation === "sum" || metric.aggregation === "min" || metric.aggregation === "max" || metric.aggregation === "mode";
          return (
            <div className={`metric-editor${metric.target ? " metric-editor--target" : ""}`} key={metric.id}>
              <div className="metric-editor__heading">
                <strong>{metric.target ? "Target metric" : `Metric ${index + 1}`}</strong>
                <div>
                  <button type="button" disabled={index === 0} aria-label={`Move ${metric.variable} metric up`} onClick={() => moveMetric(index, -1)}>↑</button>
                  <button type="button" disabled={index === metrics.length - 1} aria-label={`Move ${metric.variable} metric down`} onClick={() => moveMetric(index, 1)}>↓</button>
                </div>
              </div>
              <div className="metric-editor__inputs">
                <select value={metric.variable} disabled={metric.target} aria-label={metric.target ? "Project target variable" : "Metric variable"} onChange={(event) => {
                  const variable = event.target.value;
                  updateMetric(metric.id, {
                    variable,
                    aggregation: isNumericVariable(dataset, variable) ? metric.aggregation : "mode",
                  });
                }}>
                  {dataset.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                </select>
                <select value={metric.aggregation} onChange={(event) => updateMetric(metric.id, { aggregation: event.target.value as SummaryMetric["aggregation"] })}>
                  {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="metric-editor__actions">
                <label>
                  <input type="checkbox" checked={metric.highlighted} disabled={metric.target} onChange={(event) => updateMetric(metric.id, { highlighted: event.target.checked })} />
                  <span>Highlight in node</span>
                </label>
                {canShowPercentage && (
                  <label>
                    <input type="checkbox" checked={metric.format === "percentage"} onChange={(event) => updateMetric(metric.id, { format: event.target.checked ? "percentage" : "number" })} />
                    <span>Show as percentage</span>
                  </label>
                )}
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
