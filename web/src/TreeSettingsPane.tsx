import type { ParsedDataset } from "./dataset";
import {
  allAggregations,
  defaultAppearance,
  isNumericVariable,
  type NodeFieldVisibility,
  type SummaryMetric,
  type TreeAppearance,
} from "./tree-settings";

type Props = {
  dataset?: ParsedDataset;
  appearance: TreeAppearance;
  nodeFields: NodeFieldVisibility;
  metrics: SummaryMetric[];
  onAppearanceChange: (appearance: TreeAppearance) => void;
  onNodeFieldsChange: (fields: NodeFieldVisibility) => void;
  onMetricsChange: (metrics: SummaryMetric[]) => void;
};

export function TreeSettingsPane({ dataset, appearance, nodeFields, metrics, onAppearanceChange, onNodeFieldsChange, onMetricsChange }: Props) {
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
    }]);
  }

  return (
    <div className="tree-settings">
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

      <section className="settings-section">
        <div className="settings-section__heading">
          <div>
            <p className="kicker">Node content</p>
            <h3>Metrics</h3>
          </div>
        </div>
        <p className="settings-help">Choose the standard fields shown in every node, then add as many calculated metrics as you need.</p>
        <div className="metric-visibility-list">
          {([
            ["nodeName", "Node name"],
            ["nodeTitle", "Node title"],
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
        {dataset && metrics.map((metric) => {
          const numeric = isNumericVariable(dataset, metric.variable);
          const options = allAggregations.filter((item) => numeric || item.value === "count" || item.value === "distinct" || item.value === "missing");
          return (
            <div className="metric-editor" key={metric.id}>
              <div className="metric-editor__inputs">
                <select value={metric.variable} onChange={(event) => {
                  const variable = event.target.value;
                  updateMetric(metric.id, {
                    variable,
                    aggregation: isNumericVariable(dataset, variable) ? metric.aggregation : "distinct",
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
                  <input type="checkbox" checked={metric.highlighted} onChange={(event) => updateMetric(metric.id, { highlighted: event.target.checked })} />
                  <span>Highlight in node</span>
                </label>
                <button className="remove-metric-button" type="button" aria-label={`Remove ${metric.variable} summary`} onClick={() => onMetricsChange(metrics.filter((item) => item.id !== metric.id))}>Remove</button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
