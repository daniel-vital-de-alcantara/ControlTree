import { useRef, useState, type ChangeEvent } from "react";

import {
  parseDatasetFile,
  type ParsedDataset,
} from "./dataset";
import { readProjectFile, type ControlTreeProject } from "./project-file";

export type DatasetSelection = {
  dataset: ParsedDataset;
  recommendationTarget: string | null;
};

type Props = {
  onContinue: (selection: DatasetSelection) => void;
  onResume: (selection: DatasetSelection, project: ControlTreeProject) => Promise<void>;
  onUseDemo: () => void;
};

export function DataSetup({ onContinue, onResume, onUseDemo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsReading(true);
    setError("");
    try {
      const parsed = await parseDatasetFile(file);
      setDataset(parsed);
    } catch (reason) {
      setDataset(null);
      setError(reason instanceof Error ? reason.message : "The file could not be read.");
    } finally {
      setIsReading(false);
      event.target.value = "";
    }
  }

  function handleContinue() {
    if (!dataset) return;
    setError("");
    onContinue({ dataset, recommendationTarget: null });
  }

  async function handleProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !dataset) return;
    setIsResuming(true);
    setError("");
    try {
      const project = await readProjectFile(file);
      const missingVariable = project.summaries.find((metric) => !dataset.columns.includes(metric.variable))?.variable;
      if (missingVariable) {
        throw new Error(`The saved summary variable “${missingVariable}” is not present in this dataset.`);
      }
      await onResume(
        {
          dataset,
          recommendationTarget: project.recommendationTarget && dataset.columns.includes(project.recommendationTarget)
            ? project.recommendationTarget
            : null,
        },
        project,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved tree could not be opened.");
    } finally {
      setIsResuming(false);
      event.target.value = "";
    }
  }

  return (
    <main className="setup-page">
      <section className="setup-intro">
        <p className="kicker">New decision tree</p>
        <h1>Start with your data.</h1>
        <p>Choose a CSV or Excel workbook. Your data stays in this browser and is never uploaded.</p>
      </section>

      <section className="setup-card" aria-label="Dataset setup">
        <div className="setup-step">
          <span className="step-number">01</span>
          <div>
            <h2>Choose a dataset</h2>
            <p>Use the first row for column names. Excel imports use the first worksheet.</p>
          </div>
        </div>

        <input
          ref={inputRef}
          className="file-input"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFile}
        />
        <button className="upload-button" type="button" onClick={() => inputRef.current?.click()}>
          <span aria-hidden="true">↑</span>
          <span>
            <strong>{isReading ? "Reading file…" : dataset?.fileName ?? "Choose CSV or Excel file"}</strong>
            <small>{dataset ? `${dataset.rows.length.toLocaleString()} rows · ${dataset.columns.length} columns` : ".csv or .xlsx"}</small>
          </span>
        </button>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button
          className="primary-button setup-continue"
          type="button"
          disabled={!dataset || isReading}
          onClick={handleContinue}
        >
          Open tree workspace
          <span aria-hidden="true">→</span>
        </button>
        <p className="setup-target-note">No target is required. Choose one later only when you want recommended splits.</p>

        <div className="setup-choice"><span>or</span></div>

        <input
          ref={projectInputRef}
          className="file-input"
          type="file"
          accept=".json,application/json"
          onChange={handleProject}
        />
        <button
          className="resume-button"
          type="button"
          disabled={!dataset || isReading || isResuming}
          onClick={() => projectInputRef.current?.click()}
        >
          <span>
            <strong>{isResuming ? "Rebuilding saved tree…" : "Continue from a saved tree"}</strong>
            <small>Choose a .controltree.json configuration</small>
          </span>
          <span aria-hidden="true">↗</span>
        </button>

        <button className="demo-button" type="button" onClick={onUseDemo}>Or explore with the Titanic demo</button>
      </section>
    </main>
  );
}
