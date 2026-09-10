import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

import { DataSetup, type DatasetSelection } from "./DataSetup";
import { downloadEnrichedCsv } from "./data-export";
import { parseDatasetFile, summarizeTarget, type VariableType } from "./dataset";
import { splitCandidates, initialTree } from "./demo-data";
import { DistributionPane } from "./DistributionPane";
import { createDistributionSnapshot, type DistributionSettings } from "./distribution";
import { applySplit, describeRule, findTreeNode, renameTreeNode, type ManualSplitResult, type SplitCandidate, type TreeNode } from "./domain";
import { ManualSplitPane } from "./ManualSplitPane";
import { pickDatasetFile } from "./file-picker";
import { openPresentationWindow, presentationTree, publishPresentation, type PresentationState } from "./presentation";
import { PresentationView } from "./PresentationView";
import { createProject, projectFingerprint as fingerprintProject, saveProjectAs, type ControlTreeProject } from "./project-file";
import { replayProject } from "./replay";
import { candidateMatchesCurrentSplit, SplitPane } from "./SplitPane";
import { copySplitsToClipboard, pasteCopiedSplits, readSplitsFromClipboard } from "./split-clipboard";
import { applyPreparedSplit, preparedManualSplit, preparedRecommendedSplit, removeNodeSplit, type SplitApplication } from "./split-operations";
import { TreeCanvas } from "./TreeCanvas";
import { downloadTreePng } from "./tree-image";
import { TreeSettingsPane } from "./TreeSettingsPane";
import { TreeTestPane } from "./TreeTestPane";
import { TargetPane } from "./TargetPane";
import { defaultTargetSettings, type TargetSettings } from "./target-settings";
import { fetchSplitSuggestions } from "./suggestions";
import { buildNodeSummaries, defaultAppearance, defaultNodeFields, isNumericVariable, type NodeFieldVisibility, type SummaryMetric, type TreeAppearance } from "./tree-settings";
import { visibleTree } from "./tree-visibility";

export default function App() {
  const [selection, setSelection] = useState<DatasetSelection | "demo" | null>(null);
  const [tree, setTree] = useState<TreeNode>(initialTree);
  const [selectedNodeId, setSelectedNodeId] = useState("root");
  const [selectedSplitId, setSelectedSplitId] = useState(splitCandidates[0].id);
  const [candidateCache, setCandidateCache] = useState<Record<string, SplitCandidate[]>>({});
  const [suggestionStatus, setSuggestionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionElapsed, setSuggestionElapsed] = useState(0);
  const [splitFeature, setSplitFeature] = useState("");
  const [sidebarMode, setSidebarMode] = useState<"node" | "tree" | "metrics" | "variables" | "target" | "test" | "present" | "more">("node");
  const [nodeTab, setNodeTab] = useState<"recommended" | "manual" | "distribution">("recommended");
  const [appearance, setAppearance] = useState<TreeAppearance>(defaultAppearance);
  const [nodeFields, setNodeFields] = useState<NodeFieldVisibility>(defaultNodeFields);
  const [summaryMetrics, setSummaryMetrics] = useState<SummaryMetric[]>([]);
  const [targetSettings, setTargetSettings] = useState<TargetSettings>(defaultTargetSettings);
  const [targetError, setTargetError] = useState("");
  const [distributionSettings, setDistributionSettings] = useState<DistributionSettings | null>(null);
  const [testVariable, setTestVariable] = useState("");
  const [showDistributionInPresentation, setShowDistributionInPresentation] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [presentHere, setPresentHere] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [projectFileName, setProjectFileName] = useState("Untitled tree");
  const [savedProjectFingerprint, setSavedProjectFingerprint] = useState<string | null>(null);
  const [homeWarningOpen, setHomeWarningOpen] = useState(false);
  const [dataSourceError, setDataSourceError] = useState("");
  const [isChangingDataSource, setIsChangingDataSource] = useState(false);
  const [isExportingTreeImage, setIsExportingTreeImage] = useState(false);
  const [paneWidth, setPaneWidth] = useState(390);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<string[]>([]);
  const [nodeNameHistory, setNodeNameHistory] = useState<string[]>([]);
  const [renameRequestId, setRenameRequestId] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dataSourceInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const paneResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const candidates = selection === "demo"
    ? selectedNodeId === "root" ? splitCandidates : []
    : candidateCache[selectedNodeId] ?? [];
  const selectedSplit = candidates.find((split) => split.id === selectedSplitId);
  const selectedNode = findTreeNode(tree, selectedNodeId);
  const uploadedDataset = selection && selection !== "demo" ? selection.dataset : undefined;
  const recommendationTarget = selection === "demo" ? "survived" : selection?.recommendationTarget ?? null;
  const activeTestVariable = uploadedDataset
    ? targetSettings.useForTests
      ? recommendationTarget ?? ""
      : uploadedDataset.columns.includes(testVariable)
        ? testVariable
        : uploadedDataset.columns[0] ?? ""
    : "";
  const activeDistributionSettings = targetSettings.useForDistribution
    ? distributionSettings && recommendationTarget
      ? { ...distributionSettings, variable: recommendationTarget }
      : null
    : distributionSettings;
  const projectSnapshot = useMemo(() => selection ? createProject(
    tree,
    recommendationTarget,
    appearance,
    nodeFields,
    summaryMetrics,
    activeDistributionSettings,
    uploadedDataset?.variableTypes,
    uploadedDataset?.fileName,
    uploadedDataset?.fileSize,
    uploadedDataset?.fileLastModified,
    targetSettings,
    nodeNameHistory,
  ) : null, [selection, tree, recommendationTarget, appearance, nodeFields, summaryMetrics, activeDistributionSettings, uploadedDataset, targetSettings, nodeNameHistory]);
  const projectFingerprint = projectSnapshot ? fingerprintProject(projectSnapshot) : "";
  const isDirty = savedProjectFingerprint !== projectFingerprint;
  const nodeSummaries = useMemo(
    () => buildNodeSummaries(tree, uploadedDataset, summaryMetrics),
    [tree, uploadedDataset, summaryMetrics],
  );
  const canvasTree = useMemo(() => visibleTree(tree, focusNodeId, collapsedNodeIds), [tree, focusNodeId, collapsedNodeIds]);
  const presentationDistribution = useMemo(() => {
    if (!showDistributionInPresentation || !uploadedDataset || !selectedNode || !activeDistributionSettings) return undefined;
    return createDistributionSnapshot(uploadedDataset, selectedNode, activeDistributionSettings);
  }, [showDistributionInPresentation, uploadedDataset, selectedNode, activeDistributionSettings]);
  const presentationState = useMemo<PresentationState | null>(() => {
    if (!selection) return null;
    return {
      tree: presentationTree(canvasTree),
      appearance,
      nodeFields,
      summaries: nodeSummaries,
      summaryCount: summaryMetrics.length,
      datasetName: selection === "demo" ? "Titanic" : selection.dataset.fileName,
      targetName: recommendationTarget ?? undefined,
      distribution: presentationDistribution,
    };
  }, [selection, canvasTree, appearance, nodeFields, nodeSummaries, summaryMetrics.length, presentationDistribution, recommendationTarget]);

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
      setSuggestionStatus("ready");
      return;
    }
    const controller = new AbortController();
    setSuggestionStatus("loading");
    setSuggestionError("");
    fetchSplitSuggestions(selection.dataset, selection.recommendationTarget, node.rowIndices, controller.signal)
      .then((nextCandidates) => {
        setCandidateCache((current) => ({ ...current, [selectedNodeId]: nextCandidates }));
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
    if (suggestionStatus !== "loading") {
      setSuggestionElapsed(0);
      return;
    }
    const started = performance.now();
    setSuggestionElapsed(0);
    const timer = window.setInterval(() => setSuggestionElapsed((performance.now() - started) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [suggestionStatus, selectedNodeId]);

  useEffect(() => {
    if (!splitFeature) {
      setSelectedSplitId("");
      return;
    }
    const currentNode = findTreeNode(tree, selectedNodeId);
    const featureCandidates = candidates.filter((candidate) => candidate.feature === splitFeature);
    const currentMatch = currentNode ? featureCandidates.find((candidate) => candidateMatchesCurrentSplit(candidate, currentNode)) : undefined;
    setSelectedSplitId((current) => currentMatch?.id ?? (featureCandidates.some((candidate) => candidate.id === current) ? current : featureCandidates[0]?.id ?? ""));
  }, [candidates, selectedNodeId, splitFeature, tree]);

  useEffect(() => {
    if (!uploadedDataset) return;
    setSummaryMetrics((current) => {
      const targetMetrics = current.filter((metric) => metric.target);
      if (!recommendationTarget || !targetSettings.showHighlightedMetric) {
        return targetMetrics.length ? current.filter((metric) => !metric.target) : current;
      }
      const existing = targetMetrics[0];
      const numeric = isNumericVariable(uploadedDataset, recommendationTarget);
      if (!existing) {
        return [...current, {
          id: "project-target",
          variable: recommendationTarget,
          aggregation: numeric ? "average" : "mode",
          highlighted: true,
          format: "number",
          target: true,
        }];
      }
      const aggregation = !numeric && ["average", "sum", "min", "max"].includes(existing.aggregation)
        ? "mode"
        : existing.aggregation;
      const format = aggregation === "mode" && existing.format !== "percentage" ? "number" : existing.format;
      if (targetMetrics.length === 1 && existing.variable === recommendationTarget && existing.highlighted && existing.aggregation === aggregation && existing.format === format) return current;
      return current
        .filter((metric) => !metric.target || metric.id === existing.id)
        .map((metric) => metric.id === existing.id ? {
          ...metric,
          variable: recommendationTarget,
          aggregation,
          format,
          highlighted: true,
          target: true,
        } : metric);
    });
  }, [uploadedDataset, recommendationTarget, targetSettings.showHighlightedMetric]);

  useEffect(() => {
    if (presentationState) publishPresentation(presentationState);
  }, [presentationState]);

  useEffect(() => {
    if (!actionNotice) return;
    const timer = window.setTimeout(() => setActionNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  useEffect(() => {
    if (!contextMenu) return;
    function closeContextMenu(event: globalThis.PointerEvent) {
      if (!(event.target as HTMLElement).closest(".node-context-menu")) setContextMenu(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setContextMenu(null);
    }
    window.addEventListener("pointerdown", closeContextMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeContextMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!presentHere) return;
    function handleFullscreenChange() {
      if (!document.fullscreenElement) setPresentHere(false);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [presentHere]);

  function handleApply(mode: SplitApplication = "replace") {
    if (!selectedSplit) return;
    if (selection === "demo") setTree((current) => applySplit(current, selectedNodeId, selectedSplit));
    else setTree((current) => applyPreparedSplit(current, selectedNodeId, preparedRecommendedSplit(selectedSplit), mode, uploadedDataset));
    setCandidateCache((current) => Object.fromEntries(
      Object.entries(current).filter(([nodeId]) => !nodeId.startsWith(`${selectedNodeId}.`)),
    ));
    setSelectedNodeId(`${selectedNodeId}.1`);
    setSplitFeature("");
    setSuggestionStatus("loading");
  }

  function handleManualApply(split: ManualSplitResult, mode: SplitApplication) {
    const nodeId = selectedNodeId;
    setTree((current) => applyPreparedSplit(current, nodeId, preparedManualSplit(split), mode, uploadedDataset));
    setCandidateCache((current) => Object.fromEntries(
      Object.entries(current).filter(([cachedNodeId]) => !cachedNodeId.startsWith(`${nodeId}.`)),
    ));
    setSelectedNodeId(`${nodeId}.1`);
    setSplitFeature("");
    setNodeTab("recommended");
    setSuggestionStatus("loading");
  }

  function handleRemoveSelectedSplit() {
    if (!selectedNodeId) return;
    setTree((current) => removeNodeSplit(current, selectedNodeId));
    setCandidateCache((current) => Object.fromEntries(Object.entries(current).filter(([nodeId]) => !nodeId.startsWith(`${selectedNodeId}.`))));
    setSplitFeature("");
    setSelectedSplitId("");
    setNodeTab("recommended");
    setCollapsedNodeIds((current) => current.filter((nodeId) => !nodeId.startsWith(`${selectedNodeId}.`)));
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
    setSelectedNodeId("");
    setInspectorOpen(false);
    setFocusNodeId(null);
    setCollapsedNodeIds([]);
  }

  function handleDataset(selectionValue: DatasetSelection) {
    setCandidateCache({});
    setSummaryMetrics([]);
    setNodeNameHistory([]);
    setFocusNodeId(null);
    setCollapsedNodeIds([]);
    setNodeFields(defaultNodeFields);
    setTargetSettings(defaultTargetSettings);
    setTestVariable(selectionValue.dataset.columns[0] ?? "");
    setTargetError("");
    setDistributionSettings({
      variable: selectionValue.dataset.columns[0] ?? "",
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
    setSelectedNodeId("");
    setSidebarMode("target");
    setInspectorOpen(true);
    setViewport({ x: 0, y: 0, scale: 1 });
    setProjectFileName("Untitled tree");
    setSavedProjectFingerprint(null);
  }

  async function handleResume(selectionValue: DatasetSelection, project: ControlTreeProject, savedFileName: string) {
    const restoredTargetSettings = project.targetSettings ?? defaultTargetSettings;
    const variableTypes = Object.fromEntries(
      Object.entries(project.variableTypes ?? {}).filter(([variable]) => selectionValue.dataset.columns.includes(variable)),
    );
    const configuredDataset = { ...selectionValue.dataset, variableTypes };
    const restoredTarget = selectionValue.recommendationTarget;
    const configuredSelection = { ...selectionValue, dataset: configuredDataset, recommendationTarget: restoredTarget };
    const restoredTree = await replayProject(configuredDataset, project);
    const restoredDistribution = project.distribution && selectionValue.dataset.columns.includes(project.distribution.variable)
      ? project.distribution
      : {
          variable: selectionValue.dataset.columns[0] ?? "",
          binWidth: null,
          scale: "count" as const,
        };
    const restoredMetrics = project.summaries.map((metric, index) => ({
      ...metric,
      id: `saved-${index + 1}`,
    }));
    setCandidateCache({});
    setSelection(configuredSelection);
    setTree(restoredTree);
    setAppearance(project.appearance);
    setNodeFields(project.nodeFields);
    setTargetError("");
    setTargetSettings(restoredTargetSettings);
    setTestVariable(restoredTarget ?? selectionValue.dataset.columns[0] ?? "");
    setDistributionSettings(restoredDistribution);
    setShowDistributionInPresentation(false);
    setSummaryMetrics(restoredMetrics);
    setNodeNameHistory(project.nodeNameHistory ?? []);
    setFocusNodeId(null);
    setCollapsedNodeIds([]);
    setSelectedNodeId("");
    const shouldPromptForTarget = !restoredTarget && !restoredTargetSettings.dismissTargetReminder;
    setSidebarMode(shouldPromptForTarget ? "target" : "node");
    setNodeTab("recommended");
    setInspectorOpen(shouldPromptForTarget);
    setViewport({ x: 0, y: 0, scale: 1 });
    setProjectFileName(savedFileName);
    const restoredFingerprintDistribution = restoredTargetSettings.useForDistribution
      ? restoredTarget
        ? { ...restoredDistribution, variable: restoredTarget }
        : null
      : restoredDistribution;
    setSavedProjectFingerprint(fingerprintProject(createProject(
      restoredTree,
      configuredSelection.recommendationTarget,
      project.appearance,
      project.nodeFields,
      restoredMetrics,
      restoredFingerprintDistribution,
      variableTypes,
      configuredDataset.fileName,
      configuredDataset.fileSize,
      configuredDataset.fileLastModified,
      restoredTargetSettings,
      project.nodeNameHistory ?? [],
    )));
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
      if (targetSettings.useForDistribution) {
        setDistributionSettings((current) => current ? { ...current, variable: nextTarget, binWidth: null } : current);
        setShowDistributionInPresentation(false);
      }
    } catch (reason) {
      setTargetError(reason instanceof Error ? reason.message : "This target cannot be used.");
    }
  }

  function handleVariableTypeChange(variable: string, type: VariableType) {
    if (!selection || selection === "demo") return;
    const variableTypes = { ...(selection.dataset.variableTypes ?? {}) };
    if (type === "automatic") delete variableTypes[variable];
    else variableTypes[variable] = type;
    const dataset = { ...selection.dataset, variableTypes };
    setSelection({ ...selection, dataset });
    setCandidateCache({});
    setSelectedSplitId("");
    setSuggestionStatus(selection.recommendationTarget ? "loading" : "idle");
    if (!isNumericVariable(dataset, variable)) {
      setSummaryMetrics((current) => current.map((metric) =>
        metric.variable === variable && ["average", "sum", "min", "max"].includes(metric.aggregation)
          ? { ...metric, aggregation: "distinct" }
          : metric,
      ));
    }
  }

  function handleDemo() {
    setSummaryMetrics([]);
    setNodeNameHistory([]);
    setFocusNodeId(null);
    setCollapsedNodeIds([]);
    setNodeFields(defaultNodeFields);
    setTargetSettings(defaultTargetSettings);
    setSelection("demo");
    setTree(initialTree);
    setSelectedSplitId(splitCandidates[0].id);
    setSelectedNodeId("");
    setDistributionSettings(null);
    setShowDistributionInPresentation(false);
    setInspectorOpen(false);
    setViewport({ x: 0, y: 0, scale: 1 });
    setProjectFileName("Untitled tree");
    setSavedProjectFingerprint(null);
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

  if (presentHere && presentationState) {
    return (
      <PresentationView
        onExit={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          setPresentHere(false);
        }}
      />
    );
  }

  const datasetName = selection === "demo" ? "Titanic" : selection.dataset.fileName;
  const canvasStyle = {
    "--tree-node-color": appearance.nodeColor,
    "--tree-accent-color": appearance.accentColor,
    "--tree-connector-color": appearance.connectorColor,
    "--tree-background-color": appearance.backgroundColor,
    "--tree-grid-opacity": appearance.showGrid ? .32 : 0,
    "--summary-count": summaryMetrics.length,
    "--visible-field-count": [nodeFields.nodeName, nodeFields.nodeTitle, nodeFields.rowCount].filter(Boolean).length,
    "--canvas-grid-size": `${22 * viewport.scale}px`,
    "--canvas-grid-x": `${viewport.x}px`,
    "--canvas-grid-y": `${viewport.y}px`,
  } as CSSProperties;
  const contextNode = contextMenu ? findTreeNode(tree, contextMenu.nodeId) : undefined;

  function selectNode(nodeId: string) {
    if (inspectorOpen && (sidebarMode === "test" || sidebarMode === "metrics")) {
      setSelectedNodeId(nodeId);
      setHelpOpen(false);
      return;
    }
    const node = findTreeNode(tree, nodeId);
    if (!(inspectorOpen && sidebarMode === "node" && nodeTab === "distribution")) setNodeTab(node?.split?.kind === "manual" ? "manual" : "recommended");
    setSplitFeature(node?.split?.feature ?? "");
    setSelectedNodeId(nodeId);
    setSidebarMode("node");
    setInspectorOpen(true);
    setHelpOpen(false);
  }

  function openNodeContextMenu(nodeId: string, x: number, y: number) {
    setSelectedNodeId(nodeId);
    setContextMenu({
      nodeId,
      x: Math.max(8, Math.min(x, window.innerWidth - 254)),
      y: Math.max(8, Math.min(y, window.innerHeight - 390)),
    });
  }

  function beginContextRename(nodeId: string) {
    setContextMenu(null);
    setSelectedNodeId(nodeId);
    setSidebarMode("metrics");
    setInspectorOpen(true);
    setHelpOpen(false);
    setRenameRequestId((current) => current + 1);
  }

  function rememberNodeName(title: string) {
    setNodeNameHistory((current) => [title, ...current.filter((name) => name.toLocaleLowerCase() !== title.toLocaleLowerCase())].slice(0, 10));
  }

  async function copyContextSplits(node: TreeNode, mode: "single" | "subtree") {
    setContextMenu(null);
    try {
      const systemClipboard = await copySplitsToClipboard(node, mode);
      setActionNotice(systemClipboard
        ? mode === "single" ? "Split copied to the clipboard." : "All splits below this node copied to the clipboard."
        : "Split copied inside ControlTree. This browser blocked the system clipboard.");
    } catch (reason) {
      setDataSourceError(reason instanceof Error ? reason.message : "The split could not be copied.");
    }
  }

  async function pasteContextSplits(nodeId: string) {
    setContextMenu(null);
    if (!uploadedDataset) return;
    try {
      const payload = await readSplitsFromClipboard();
      const nextTree = pasteCopiedSplits(uploadedDataset, tree, nodeId, payload);
      setTree(nextTree);
      setCandidateCache((current) => Object.fromEntries(Object.entries(current).filter(([cachedId]) => cachedId !== nodeId && !cachedId.startsWith(`${nodeId}.`))));
      setCollapsedNodeIds((current) => current.filter((collapsedId) => collapsedId !== nodeId && !collapsedId.startsWith(`${nodeId}.`)));
      const pastedNode = findTreeNode(nextTree, nodeId);
      setSplitFeature(pastedNode?.split?.feature ?? "");
      setNodeTab(pastedNode?.split?.kind === "manual" ? "manual" : "recommended");
      setActionNotice(payload.mode === "single" ? "Split pasted." : "Split subtree pasted.");
    } catch (reason) {
      setDataSourceError(reason instanceof Error ? reason.message : "The copied split could not be pasted here.");
    }
  }

  function trimContextNode(nodeId: string) {
    setContextMenu(null);
    setTree((current) => removeNodeSplit(current, nodeId));
    setCandidateCache((current) => Object.fromEntries(Object.entries(current).filter(([cachedId]) => cachedId !== nodeId && !cachedId.startsWith(`${nodeId}.`))));
    setCollapsedNodeIds((current) => current.filter((collapsedId) => collapsedId !== nodeId && !collapsedId.startsWith(`${nodeId}.`)));
    if (selectedNodeId === nodeId) {
      setSplitFeature("");
      setSelectedSplitId("");
      setNodeTab("recommended");
    }
    setActionNotice("Splits below the node removed.");
  }

  function toggleTreeSettings() {
    const active = inspectorOpen && sidebarMode === "tree";
    setHelpOpen(false);
    setNodeTab("recommended");
    setInspectorOpen(!active);
    if (!active) {
      setSidebarMode("tree");
      setSelectedNodeId("");
    }
  }

  function toggleTarget() {
    const active = inspectorOpen && sidebarMode === "target";
    setHelpOpen(false);
    setNodeTab("recommended");
    setInspectorOpen(!active);
    if (!active) {
      setSidebarMode("target");
      setSelectedNodeId("");
    }
  }

  function toggleMetrics() {
    const active = inspectorOpen && sidebarMode === "metrics";
    setHelpOpen(false);
    setNodeTab("recommended");
    setInspectorOpen(!active);
    if (active) setSelectedNodeId("");
    else setSidebarMode("metrics");
  }

  function toggleVariableTypes() {
    const active = inspectorOpen && sidebarMode === "variables";
    setHelpOpen(false);
    setNodeTab("recommended");
    setInspectorOpen(!active);
    if (!active) {
      setSidebarMode("variables");
      setSelectedNodeId("");
    }
  }

  function toggleTest() {
    const active = inspectorOpen && sidebarMode === "test";
    setHelpOpen(false);
    setNodeTab("recommended");
    setInspectorOpen(!active);
    if (active) setSelectedNodeId("");
    else setSidebarMode("test");
  }

  function toggleSplit() {
    const active = inspectorOpen && sidebarMode === "node" && nodeTab !== "distribution";
    setHelpOpen(false);
    if (active) {
      setInspectorOpen(false);
      setSelectedNodeId("");
      return;
    }
    setSidebarMode("node");
    setNodeTab(selectedNode?.split?.kind === "manual" ? "manual" : "recommended");
    setSplitFeature(selectedNode?.split?.feature ?? "");
    setInspectorOpen(true);
  }

  function toggleMoreActions() {
    const active = inspectorOpen && sidebarMode === "more";
    setHelpOpen(false);
    setNodeTab("recommended");
    setInspectorOpen(!active);
    if (!active) {
      setSidebarMode("more");
      setSelectedNodeId("");
    }
  }

  function togglePresentActions() {
    const active = inspectorOpen && sidebarMode === "present";
    setHelpOpen(false);
    setNodeTab("recommended");
    setInspectorOpen(!active);
    if (!active) {
      setSidebarMode("present");
      setSelectedNodeId("");
    }
  }

  async function handleTreeImageDownload() {
    const treeElement = canvasRef.current?.querySelector<HTMLElement>(".canvas__tree-origin > .tree");
    if (!treeElement) return;
    setIsExportingTreeImage(true);
    setDataSourceError("");
    try {
      await downloadTreePng(treeElement, appearance, uploadedDataset?.fileName ?? "ControlTree");
    } catch (reason) {
      setDataSourceError(reason instanceof Error ? reason.message : "The tree image could not be created.");
    } finally {
      setIsExportingTreeImage(false);
    }
  }

  function handleEnrichedDataDownload() {
    if (!uploadedDataset) return;
    try {
      setDataSourceError("");
      downloadEnrichedCsv(uploadedDataset, tree, recommendationTarget);
    } catch (reason) {
      setDataSourceError(reason instanceof Error ? reason.message : "The enriched dataset could not be created.");
    }
  }

  function toggleDistribution() {
    if (!uploadedDataset) return;
    const active = inspectorOpen && sidebarMode === "node" && nodeTab === "distribution";
    setHelpOpen(false);
    if (active) {
      setInspectorOpen(false);
      setSelectedNodeId("");
      setNodeTab("recommended");
      return;
    }
    setSidebarMode("node");
    setNodeTab("distribution");
    setInspectorOpen(true);
  }

  function zoomAt(nextScale: number, clientX?: number, clientY?: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const anchorX = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const anchorY = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const clampedScale = Math.min(2.5, Math.max(.35, nextScale));
    setViewport((current) => {
      const localX = (anchorX - current.x) / current.scale;
      const localY = (anchorY - current.y) / current.scale;
      return {
        x: anchorX - localX * clampedScale,
        y: anchorY - localY * clampedScale,
        scale: clampedScale,
      };
    });
  }

  function handleCanvasWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * .0015);
    zoomAt(viewport.scale * factor, event.clientX, event.clientY);
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.closest("button, a, input, select, textarea, summary")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true;
    setViewport((current) => ({ ...current, x: drag.originX + deltaX, y: drag.originY + deltaY }));
  }

  function finishCanvasPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      setInspectorOpen(false);
      setHelpOpen(false);
      setSelectedNodeId("");
      setNodeTab("recommended");
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setIsPanning(false);
  }

  function startPaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    paneResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: paneWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = paneResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const maximum = Math.max(320, Math.min(720, window.innerWidth - 32));
    setPaneWidth(Math.min(maximum, Math.max(320, resize.startWidth + resize.startX - event.clientX)));
  }

  function finishPaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = paneResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    paneResizeRef.current = null;
  }

  async function handleSave() {
    if (!projectSnapshot) return;
    setDataSourceError("");
    try {
      const savedFileName = await saveProjectAs(projectSnapshot, datasetName);
      if (!savedFileName) return;
      setProjectFileName(savedFileName);
      setSavedProjectFingerprint(projectFingerprint);
    } catch (reason) {
      setDataSourceError(reason instanceof Error ? reason.message : "The project could not be saved.");
    }
  }

  async function applyNewDataSource(file: File) {
    if (!projectSnapshot) return;
    setIsChangingDataSource(true);
    setDataSourceError("");
    try {
      const dataset = await parseDatasetFile(file);
      const requiredVariables = new Set<string>();
      if (recommendationTarget) requiredVariables.add(recommendationTarget);
      summaryMetrics.forEach((metric) => requiredVariables.add(metric.variable));
      if (distributionSettings) requiredVariables.add(distributionSettings.variable);
      function collectSplitVariables(node: TreeNode) {
        if (node.split) requiredVariables.add(node.split.feature);
        node.children.forEach(collectSplitVariables);
      }
      collectSplitVariables(tree);
      const missingVariables = [...requiredVariables].filter((variable) => !dataset.columns.includes(variable));
      if (missingVariables.length) {
        throw new Error(`This dataset cannot replace the current source because it is missing: ${missingVariables.join(", ")}.`);
      }
      const variableTypes = Object.fromEntries(
        Object.entries(uploadedDataset?.variableTypes ?? {}).filter(([variable]) => dataset.columns.includes(variable)),
      );
      const configuredDataset = { ...dataset, variableTypes };
      const replayedTree = await replayProject(configuredDataset, {
        ...projectSnapshot,
        ...(Object.keys(variableTypes).length ? { variableTypes } : { variableTypes: undefined }),
        sourceFileName: dataset.fileName,
      });
      setSelection({ dataset: configuredDataset, recommendationTarget });
      setTree(replayedTree);
      setCandidateCache({});
      setSelectedSplitId("");
      setSelectedNodeId("");
      setSuggestionStatus("idle");
      setInspectorOpen(false);
      setHelpOpen(false);
      setFocusNodeId(null);
      setCollapsedNodeIds([]);
      setContextMenu(null);
    } catch (reason) {
      setDataSourceError(reason instanceof Error ? reason.message : "The new data source could not be applied.");
    } finally {
      setIsChangingDataSource(false);
    }
  }

  async function chooseNewDataSource() {
    try {
      const file = await pickDatasetFile();
      if (file === undefined) dataSourceInputRef.current?.click();
      else if (file) await applyNewDataSource(file);
    } catch (reason) {
      setDataSourceError(reason instanceof Error ? reason.message : "The file picker could not be opened.");
    }
  }

  async function handleDataSourceInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await applyNewDataSource(file);
  }

  function handleGoHome() {
    if (isDirty) {
      setHomeWarningOpen(true);
      return;
    }
    leaveWorkspace();
  }

  function leaveWorkspace() {
    setSelection(null);
    setInspectorOpen(false);
    setHelpOpen(false);
    setHomeWarningOpen(false);
    setContextMenu(null);
  }

  const inspectorCopy = sidebarMode === "target"
    ? { title: "Target variable", description: "Choose an optional project target and where ControlTree should use it automatically." }
    : sidebarMode === "metrics"
      ? { title: "Metrics", description: "Choose the fields and calculated summaries shown in every tree node." }
      : sidebarMode === "test"
        ? { title: "Test tree", description: "Measure how strongly the tree separates a selected variable into homogeneous groups." }
        : sidebarMode === "variables"
          ? { title: "Variable types", description: "Review automatic type detection and correct ambiguous numeric or categorical variables." }
          : sidebarMode === "tree"
            ? { title: "Tree settings", description: "Control the colors, background, and visual appearance of the whole tree." }
            : sidebarMode === "present"
              ? { title: "Present tree", description: "Present the tree live or export it and its row-level results." }
              : sidebarMode === "more"
                ? { title: "More actions", description: "Save the project, change its data source, download the app, or reset the tree." }
                : nodeTab === "distribution"
                  ? { title: "Distribution", description: "Explore the values and summary statistics inside the selected node." }
                  : { title: "Split", description: "Choose a recommended split or define exactly how the selected node should branch." };

  return (
    <div className="app-shell app-shell--workspace">
      <div className="workspace-context" aria-label="Current project">
        <a className="brand" href="#" aria-label="Return to the ControlTree home screen" onClick={(event) => { event.preventDefault(); handleGoHome(); }}>
          <span className="brand__mark" aria-hidden="true">⌁</span>
          <span>ControlTree</span>
        </a>
        <span className="workspace-context__divider" />
        <button className={`workspace-project${isDirty ? " workspace-project--dirty" : ""}`} type="button" onClick={handleSave} aria-label={`Save ${projectFileName}; ${isDirty ? "unsaved changes" : "currently saved"}`}>
          <span aria-hidden="true">●</span>
          <strong>{projectFileName}</strong>
          <small>{isDirty ? "Unsaved changes" : "Saved"}</small>
        </button>
      </div>

      <nav className="workspace-actions" aria-label="ControlTree actions">
        <button className={`toolbar-button${inspectorOpen && sidebarMode === "target" ? " toolbar-button--selected" : ""}${uploadedDataset && !recommendationTarget && !targetSettings.dismissTargetReminder ? " toolbar-button--attention" : ""}`} type="button" disabled={!uploadedDataset} data-tooltip={uploadedDataset ? recommendationTarget ? "Target variable" : targetSettings.dismissTargetReminder ? "No target selected" : "Choose a target variable" : "Target is available with uploaded data"} aria-label={recommendationTarget ? "Target variable" : targetSettings.dismissTargetReminder ? "No target selected" : "Choose a target variable"} onClick={toggleTarget}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m15 9 6-6M17 3h4v4"/></svg>
        </button>
        <button className={`toolbar-button${inspectorOpen && sidebarMode === "metrics" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="Metrics" aria-label="Metrics" onClick={toggleMetrics}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 5H8l6 7-6 7h10M4 5h1M4 12h1M4 19h1"/></svg>
        </button>
        <button className={`toolbar-button${inspectorOpen && sidebarMode === "node" && nodeTab !== "distribution" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="Split" aria-label="Open split tools" onClick={toggleSplit}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="5" rx="1"/><rect x="2" y="16" width="8" height="5" rx="1"/><rect x="14" y="16" width="8" height="5" rx="1"/><path d="M12 8v4M6 12h12M6 12v4M18 12v4"/></svg>
        </button>
        <button className={`toolbar-button${inspectorOpen && sidebarMode === "node" && nodeTab === "distribution" ? " toolbar-button--selected" : ""}`} type="button" disabled={!uploadedDataset} data-tooltip={uploadedDataset ? "Distribution" : "Upload data to use Distribution"} aria-label="Open distribution" onClick={toggleDistribution}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20V10M9.3 20V5M14.7 20v-8M20 20V8M2 20h20"/></svg>
        </button>
        <button className={`toolbar-button${inspectorOpen && sidebarMode === "test" ? " toolbar-button--selected" : ""}`} type="button" disabled={!uploadedDataset} data-tooltip={uploadedDataset ? "Test tree" : "Upload data to test the tree"} aria-label="Test tree" onClick={toggleTest}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M8 15h8"/></svg>
        </button>
        <button className={`toolbar-button${inspectorOpen && sidebarMode === "variables" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="Variable types" aria-label="Variable types" onClick={toggleVariableTypes}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 19 8 5l5 14M5 14h6M15 7h6M18 5v14"/></svg>
        </button>
        <button className={`toolbar-button${inspectorOpen && sidebarMode === "tree" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="Tree settings" aria-label="Tree settings" onClick={toggleTreeSettings}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/><circle cx="14" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>
        </button>
        <button className={`toolbar-button${inspectorOpen && sidebarMode === "present" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="Present tree" aria-label="Present tree" onClick={togglePresentActions}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M10 8l5 2.5-5 2.5z"/></svg>
        </button>
        <button className={`toolbar-button${helpOpen ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="ControlTree guide" aria-label="Open the ControlTree guide" onClick={() => { setHelpOpen((open) => !open); setInspectorOpen(false); setSelectedNodeId(""); }}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23zM20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23z"/></svg>
        </button>
        <button className={`toolbar-button${inspectorOpen && sidebarMode === "more" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="More actions" aria-label="More actions" onClick={toggleMoreActions}>
          <svg className="toolbar-dots-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
        </button>
      </nav>

      <input ref={dataSourceInputRef} className="file-input" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleDataSourceInput} />

      <main id="workspace" className="workspace">
        {dataSourceError && <div className="workspace-error" role="alert"><span>{dataSourceError}</span><button type="button" onClick={() => setDataSourceError("")} aria-label="Dismiss message">×</button></div>}
        {actionNotice && <div className="workspace-notice" role="status">{actionNotice}</div>}
        <section className="canvas-panel">
          <div
            ref={canvasRef}
            className={`canvas${isPanning ? " canvas--panning" : ""}`}
            style={canvasStyle}
            onWheel={handleCanvasWheel}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={finishCanvasPointer}
            onPointerCancel={finishCanvasPointer}
          >
            <div className="canvas__grid" />
            <div className="canvas__camera" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
              <div className="canvas__tree-origin">
                <TreeCanvas
                  node={canvasTree}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={selectNode}
                  onNodeContextMenu={openNodeContextMenu}
                  summaries={nodeSummaries}
                  nodeFields={nodeFields}
                  rootSamples={tree.samples}
                />
              </div>
            </div>
            <div className="canvas-controls" aria-label="Canvas controls">
              <button type="button" onClick={() => zoomAt(viewport.scale / 1.2)} aria-label="Zoom out">−</button>
              <span>{Math.round(viewport.scale * 100)}%</span>
              <button type="button" onClick={() => zoomAt(viewport.scale * 1.2)} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}>Reset view</button>
            </div>
          </div>
        </section>

        <aside className={`inspector${inspectorOpen ? " inspector--open" : ""}`} style={{ "--pane-width": `${paneWidth}px` } as CSSProperties} aria-label="Tool pane" aria-hidden={!inspectorOpen}>
          <div className="pane-resize-handle" role="separator" aria-label="Resize tool pane" aria-orientation="vertical" onPointerDown={startPaneResize} onPointerMove={movePaneResize} onPointerUp={finishPaneResize} onPointerCancel={finishPaneResize} />
          <div className="inspector__toolbar">
            <div>
              <strong>{inspectorCopy.title}</strong>
              <p>{inspectorCopy.description}</p>
            </div>
            <button className="inspector__close" type="button" onClick={() => { setInspectorOpen(false); if (sidebarMode === "node" || sidebarMode === "test" || sidebarMode === "metrics") setSelectedNodeId(""); setNodeTab("recommended"); }} aria-label="Close inspector">×</button>
          </div>

          {sidebarMode === "target" ? (
            uploadedDataset ? (
              <TargetPane
                dataset={uploadedDataset}
                target={recommendationTarget ?? ""}
                settings={targetSettings}
                error={targetError}
                onTargetChange={handleTargetChange}
                onSettingsChange={setTargetSettings}
              />
            ) : <div className="empty-state">Upload a dataset to configure a target.</div>
          ) : sidebarMode === "present" ? (
            <div className="more-actions-pane">
              <button className="more-action" type="button" onClick={() => {
                if (!presentationState) return;
                publishPresentation(presentationState);
                setPresentHere(true);
                void document.documentElement.requestFullscreen().catch(() => undefined);
              }}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 4h16v16H4zM8 8h8v8H8"/></svg>
                <span><strong>Present here</strong><small>Use this screen in fullscreen presentation mode.</small></span>
              </button>
              <button className="more-action" type="button" onClick={() => presentationState && openPresentationWindow(presentationState)}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="15" height="12" rx="2"/><path d="M8 21h10a3 3 0 0 0 3-3V9M7 17v4"/></svg>
                <span><strong>Present on another screen</strong><small>Keep editing here while the presentation stays synchronized.</small></span>
              </button>
              <button className="more-action" type="button" disabled={isExportingTreeImage} onClick={handleTreeImageDownload}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg>
                <span><strong>{isExportingTreeImage ? "Creating tree image…" : "Download tree image"}</strong><small>Save a clean PNG using the current colors and canvas background.</small></span>
              </button>
              <button className="more-action" type="button" disabled={!uploadedDataset} onClick={handleEnrichedDataDownload}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 3h16v18H4zM4 9h16M10 3v18M14 13h3M15.5 11.5V16"/></svg>
                <span><strong>Download data with tree results</strong><small>{uploadedDataset ? `Export all rows as CSV with node details${recommendationTarget ? ", predictions, and errors" : ""}.` : "Available after loading a CSV or Excel dataset."}</small></span>
              </button>
            </div>
          ) : sidebarMode === "more" ? (
            <div className="more-actions-pane">
              <button className="more-action" type="button" onClick={handleSave}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7"/></svg>
                <span><strong>Save project</strong><small>Choose a filename and location for this lightweight project.</small></span>
              </button>
              <button className="more-action" type="button" disabled={isChangingDataSource} onClick={chooseNewDataSource}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v11H3zM3 6v13M8 13h8M13 10l3 3-3 3"/></svg>
                <span><strong>{isChangingDataSource ? "Changing data source…" : "Change data source"}</strong><small>Apply this tree to another compatible CSV or Excel file.</small></span>
              </button>
              <a className="more-action" href="https://github.com/daniel-vital-de-alcantara/ControlTree/releases" target="_blank" rel="noreferrer">
                <svg className="more-action__github" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.84a9.6 9.6 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>
                <span><strong>GitHub releases</strong><small>Download the Windows desktop or Python versions.</small></span>
              </a>
              <button className="more-action more-action--danger" type="button" onClick={handleReset}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
                <span><strong>Reset tree</strong><small>Remove every split and return to an empty root node.</small></span>
              </button>
            </div>
          ) : sidebarMode === "test" ? (
            uploadedDataset && activeTestVariable ? (
              <TreeTestPane
                dataset={uploadedDataset}
                tree={tree}
                variable={activeTestVariable}
                selectedNodeId={selectedNodeId}
                lockVariable={targetSettings.useForTests}
                onVariableChange={setTestVariable}
              />
            ) : <div className="empty-state">{uploadedDataset && targetSettings.useForTests && !recommendationTarget ? "Choose a target in the Target variable tool to test the tree automatically." : "Upload a dataset to test the tree."}</div>
          ) : sidebarMode === "tree" || sidebarMode === "metrics" || sidebarMode === "variables" ? (
            <TreeSettingsPane
              section={sidebarMode}
              dataset={uploadedDataset}
              appearance={appearance}
              nodeFields={nodeFields}
              metrics={summaryMetrics}
              selectedNode={sidebarMode === "metrics" ? selectedNode : undefined}
              onAppearanceChange={setAppearance}
              onNodeFieldsChange={setNodeFields}
              onMetricsChange={setSummaryMetrics}
              onNodeTitleChange={(title) => selectedNodeId && setTree((current) => renameTreeNode(current, selectedNodeId, title))}
              onNodeTitleCommit={rememberNodeName}
              nodeNameSuggestions={nodeNameHistory}
              renameRequestId={renameRequestId}
              onVariableTypeChange={handleVariableTypeChange}
            />
          ) : !selectedNode ? (
            <div className="empty-state">Select a node to continue.</div>
          ) : (
            <>
              {nodeTab === "distribution" ? (
                uploadedDataset && selectedNode?.rowIndices && activeDistributionSettings ? (
                  <DistributionPane
                    dataset={uploadedDataset}
                    node={selectedNode}
                    settings={activeDistributionSettings}
                    showInPresentation={showDistributionInPresentation}
                    lockVariable={targetSettings.useForDistribution}
                    onSettingsChange={setDistributionSettings}
                    onShowInPresentationChange={setShowDistributionInPresentation}
                  />
                ) : uploadedDataset ? (
                  <div className="empty-state">{targetSettings.useForDistribution && !recommendationTarget ? "Choose a target in the Target variable tool to use it automatically here." : "Select a node to continue."}</div>
                ) : (
                  <div className="empty-state">Upload a dataset to explore selected-node distributions.</div>
                )
              ) : nodeTab === "manual" ? (
                uploadedDataset && selectedNode?.rowIndices ? (
                  <ManualSplitPane
                    key={`${selectedNode.id}:${splitFeature}`}
                    dataset={uploadedDataset}
                    node={selectedNode}
                    feature={splitFeature || selectedNode.split?.feature || uploadedDataset.columns.find((column) => column !== recommendationTarget) || uploadedDataset.columns[0] || ""}
                    onBack={() => { setNodeTab("recommended"); setSplitFeature(""); }}
                    onApply={handleManualApply}
                    onRemoveSplit={handleRemoveSelectedSplit}
                  />
                ) : (
                  <div className="empty-state">Upload a dataset to create manual multiway splits.</div>
                )
              ) : uploadedDataset && selectedNode.rowIndices ? (
                <>
                  {!targetSettings.useForRecommendations && (
                    <div className="recommendation-target">
                      <label className="field-label" htmlFor="recommendation-target">Recommendation target</label>
                      <select id="recommendation-target" value={recommendationTarget ?? ""} onChange={(event) => handleTargetChange(event.target.value)}>
                        {uploadedDataset.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                      </select>
                      <p>Used only to rank recommended splits.</p>
                      {targetError && <p className="form-error" role="alert">{targetError}</p>}
                    </div>
                  )}
                  <SplitPane
                    dataset={uploadedDataset}
                    node={selectedNode}
                    target={recommendationTarget}
                    candidates={candidates}
                    status={suggestionStatus}
                    error={suggestionError}
                    elapsedSeconds={suggestionElapsed}
                    feature={splitFeature}
                    selectedSplitId={selectedSplitId}
                    onFeatureChange={(feature) => {
                      setSplitFeature(feature);
                      const first = candidates.find((candidate) => candidate.feature === feature);
                      setSelectedSplitId(first?.id ?? "");
                    }}
                    onCandidateChange={setSelectedSplitId}
                    onManual={() => setNodeTab("manual")}
                    onApply={handleApply}
                    onRemoveSplit={handleRemoveSelectedSplit}
                  />
                </>
              ) : selection === "demo" && selectedNodeId === "root" ? (
                <>
                  <div className="suggestions" role="radiogroup" aria-label="Demo split suggestions">
                    {candidates.map((candidate, index) => (
                      <label className={`suggestion${selectedSplitId === candidate.id ? " suggestion--selected" : ""}`} key={candidate.id}>
                        <input type="radio" name="split" value={candidate.id} checked={selectedSplitId === candidate.id} onChange={() => setSelectedSplitId(candidate.id)} />
                        <span className="suggestion__rank">{String(index + 1).padStart(2, "0")}</span>
                        <span className="suggestion__body"><strong>{describeRule(candidate)}</strong><span>{candidate.leftCount} / {candidate.rightCount} rows</span></span>
                        <span className="gain">+{candidate.gain.toFixed(3)}</span>
                      </label>
                    ))}
                  </div>
                  {selectedSplit && <button className="primary-button" type="button" onClick={() => handleApply("replace")}>Apply demo split<span aria-hidden="true">→</span></button>}
                </>
              ) : (
                <div className="empty-state">Upload a dataset to compute consecutive split suggestions.</div>
              )}
            </>
          )}
        </aside>

        {contextMenu && contextNode && (
          <div className="node-context-menu" role="menu" aria-label={`Actions for ${contextNode.title}`} style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={(event) => event.preventDefault()}>
            <div className="node-context-menu__heading"><span>Node {contextNode.id}</span><strong>{contextNode.title}</strong></div>
            <button role="menuitem" type="button" onClick={() => beginContextRename(contextNode.id)}><span>✎</span><span><strong>Rename node</strong><small>Open Metrics and start typing</small></span></button>
            <div className="node-context-menu__separator" />
            <button role="menuitem" type="button" disabled={contextNode.id === tree.id && !focusNodeId} onClick={() => {
              setContextMenu(null);
              setFocusNodeId(focusNodeId === contextNode.id ? null : contextNode.id);
              setViewport({ x: 0, y: 0, scale: 1 });
            }}><span>↥</span><span><strong>{focusNodeId === contextNode.id ? "Show nodes above" : "Hide nodes above"}</strong><small>{focusNodeId === contextNode.id ? "Return to the complete tree" : "Focus the canvas on this branch"}</small></span></button>
            <button role="menuitem" type="button" disabled={!contextNode.children.length && !collapsedNodeIds.includes(contextNode.id)} onClick={() => {
              setContextMenu(null);
              setCollapsedNodeIds((current) => current.includes(contextNode.id) ? current.filter((id) => id !== contextNode.id) : [...current, contextNode.id]);
            }}><span>↧</span><span><strong>{collapsedNodeIds.includes(contextNode.id) ? "Show nodes below" : "Hide nodes below"}</strong><small>Temporarily {collapsedNodeIds.includes(contextNode.id) ? "expand" : "collapse"} this branch</small></span></button>
            <div className="node-context-menu__separator" />
            <button role="menuitem" type="button" disabled={!contextNode.split} onClick={() => void copyContextSplits(contextNode, "single")}><span>⧉</span><span><strong>Copy split</strong><small>Copy only this node’s rule</small></span></button>
            <button role="menuitem" type="button" disabled={!contextNode.split} onClick={() => void copyContextSplits(contextNode, "subtree")}><span>⎘</span><span><strong>Copy all splits below</strong><small>Copy this complete split subtree</small></span></button>
            <button role="menuitem" type="button" disabled={!uploadedDataset} onClick={() => void pasteContextSplits(contextNode.id)}><span>↳</span><span><strong>Paste split</strong><small>{contextNode.children.length ? "Replace this subtree using these rows" : "Rebuild the copied rule with these rows"}</small></span></button>
            <div className="node-context-menu__separator" />
            <button className="node-context-menu__danger" role="menuitem" type="button" disabled={!contextNode.children.length} onClick={() => trimContextNode(contextNode.id)}><span>⌫</span><span><strong>Trim splits below</strong><small>Remove this split and its descendants</small></span></button>
          </div>
        )}

        <aside className={`help-drawer${helpOpen ? " help-drawer--open" : ""}`} style={{ "--pane-width": `${paneWidth}px` } as CSSProperties} aria-label="ControlTree guide" aria-hidden={!helpOpen}>
          <div className="pane-resize-handle" role="separator" aria-label="Resize guide pane" aria-orientation="vertical" onPointerDown={startPaneResize} onPointerMove={movePaneResize} onPointerUp={finishPaneResize} onPointerCancel={finishPaneResize} />
          <div className="inspector__toolbar help-drawer__heading">
            <div><strong>ControlTree guide</strong><p>Learn the essential controls for building, exploring, saving, and presenting a tree.</p></div>
            <button className="inspector__close" type="button" onClick={() => setHelpOpen(false)} aria-label="Close guide">×</button>
          </div>
          <section><h3>1. Navigate the workspace</h3><p>Scroll to zoom. Drag empty space to move around the tree. Click a node to inspect it. Right-click a node to rename it, focus or collapse branches, copy and paste splits, or trim descendants.</p></section>
          <section><h3>2. Choose the target role</h3><p>The first toolbar tool defines the project target and where ControlTree should reuse it automatically.</p></section>
          <section><h3>3. Split, explore, and format</h3><p>The Split tool ranks variables first, then offers recommended or manual rules. Existing splits can be replaced, removed, or moved below a newly inserted split. Distribution explores values, Test measures separation, Metrics controls node summaries, Variable types defines data, and Tree settings controls appearance.</p></section>
          <section><h3>4. Save, present, or export</h3><p>Save creates a reusable project configuration without source rows. The Present tool supports fullscreen, a synchronized second screen, a clean tree PNG, and a CSV enriched with each row's node and optional target prediction.</p></section>
          <section><h3>Privacy</h3><p>CSV and Excel data is processed locally in the browser. Presentation state and tree images do not contain uploaded rows. The enriched CSV contains your source rows because it is created for you as a local download; it is not uploaded anywhere.</p></section>
          <a className="help-github-link" href="https://github.com/daniel-vital-de-alcantara/ControlTree" target="_blank" rel="noreferrer">More documentation on GitHub ↗</a>
        </aside>

        {homeWarningOpen && (
          <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHomeWarningOpen(false); }}>
            <section className="warning-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title" aria-describedby="unsaved-dialog-description">
              <div className="warning-dialog__icon" aria-hidden="true">!</div>
              <div>
                <p className="kicker">ControlTree project</p>
                <h2 id="unsaved-dialog-title">Unsaved changes</h2>
                <p id="unsaved-dialog-description">Your latest changes have not been saved. Returning home now will permanently delete this progress.</p>
              </div>
              <div className="warning-dialog__actions">
                <button className="danger-button" type="button" onClick={leaveWorkspace}>Delete progress</button>
                <button className="safe-button" type="button" autoFocus onClick={() => setHomeWarningOpen(false)}>Go back to tree</button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
