import type { ParsedDataset } from "./dataset";
import type { TargetSettings } from "./target-settings";

type Props = {
  dataset: ParsedDataset;
  target: string;
  settings: TargetSettings;
  error: string;
  onTargetChange: (target: string) => void;
  onSettingsChange: (settings: TargetSettings) => void;
};

const options: Array<{ key: keyof TargetSettings; title: string; detail: string }> = [
  {
    key: "useForRecommendations",
    title: "Use for recommended splits",
    detail: "Automatically use this target and hide the target selector in Split.",
  },
  {
    key: "useForTests",
    title: "Use for tree tests",
    detail: "Automatically measure homogeneity and separation using this target.",
  },
  {
    key: "useForDistribution",
    title: "Compare in Distribution",
    detail: "Overlay the average target on histograms for other numeric variables.",
  },
  {
    key: "showHighlightedMetric",
    title: "Show as highlighted metric",
    detail: "Add a special target summary as the final metric in every node.",
  },
];

export function TargetPane({ dataset, target, settings, error, onTargetChange, onSettingsChange }: Props) {
  return (
    <div className="target-pane">
      <section className="settings-section">
        <label className="field-label" htmlFor="project-target">Target</label>
        <select id="project-target" value={target} onChange={(event) => onTargetChange(event.target.value)}>
          <option value="">Choose a target</option>
          {dataset.columns.map((column) => <option key={column} value={column}>{column}</option>)}
        </select>
        {error && <p className="form-error" role="alert">{error}</p>}
        {!target && (
          <label className="setting-check-row target-dismiss-row">
            <input
              type="checkbox"
              checked={settings.dismissTargetReminder}
              onChange={(event) => onSettingsChange({ ...settings, dismissTargetReminder: event.target.checked })}
            />
            <span>
              <strong>Continue without a target</strong>
              <small>Stop the reminder for this project. Features configured to use the target automatically will remain unavailable.</small>
            </span>
          </label>
        )}
      </section>

      <section className="target-uses" aria-label="Automatic target uses">
        {options.map(({ key, title, detail }) => (
          <label className="setting-check-row" key={key}>
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={(event) => onSettingsChange({ ...settings, [key]: event.target.checked })}
            />
            <span><strong>{title}</strong><small>{detail}</small></span>
          </label>
        ))}
      </section>
    </div>
  );
}
