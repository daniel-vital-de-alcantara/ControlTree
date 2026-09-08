import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { DataSetup, type DatasetSelection } from "./DataSetup";
import { summarizeTarget } from "./dataset";
import { splitCandidates, initialTree } from "./demo-data";
import { DistributionPane } from "./DistributionPane";
import { createDistributionSnapshot, type DistributionSettings } from "./distribution";
import { applyManualSplit, applySplit, describeRule, findTreeNode, type ManualSplitResult, type SplitCandidate, type TreeNode } from "./domain";
import { ManualSplitPane } from "./ManualSplitPane";
import { openPresentationWindow, presentationTree, publishPresentation, type PresentationState } from "./presentation";
import { createProject, downloadProject, type ControlTreeProject } from "./project-file";
import { replayProject } from "./replay";
import { TreeCanvas } from "./TreeCanvas";
import { TreeSettingsPane } from "./TreeSettingsPane";
import { fetchSplitSuggestions } from "./suggestions";
import { buildNodeSummaries, defaultAppearance, defaultNodeFields, type NodeFieldVisibility, type SummaryMetric, type TreeAppearance } from "./tree-settings";

export default function App() {
  const [selection, setSelection] = useState<DatasetSelection | "demo" | null>(null);
  const [tree, setTree] = useState<TreeNode>(initialTree);
  const [selectedNodeId, setSelectedNodeId] = useState("root");
  const [selectedSplitId, setSelectedSplitId] = useState(splitCandidates[0].id);
  const [candidateCache, setCandidateCache] = useState<Record<string, SplitCandidate[]>>({});
  const [suggestionStatus, setSuggestionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [suggestionError, setSuggestionError] = useState("");
  const [sidebarMode, setSidebarMode] = useState<"node" | "tree">("node");
  const [nodeTab, setNodeTab] = useState<"recommended" | "manual" | "distribution">("recommended");
  const [appearance, setAppearance] = useState<TreeAppearance>(defaultAppearance);
  const [nodeFields, setNodeFields] = useState<NodeFieldVisibility>(defaultNodeFields);
  const [summaryMetrics, setSummaryMetrics] = useState<SummaryMetric[]>([]);
  const [targetError, setTargetError] = useState("");
  const [distributionSettings, setDistributionSettings] = useState<DistributionSettings | null>(null);
  const [showDistributionInPresentation, setShowDistributionInPresentation] = useState(false);
  const candidates = selection === "demo"
    ? selectedNodeId === "root" ? splitCandidates : []
    : candidateCache[selectedNodeId] ?? [];
  const selectedSplit = candidates.find((split) => split.id === selectedSplitId);
  const splitApplied = tree.children.length > 0;
  const selectedNode = findTreeNode(tree, selectedNodeId);
  const selectedNodeHasSplit = Boolean(selectedNode?.children.length);
  const canSplitSelectedNode = selection !== "demo" || selectedNodeId === "root";
  const uploadedDataset = selection && selection !== "demo" ? selection.dataset : undefined;
  const recommendationTarget = selection === "demo" ? "survived" : selection?.recommendationTarget ?? null;
  const nodeSummaries = useMemo(
    () => buildNodeSummaries(tree, uploadedDataset, summaryMetrics),
    [tree, uploadedDataset, summaryMetrics],
  );
  const presentationDistribution = useMemo(() => {
    if (!showDistributionInPresentation || !uploadedDataset || !selectedNode || !distributionSettings) return undefined;
    return createDistributionSnapshot(uploadedDataset, selectedNode, distributionSettings);
  }, [showDistributionInPresentation, uploadedDataset, selectedNode, distributionSettings]);
  const presentationState = useMemo<PresentationState | null>(() => {
    if (!selection) return null;
    return {
      tree: presentationTree(tree),
      appearance,
      nodeFields,
      summaries: nodeSummaries,
      summaryCount: summaryMetrics.length,
      datasetName: selection === "demo" ? "Titanic" : selection.dataset.fileName,
      targetName: recommendationTarget ?? undefined,
      distribution: presentationDistribution,
    };
  }, [selection, tree, appearance, nodeFields, nodeSummaries, summaryMetrics.length, presentationDistribution, recommendationTarget]);

  useEffect(() => {
    if (!selection || selection === "demo") return;
    if (!selection.recommendationTarget) {
      setSelectedSplitId("");
      setSuggestionStatus("idle");
      return;
    }
    const node = findTreeNode(tree, selectedNodeId);
    if (!node?.rowIndices) return;
    const cached = candidateCache[selectedNodeId];
    if (cached) {
      setSelectedSplitId(cached[0]?.id ?? "");
      setSuggestionStatus("ready");
      return;
    }
    const controller = new AbortController();
    setSuggestionStatus("loading");
    setSuggestionError("");
    fetchSplitSuggestions(selection.dataset, selection.recommendationTarget, node.rowIndices, controller.signal)
      .then((nextCandidates) => {
        setCandidateCache((current) => ({ ...current, [selectedNodeId]: nextCandidates }));
        setSelectedSplitId(nextCandidates[0]?.id ?? "");
        setSuggestionStatus("ready");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setSuggestionError(reason instanceof Error ? reason.message : "Could not compute suggestions.");
        setSuggestionStatus("error");
      });
    return () => controller.abort();
  }, [selection, selectedNodeId, tree, candidateCache]);

  useEffect(() => {
    if (presentationState) publishPresentation(presentationState);
  }, [presentationState]);

  function handleApply() {
    if (!selectedSplit) return;
    setTree((current) => applySplit(current, selectedNodeId, selectedSplit));
    setCandidateCache((current) => Object.fromEntries(
      Object.entries(current).filter(([nodeId]) => !nodeId.startsWith(`${selectedNodeId}.`)),
    ));
    setSelectedNodeId(`${selectedNodeId}.1`);
    setSuggestionStatus("loading");
  }

  function handleManualApply(split: ManualSplitResult) {
    const nodeId = selectedNodeId;
    setTree((current) => applyManualSplit(current, nodeId, split));
    setCandidateCache((current) => Object.fromEntries(
      Object.entries(current).filter(([cachedNodeId]) => !cachedNodeId.startsWith(`${nodeId}.`)),
    ));
    setSelectedNodeId(`${nodeId}.1`);
    setNodeTab("recommended");
    setSuggestionStatus("loading");
  }

  function handleReset() {
    if (selection && selection !== "demo") {
      setTree({
        id: "root",
        title: "All rows",
        samples: selection.dataset.rows.length,
        rowIndices: selection.dataset.rows.map((_, index) => index),
        children: [],
      });
    } else {
      setTree(initialTree);
    }
    setSelectedNodeId("root");
  }

  function handleDataset(selectionValue: DatasetSelection) {
    setCandidateCache({});
    setSummaryMetrics([]);
    setTargetError("");
    setDistributionSettings({
      variable: selectionValue.dataset.columns[0],
      binWidth: null,
      scale: "count",
    });
    setShowDistributionInPresentation(false);
    setSelection(selectionValue);
    setTree({
      id: "root",
      title: "All rows",
      samples: selectionValue.dataset.rows.length,
      rowIndices: selectionValue.dataset.rows.map((_, index) => index),
      children: [],
    });
    setSelectedNodeId("root");
  }

  async function handleResume(selectionValue: DatasetSelection, project: ControlTreeProject) {
    const restoredTree = await replayProject(selectionValue.dataset, project);
    setCandidateCache({});
    setSelection(selectionValue);
    setTree(restoredTree);
    setAppearance(project.appearance);
    setNodeFields(project.nodeFields);
    setTargetError("");
    setDistributionSettings(project.distribution && selectionValue.dataset.columns.includes(project.distribution.variable)
      ? project.distribution
      : {
          variable: selectionValue.dataset.columns[0],
          binWidth: null,
          scale: "count",
        });
    setShowDistributionInPresentation(false);
    setSummaryMetrics(project.summaries.map((metric, index) => ({
      ...metric,
      id: `saved-${index + 1}`,
    })));
    setSelectedNodeId("root");
    setSidebarMode("node");
    setNodeTab("recommended");
  }

  function handleTargetChange(nextTarget: string) {
    if (!selection || selection === "demo" || nextTarget === selection.recommendationTarget) return;
    if (!nextTarget) {
      setSelection({ ...selection, recommendationTarget: null });
      setCandidateCache({});
      setSelectedSplitId("");
      setSuggestionStatus("idle");
      setTargetError("");
      return;
    }
    try {
      summarizeTarget(selection.dataset, nextTarget);
      setTargetError("");
      setSelection({
        ...selection,
        recommendationTarget: nextTarget,
      });
      setCandidateCache({});
      setSelectedSplitId("");
      setSuggestionStatus("loading");
    } catch (reason) {
      setTargetError(reason instanceof Error ? reason.message : "This target cannot be used.");
    }
  }

  function handleDemo() {
    setSummaryMetrics([]);
    setSelection("demo");
    setTree(initialTree);
    setSelectedSplitId(splitCandidates[0].id);
    setSelectedNodeId("root");
    setDistributionSettings(null);
    setShowDistributionInPresentation(false);
  }

  if (!selection) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="#" aria-label="ControlTree home">
            <span className="brand__mark" aria-hidden="true">⌁</span>
            ControlTree
          </a>
        </header>
        <DataSetup onContinue={handleDataset} onResume={handleResume} onUseDemo={handleDemo} />
      </div>
    );
  }

  const datasetName = selection === "demo" ? "Titanic" : selection.dataset.fileName;
  const rowCount = selection === "demo" ? 891 : selection.dataset.rows.length;
  const canvasStyle = {
    "--tree-node-color": appearance.nodeColor,
    "--tree-accent-color": appearance.accentColor,
    "--tree-connector-color": appearance.connectorColor,
    "--tree-background-color": appearance.backgroundColor,
    "--tree-grid-opacity": appearance.showGrid ? .32 : 0,
    "--summary-count": summaryMetrics.length,
    "--visible-field-count": Object.values(nodeFields).filter(Boolean).length,
  } as CSSProperties;

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSidebarMode("node");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#workspace" aria-label="ControlTree home">
          <span className="brand__mark" aria-hidden="true">⌁</span>
          ControlTree
        </a>
        <div className="dataset-pill"><span /> {datasetName} · {rowCount.toLocaleString()} rows{recommendationTarget ? ` · recommendation target: ${recommendationTarget}` : ""}</div>
        <button className="present-button" type="button" onClick={() => presentationState && openPresentationWindow(presentationState)}>Present tree <span aria-hidden="true">↗</span></button>
        <button
          className="quiet-button"
          type="button"
          onClick={() => downloadProject(createProject(tree, recommendationTarget, appearance, nodeFields, summaryMetrics, distributionSettings), datasetName)}
        >Save tree ↓</button>
        <button className="quiet-button" type="button" onClick={() => setSelection(null)}>Change data</button>
        <button className="quiet-button" type="button" onClick={handleReset}>Reset tree</button>
      </header>

      <main id="workspace" className="workspace">
        <section className="canvas-panel">
          <div className="section-heading">
            <div>
              <p className="kicker">Manual decision tree</p>
              <h1>Make every split intentional.</h1>
            </div>
            <div className="status"><span /> Draft</div>
          </div>
          <div className="canvas" style={canvasStyle}>
            <div className="canvas__grid" />
            <TreeCanvas
              node={tree}
              selectedNodeId={selectedNodeId}
              onSelectNode={selectNode}
              summaries={nodeSummaries}
              nodeFields={nodeFields}
            />
            {!splitApplied && <p className="canvas__hint">Choose a suggestion, then apply it to grow the tree.</p>}
          </div>
        </section>

        <aside className="inspector" aria-label="Split inspector">
          <div className="pane-switch" role="tablist" aria-label="Configuration scope">
            <button className={sidebarMode === "node" ? "active" : ""} type="button" onClick={() => setSidebarMode("node")}>Node</button>
            <button className={sidebarMode === "tree" ? "active" : ""} type="button" onClick={() => setSidebarMode("tree")}>Tree</button>
          </div>

          {sidebarMode === "tree" ? (
            <TreeSettingsPane
              dataset={uploadedDataset}
              appearance={appearance}
              nodeFields={nodeFields}
              metrics={summaryMetrics}
              onAppearanceChange={setAppearance}
              onNodeFieldsChange={setNodeFields}
              onMetricsChange={setSummaryMetrics}
            />
          ) : (
            <>
              <div className="inspector__heading">
                <p className="kicker">Selected node</p>
                <h2>{selectedNode?.title ?? selectedNodeId}</h2>
                <p>{selectedNode?.samples.toLocaleString()} rows</p>
              </div>
              <div className="subtabs" role="tablist" aria-label="Split method">
                <button className={nodeTab === "recommended" ? "active" : ""} type="button" onClick={() => setNodeTab("recommended")}>Recommended</button>
                <button className={nodeTab === "manual" ? "active" : ""} type="button" onClick={() => setNodeTab("manual")}>Manual split</button>
                <button className={nodeTab === "distribution" ? "active" : ""} type="button" onClick={() => setNodeTab("distribution")}>Distribution</button>
              </div>

              {nodeTab === "distribution" ? (
                uploadedDataset && selectedNode?.rowIndices && distributionSettings ? (
                  <DistributionPane
                    dataset={uploadedDataset}
                    node={selectedNode}
                    settings={distributionSettings}
                    showInPresentation={showDistributionInPresentation}
                    onSettingsChange={setDistributionSettings}
                    onShowInPresentationChange={setShowDistributionInPresentation}
                  />
                ) : (
                  <div className="empty-state">Upload a dataset to explore selected-node distributions.</div>
                )
              ) : nodeTab === "manual" ? (
                uploadedDataset && selectedNode?.rowIndices ? (
                  <ManualSplitPane
                    key={selectedNode.id}
                    dataset={uploadedDataset}
                    node={selectedNode}
                    onApply={handleManualApply}
                  />
                ) : (
                  <div className="empty-state">Upload a dataset to create manual multiway splits.</div>
                )
              ) : (
                <>
                  {uploadedDataset && (
                    <div className="recommendation-target">
                      <label className="field-label" htmlFor="recommendation-target">Recommendation target</label>
                      <select id="recommendation-target" value={recommendationTarget ?? ""} onChange={(event) => handleTargetChange(event.target.value)}>
                        <option value="">Choose a target</option>
                        {uploadedDataset.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                      </select>
                      <p>Used only to rank recommended splits.</p>
                      {targetError && <p className="form-error" role="alert">{targetError}</p>}
                    </div>
                  )}
                  {canSplitSelectedNode && candidates.length > 0 ? (
                    <div className="suggestions" role="radiogroup" aria-label="Split suggestions">
                      {candidates.map((candidate, index) => (
                        <label className={`suggestion${selectedSplitId === candidate.id ? " suggestion--selected" : ""}`} key={candidate.id}>
                          <input
                            type="radio"
                            name="split"
                            value={candidate.id}
                            checked={selectedSplitId === candidate.id}
                            onChange={() => setSelectedSplitId(candidate.id)}
                          />
                          <span className="suggestion__rank">{String(index + 1).padStart(2, "0")}</span>
                          <span className="suggestion__body">
                            <strong>{describeRule(candidate)}</strong>
                            <span>{candidate.leftCount} / {candidate.rightCount} rows</span>
                          </span>
                          <span className="gain">+{candidate.gain.toFixed(3)}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      {canSplitSelectedNode && suggestionStatus === "loading"
                        ? "Computing split suggestions…"
                        : canSplitSelectedNode && suggestionStatus === "error"
                          ? suggestionError
                          : selection === "demo" && selectedNodeId !== "root"
                            ? "Upload a dataset to compute consecutive split suggestions."
                          : canSplitSelectedNode && !recommendationTarget
                            ? "Choose a recommendation target to calculate split suggestions."
                          : canSplitSelectedNode
                            ? "No valid split meets the minimum branch size for this dataset."
                        : "Select a node to continue."}
                    </div>
                  )}

                  {selectedSplit && (
                    <>
                      <div className="selection-summary">
                        <span>{selectedSplit.criterion ?? "Expected gain"}</span>
                        <strong>{selectedSplit.gain.toFixed(4)}</strong>
                      </div>
                      <button className="primary-button" type="button" onClick={handleApply} disabled={!canSplitSelectedNode}>
                        {selectedNodeHasSplit ? "Replace node split" : "Apply selected split"}
                        <span aria-hidden="true">→</span>
                      </button>
                    </>
                  )}
                  <p className="prototype-note">Suggestions are recalculated for this node's rows and target type.</p>
                </>
              )}
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
