import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  parseDatasetFile,
  type ParsedDataset,
} from "./dataset";
import { pickDatasetFile, rememberedDatasetFile } from "./file-picker";
import { readProjectFile, type ControlTreeProject } from "./project-file";
import { loadSampleDataset, sampleDatasets, type SampleDatasetDefinition } from "./sample-datasets";

export type DatasetSelection = {
  dataset: ParsedDataset;
  recommendationTarget: string | null;
};

type Props = {
  onContinue: (selection: DatasetSelection) => void;
  onResume: (selection: DatasetSelection, project: ControlTreeProject, projectFileName: string) => Promise<void>;
  onUseSample: (selection: DatasetSelection) => void;
};

export function DataSetup({ onContinue, onResume, onUseSample }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [readingFileName, setReadingFileName] = useState("");
  const [readingExcel, setReadingExcel] = useState(false);
  const [readSeconds, setReadSeconds] = useState(0);
  const [isResuming, setIsResuming] = useState(false);
  const [loadingSampleId, setLoadingSampleId] = useState<SampleDatasetDefinition["id"] | null>(null);
  const [pendingProject, setPendingProject] = useState<{ project: ControlTreeProject; fileName: string } | null>(null);
  const [setupMode, setSetupMode] = useState<"choose" | "new" | "existing">("choose");

  useEffect(() => {
    if (!isReading) return;
    const started = Date.now();
    setReadSeconds(0);
    const timer = window.setInterval(() => {
      setReadSeconds(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [isReading]);

  async function readDataset(file: File, projectToResume = pendingProject) {
    setIsReading(true);
    setReadingFileName(file.name);
    setReadingExcel(file.name.toLowerCase().endsWith(".xlsx"));
    setError("");
    try {
      const parsed = await parseDatasetFile(file);
      setDataset(parsed);
      if (projectToResume) await resumeProject(parsed, projectToResume.project, projectToResume.fileName);
    } catch (reason) {
      setDataset(null);
      setError(reason instanceof Error ? reason.message : "The file could not be read.");
    } finally {
      setIsReading(false);
    }
  }

  async function chooseDataset() {
    try {
      const file = await pickDatasetFile();
      if (file === undefined) inputRef.current?.click();
      else if (file) await readDataset(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The file picker could not be opened.");
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await readDataset(file);
  }

  function handleContinue() {
    if (!dataset) return;
    setError("");
    onContinue({ dataset, recommendationTarget: null });
  }

  async function resumeProject(sourceDataset: ParsedDataset, project: ControlTreeProject, projectFileName: string) {
    setIsResuming(true);
    setError("");
    try {
      const missingVariable = project.summaries.find((metric) => !sourceDataset.columns.includes(metric.variable))?.variable;
      if (missingVariable) {
        throw new Error(`The saved summary variable “${missingVariable}” is not present in this dataset.`);
      }
      await onResume(
        {
          dataset: sourceDataset,
          recommendationTarget: project.recommendationTarget && sourceDataset.columns.includes(project.recommendationTarget)
            ? project.recommendationTarget
            : null,
        },
        project,
        projectFileName,
      );
      setPendingProject(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved tree could not be opened.");
    } finally {
      setIsResuming(false);
    }
  }

  async function handleProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      const project = await readProjectFile(file);
      if (dataset) await resumeProject(dataset, project, file.name);
      else {
        const rememberedDataset = await rememberedDatasetFile(project);
        if (rememberedDataset) await readDataset(rememberedDataset, { project, fileName: file.name });
        else setPendingProject({ project, fileName: file.name });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved tree could not be opened.");
    }
  }

  function chooseMode(mode: "new" | "existing") {
    setSetupMode(mode);
    setError("");
    setPendingProject(null);
    if (mode === "existing") setDataset(null);
  }

  function returnToChoice() {
    setSetupMode("choose");
    setError("");
    setPendingProject(null);
    setDataset(null);
  }

  async function handleSample(sample: SampleDatasetDefinition) {
    setLoadingSampleId(sample.id);
    setError("");
    try {
      const sampleDataset = await loadSampleDataset(sample.id);
      setDataset(sampleDataset);
      if (pendingProject) await resumeProject(sampleDataset, pendingProject.project, pendingProject.fileName);
      else onUseSample({ dataset: sampleDataset, recommendationTarget: sample.target });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The sample dataset could not be opened.");
    } finally {
      setLoadingSampleId(null);
    }
  }

  return (
    <main className="setup-page">
      <section className="setup-intro">
        <p className="kicker">{setupMode === "new" ? "New tree" : setupMode === "existing" ? "Existing tree" : "ControlTree"}</p>
        <h1>{setupMode === "new" ? "Choose your data." : setupMode === "existing" ? "Continue your work." : "Where would you like to start?"}</h1>
        <p>{setupMode === "new"
          ? "Use your own CSV or Excel workbook, or begin with an included sample."
          : setupMode === "existing"
            ? "Open a saved ControlTree project. Your data remains on this device."
            : "Build a new decision tree or return to one you have already saved. Your data is processed privately on this device."}</p>
      </section>

      <section className="setup-card" aria-label="Dataset setup">
        {setupMode === "choose" && (
          <div className="setup-routes">
            <button className="setup-route setup-route--primary" type="button" onClick={() => chooseMode("new")}>
              <span className="setup-route__icon" aria-hidden="true">＋</span>
              <span><strong>New tree</strong><small>Choose a dataset or explore an included sample.</small></span>
              <span aria-hidden="true">→</span>
            </button>
            <button className="setup-route" type="button" onClick={() => chooseMode("existing")}>
              <span className="setup-route__icon" aria-hidden="true">↗</span>
              <span><strong>Existing tree</strong><small>Open a saved .controltree.json project.</small></span>
              <span aria-hidden="true">→</span>
            </button>
            <p className="setup-privacy-note">CSV, Excel, and project files stay on your device.</p>
          </div>
        )}

        {setupMode !== "choose" && (
          <button className="setup-back" type="button" onClick={returnToChoice}><span aria-hidden="true">←</span> Start options</button>
        )}

        {setupMode === "new" && <>
          <div className="setup-step">
            <span className="step-number">01</span>
            <div>
              <h2>Use your own data</h2>
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
          <button className="upload-button" type="button" disabled={isReading || isResuming} onClick={chooseDataset}>
            <span aria-hidden="true">↑</span>
            <span>
              <strong>{isReading ? `Reading ${readingFileName}… ${readSeconds}s` : dataset?.fileName ?? "Choose CSV or Excel file"}</strong>
              <small>{isReading ? "Preparing your local dataset" : dataset ? `${dataset.rows.length.toLocaleString()} rows · ${dataset.columns.length} columns` : ".csv or .xlsx"}</small>
            </span>
          </button>

          {isReading && readingExcel && readSeconds >= 5 && (
            <p className="setup-import-tip" role="status">
              Excel is taking longer to process. Saving the worksheet as CSV is normally much faster.
            </p>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          <button
            className="primary-button setup-continue"
            type="button"
            disabled={!dataset || isReading}
            onClick={handleContinue}
          >
            Create tree
            <span aria-hidden="true">→</span>
          </button>
          <p className="setup-target-note">Next, ControlTree will guide you through the optional target and tree settings.</p>

          <div className="sample-heading">
            <span>Or start with a sample</span>
            <small>Included with ControlTree · works offline</small>
          </div>
          <div className="sample-grid">
            {sampleDatasets.map((sample) => (
              <article className={`sample-card${sample.featured ? " sample-card--featured" : ""}`} key={sample.id}>
                <button type="button" disabled={Boolean(loadingSampleId) || isReading || isResuming} onClick={() => void handleSample(sample)}>
                  <span className="sample-card__eyebrow">{sample.eyebrow}</span>
                  <strong>{loadingSampleId === sample.id ? "Opening sample…" : sample.title}</strong>
                  <p>{sample.description}</p>
                  <span className="sample-card__meta">{sample.sizeLabel} · Target: {sample.targetLabel}</span>
                  <span className="sample-card__open">Open sample <span aria-hidden="true">→</span></span>
                </button>
                <footer>
                  {sample.sourceUrl ? <a href={sample.sourceUrl} target="_blank" rel="noreferrer">{sample.sourceLabel} ↗</a> : <span>{sample.sourceLabel}</span>}
                  <span>{sample.license}</span>
                </footer>
              </article>
            ))}
          </div>
          <p className="sample-disclaimer">Sample datasets are for demonstration and education, not production credit decisions.</p>
        </>}

        {setupMode === "existing" && <>
          <div className="setup-step">
            <span className="step-number">01</span>
            <div>
              <h2>Choose your saved project</h2>
              <p>ControlTree will restore its splits, metrics, colors, and other settings.</p>
            </div>
          </div>
          <input
            ref={projectInputRef}
            className="file-input"
            type="file"
            accept=".json,application/json"
            onChange={handleProject}
          />
          <button
            className="resume-button resume-button--large"
            type="button"
            disabled={isReading || isResuming}
            onClick={() => projectInputRef.current?.click()}
          >
            <span>
              <strong>{isResuming ? "Rebuilding saved tree…" : pendingProject ? pendingProject.fileName : "Choose saved tree"}</strong>
              <small>{pendingProject ? "Project opened—now reconnect its dataset below." : ".controltree.json project file"}</small>
            </span>
            <span aria-hidden="true">↗</span>
          </button>

          {pendingProject && <>
            <div className="setup-step setup-step--followup">
              <span className="step-number">02</span>
              <div>
                <h2>Reconnect the dataset</h2>
                <p>The saved project expects {pendingProject.project.sourceFileName ?? "a compatible CSV or Excel file"}.</p>
              </div>
            </div>
            <input
              ref={inputRef}
              className="file-input"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFile}
            />
            <button className="upload-button" type="button" disabled={isReading || isResuming} onClick={chooseDataset}>
              <span aria-hidden="true">↑</span>
              <span>
                <strong>{isReading ? `Reading ${readingFileName}… ${readSeconds}s` : "Choose the source dataset"}</strong>
                <small>{isReading ? "Rebuilding your saved tree" : pendingProject.project.sourceFileName ?? ".csv or .xlsx"}</small>
              </span>
            </button>
            {isReading && readingExcel && readSeconds >= 5 && <p className="setup-import-tip" role="status">Excel is taking longer to process. CSV is normally much faster.</p>}
          </>}

          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="setup-local-note">In the local Python version, Chrome or Edge can automatically reuse the last matching dataset after you have granted file access. GitHub Pages always asks you to reconnect it.</p>
        </>}
      </section>
    </main>
  );
}
