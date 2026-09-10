import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type SetStateAction, type WheelEvent as ReactWheelEvent } from "react";

import { DataSetup, type DatasetSelection } from "./DataSetup";
import { downloadEnrichedCsv } from "./data-export";
import { parseDatasetFile, summarizeTarget, type VariableType } from "./dataset";
import { splitCandidates, initialTree } from "./demo-data";
import { DistributionPane } from "./DistributionPane";
import { createDistributionSnapshot, type DistributionSettings } from "./distribution";
import { applySplit, describeRule, findTreeNode, renameTreeNode, type ManualSplitResult, type SplitCandidate, type TreeNode } from "./domain";
import { ManualSplitPane } from "./ManualSplitPane";
import { isEditableTarget, shortcutForEvent, shortcutLabel, shortcutsByGroup, treeNavigationTarget, type ShortcutId } from "./keyboard-shortcuts";
import { SpecialSplitPane } from "./SpecialSplitPane";
import { pickDatasetFile } from "./file-picker";
import { openPresentationWindow, presentationTree, publishPresentation, type PresentationState } from "./presentation";
import { PresentationView } from "./PresentationView";
import { createProject, projectFingerprint as fingerprintProject, saveProjectAs, type ControlTreeProject } from "./project-file";
import { replayProject } from "./replay";
import { candidateMatchesCurrentSplit, SplitPane } from "./SplitPane";
import { copySplitsToClipboard, pasteCopiedSplits, readSplitsFromClipboard } from "./split-clipboard";
import { applyPreparedSplit, preparedManualSplit, preparedRecommendedSplit, removeNodeSplit, type PreparedSplit, type SplitApplication } from "./split-operations";
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
  const [tree, setTreeState] = useState<TreeNode>(initialTree);
  const [selectedNodeId, setSelectedNodeId] = useState("root");
  const [selectedSplitId, setSelectedSplitId] = useState(splitCandidates[0].id);
  const [candidateCache, setCandidateCache] = useState<Record<string, SplitCandidate[]>>({});
  const [suggestionStatus, setSuggestionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionElapsed, setSuggestionElapsed] = useState(0);
  const [splitFeature, setSplitFeature] = useState("");
  const [sidebarMode, setSidebarMode] = useState<"node" | "tree" | "metrics" | "variables" | "target" | "test" | "present" | "more">("node");
  const [nodeTab, setNodeTab] = useState<"recommended" | "manual" | "random" | "percentile" | "distribution">("recommended");
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
  const [keyboardNodeId, setKeyboardNodeId] = useState("root");
  const [toolbarFocusIndex, setToolbarFocusIndex] = useState(0);
  const [viewFocusIndex, setViewFocusIndex] = useState(0);
  const [helpSection, setHelpSection] = useState<"guide" | "shortcuts">("guide");
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(-1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLElement>(null);
  const viewControlsRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const helpRef = useRef<HTMLElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const undoStackRef = useRef<Array<{ tree: TreeNode; nodeNames: string[] }>>([]);
  const redoStackRef = useRef<Array<{ tree: TreeNode; nodeNames: string[] }>>([]);
  const renameStartRef = useRef<TreeNode | null>(null);
  const modalReturnFocusRef = useRef<HTMLElement | null>(null);
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
  const activeDistributionSettings = distributionSettings;
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
  const findMatches = useMemo(() => {
    const nodes: TreeNode[] = [];
    const visit = (node: TreeNode) => { nodes.push(node); node.children.forEach(visit); };
    visit(tree);
    const query = findQuery.trim().toLocaleLowerCase();
    return query ? nodes.filter((node) => node.title.toLocaleLowerCase().includes(query) || node.id.toLocaleLowerCase().includes(query) || node.branchLabel?.toLocaleLowerCase().includes(query)) : nodes;
  }, [tree, findQuery]);
  const presentationDistribution = useMemo(() => {
    if (!showDistributionInPresentation || !uploadedDataset || !selectedNode || !activeDistributionSettings) return undefined;
    return createDistributionSnapshot(uploadedDataset, selectedNode, activeDistributionSettings, targetSettings.useForDistribution ? recommendationTarget : null);
  }, [showDistributionInPresentation, uploadedDataset, selectedNode, activeDistributionSettings, targetSettings.useForDistribution, recommendationTarget]);
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

  function setTree(action: SetStateAction<TreeNode>) {
    const next = typeof action === "function" ? action(tree) : action;
    if (next === tree) return;
    undoStackRef.current = [...undoStackRef.current.slice(-49), { tree, nodeNames: nodeNameHistory }];
    redoStackRef.current = [];
    setTreeState(next);
  }

  function replaceTree(next: TreeNode) {
    undoStackRef.current = [];
    redoStackRef.current = [];
    renameStartRef.current = null;
    setTreeState(next);
    setKeyboardNodeId(next.id);
  }

  function undoTree() {
    const previous = undoStackRef.current.at(-1);
    if (!previous) { setActionNotice("Nothing to undo."); return; }
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current.slice(-49), { tree, nodeNames: nodeNameHistory }];
    setTreeState(previous.tree);
    setNodeNameHistory(previous.nodeNames);
    const nextSelected = findTreeNode(previous.tree, selectedNodeId)?.id ?? previous.tree.id;
    setSelectedNodeId(nextSelected);
    setKeyboardNodeId(nextSelected);
    setActionNotice("Tree edit undone.");
  }

  function redoTree() {
    const next = redoStackRef.current.at(-1);
    if (!next) { setActionNotice("Nothing to redo."); return; }
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current.slice(-49), { tree, nodeNames: nodeNameHistory }];
    setTreeState(next.tree);
    setNodeNameHistory(next.nodeNames);
    const nextSelected = findTreeNode(next.tree, selectedNodeId)?.id ?? next.tree.id;
    setSelectedNodeId(nextSelected);
    setKeyboardNodeId(nextSelected);
    setActionNotice("Tree edit redone.");
  }

  function focusNodeCard(nodeId: string) {
    setKeyboardNodeId(nodeId);
    window.requestAnimationFrame(() => canvasRef.current?.querySelector<HTMLElement>(`.node-card[data-node-id="${CSS.escape(nodeId)}"]`)?.focus());
  }

  function fitTreeToView() {
    const canvas = canvasRef.current;
    const treeElement = canvas?.querySelector<HTMLElement>(".canvas__tree-origin > .tree");
    if (!canvas || !treeElement) return;
    const scale = Math.min(1.5, Math.max(.35, Math.min((canvas.clientWidth - 80) / treeElement.offsetWidth, (canvas.clientHeight - 150) / treeElement.offsetHeight)));
    setViewport({ x: canvas.clientWidth / 2 * (1 - scale), y: Math.max(72, (canvas.clientHeight - treeElement.offsetHeight * scale) / 2) - 88 * scale, scale });
  }

  function focusMajorRegion(direction: 1 | -1) {
    const toolbarTarget = toolbarRef.current?.querySelector<HTMLElement>(`[data-toolbar-index="${toolbarFocusIndex}"]:not(:disabled)`) ?? toolbarRef.current?.querySelector<HTMLElement>(".toolbar-button:not(:disabled)");
    const treeTarget = canvasRef.current?.querySelector<HTMLElement>(`.node-card[data-node-id="${CSS.escape(keyboardNodeId)}"]`) ?? canvasRef.current?.querySelector<HTMLElement>(".node-card");
    const viewTarget = viewControlsRef.current?.querySelector<HTMLElement>(`[data-view-index="${viewFocusIndex}"]`);
    const panelTarget = inspectorOpen ? inspectorRef.current : helpOpen ? helpRef.current : null;
    const regions = [toolbarTarget, treeTarget, viewTarget, panelTarget].filter((item): item is HTMLElement => Boolean(item));
    if (!regions.length) return;
    const active = document.activeElement as HTMLElement | null;
    let index = regions.findIndex((element) => element === active || element.closest("[data-keyboard-region]") === active?.closest("[data-keyboard-region]"));
    if (index < 0) index = direction > 0 ? -1 : 0;
    regions[(index + direction + regions.length) % regions.length].focus();
  }

  function handleRovingKeys(event: ReactKeyboardEvent<HTMLElement>, selector: string, current: number, setCurrent: (index: number) => void) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)].filter((item) => !item.matches(":disabled"));
    if (!items.length) return;
    event.preventDefault();
    const activeIndex = Math.max(0, items.findIndex((item) => item === document.activeElement));
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (activeIndex + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
    const originalIndex = Number(items[nextIndex].dataset.toolbarIndex ?? items[nextIndex].dataset.viewIndex ?? current);
    setCurrent(originalIndex);
    items[nextIndex].focus();
  }

  function handleTreeKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (isEditableTarget(event.target)) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const next = treeNavigationTarget(canvasTree, keyboardNodeId, event.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight");
      focusNodeCard(next);
    }
  }

  function focusInspectorControl(direction: 1 | -1) {
    const panel = inspectorOpen ? inspectorRef.current : helpOpen ? helpRef.current : null;
    if (!panel) return;
    const controls = [...panel.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable='true']")];
    if (!controls.length) return;
    const index = controls.findIndex((control) => control === document.activeElement);
    controls[(index + direction + controls.length) % controls.length].focus();
  }

  function activateTool(index: number) {
    if ((index === 0 || index === 3 || index === 4) && !uploadedDataset) { setActionNotice("Upload a dataset to use this tool."); return; }
    setToolbarFocusIndex(index);
    const actions = [toggleTarget, toggleMetrics, toggleSplit, toggleDistribution, toggleTest, toggleVariableTypes, toggleTreeSettings, togglePresentActions, toggleGuide, toggleMoreActions];
    actions[index]?.();
    window.requestAnimationFrame(() => (index === 8 ? helpRef.current : inspectorRef.current)?.focus());
  }

  function chooseFindResult(direction: 1 | -1 = 1) {
    if (!findMatches.length) return;
    const nextIndex = findIndex < 0
      ? direction > 0 ? 0 : findMatches.length - 1
      : (findIndex + direction + findMatches.length) % findMatches.length;
    const match = findMatches[nextIndex];
    setFindIndex(nextIndex);
    setSelectedNodeId(match.id);
    setKeyboardNodeId(match.id);
    setFocusNodeId(null);
    setCollapsedNodeIds((current) => current.filter((id) => !match.id.startsWith(`${id}.`)));
    window.requestAnimationFrame(() => focusNodeCard(match.id));
  }

  async function runShortcut(id: ShortcutId) {
    const node = findTreeNode(tree, selectedNodeId || keyboardNodeId);
    if (id.startsWith("tool-")) { activateTool(["tool-target", "tool-metrics", "tool-split", "tool-distribution", "tool-test", "tool-variables", "tool-tree", "tool-present", "tool-guide", "tool-more"].indexOf(id)); return; }
    if (id === "undo") { undoTree(); return; }
    if (id === "redo") { redoTree(); return; }
    if (id === "save") { await handleSave(); return; }
    if (id === "find") { setFindOpen(true); setFindIndex(-1); window.requestAnimationFrame(() => findInputRef.current?.focus()); return; }
    if (id === "zoom-in") { zoomAt(viewport.scale * 1.2); return; }
    if (id === "zoom-out") { zoomAt(viewport.scale / 1.2); return; }
    if (id === "fit") { fitTreeToView(); return; }
    if (id === "select-all") { setSelectedNodeId(tree.id); focusNodeCard(tree.id); setActionNotice("The whole tree is selected through its root node."); return; }
    if (id === "activate") { if (node) selectNode(node.id); return; }
    if (id === "context-menu" && node) {
      const card = canvasRef.current?.querySelector<HTMLElement>(`.node-card[data-node-id="${CSS.escape(node.id)}"]`);
      const rect = card?.getBoundingClientRect();
      openNodeContextMenu(node.id, rect?.left ?? 20, rect?.bottom ?? 80);
      return;
    }
    if (id === "copy") { if (node?.split) await copyContextSplits(node, "subtree"); else setActionNotice("The selected node has no split to copy."); return; }
    if (id === "cut") { if (node?.split) { await copyContextSplits(node, "subtree"); setTree((current) => removeNodeSplit(current, node.id)); setActionNotice("Split subtree cut to the clipboard."); } else setActionNotice("The selected node has no split to cut."); return; }
    if (id === "paste") { if (node && uploadedDataset) await pasteContextSplits(node.id); else setActionNotice("Paste is available for nodes backed by uploaded data."); return; }
    if (id === "delete") {
      if (!node?.split) { setActionNotice("The selected node has no split to remove."); return; }
      trimContextNode(node.id);
    }
  }

  useEffect(() => {
    if (!findTreeNode(canvasTree, keyboardNodeId)) setKeyboardNodeId(canvasTree.id);
  }, [canvasTree, keyboardNodeId]);

  useEffect(() => {
    const panels = [inspectorRef.current, helpRef.current];
    panels.forEach((panel) => panel?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [contenteditable='true']").forEach((control) => { control.tabIndex = -1; }));
  });

  useEffect(() => {
    function handleGlobalKeyboard(event: KeyboardEvent) {
      if (!selection) return;
      if (presentHere) return;
      if (homeWarningOpen) {
        if (event.key === "Escape") { event.preventDefault(); setHomeWarningOpen(false); window.requestAnimationFrame(() => modalReturnFocusRef.current?.focus()); }
        return;
      }
      if (contextMenu) {
        if (event.key === "Escape") { event.preventDefault(); setContextMenu(null); focusNodeCard(contextMenu.nodeId); }
        if (event.key === "Tab") { event.preventDefault(); setContextMenu(null); focusMajorRegion(event.shiftKey ? -1 : 1); }
        return;
      }
      if (event.key === "Tab") { event.preventDefault(); focusMajorRegion(event.shiftKey ? -1 : 1); return; }
      if (findOpen && event.key === "Escape") { event.preventDefault(); setFindOpen(false); focusNodeCard(keyboardNodeId); return; }
      if (isEditableTarget(event.target) && event.key === "Escape") {
        event.preventDefault();
        (event.target as HTMLElement).blur();
        (inspectorOpen ? inspectorRef.current : helpOpen ? helpRef.current : null)?.focus();
        return;
      }
      const inTree = Boolean((document.activeElement as HTMLElement | null)?.closest("[data-keyboard-region='tree']"));
      const shortcut = shortcutForEvent(event, inTree ? "tree" : "editor");
      if (!shortcut) return;
      if (shortcut.id === "escape") {
        event.preventDefault();
        if (findOpen) setFindOpen(false);
        else if (helpOpen) {
          setHelpOpen(false);
          setToolbarFocusIndex(8);
          window.requestAnimationFrame(() => toolbarRef.current?.querySelector<HTMLElement>("[data-toolbar-index='8']")?.focus());
        } else if (inspectorOpen) {
          setInspectorOpen(false);
          if (sidebarMode === "node" || sidebarMode === "test" || sidebarMode === "metrics") setSelectedNodeId("");
          window.requestAnimationFrame(() => toolbarRef.current?.querySelector<HTMLElement>(`[data-toolbar-index="${toolbarFocusIndex}"]`)?.focus());
        } else {
          setSelectedNodeId("");
          focusNodeCard(canvasTree.id);
        }
        return;
      }
      event.preventDefault();
      void runShortcut(shortcut.id);
    }
    window.addEventListener("keydown", handleGlobalKeyboard);
    return () => window.removeEventListener("keydown", handleGlobalKeyboard);
  });

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
    window.requestAnimationFrame(() => {
      contextMenuRef.current?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.tabIndex = -1; });
      contextMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
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

  function handleSpecialApply(split: PreparedSplit, mode: SplitApplication) {
    const nodeId = selectedNodeId;
    setTree((current) => applyPreparedSplit(current, nodeId, split, mode, uploadedDataset));
    setCandidateCache((current) => Object.fromEntries(Object.entries(current).filter(([cachedNodeId]) => !cachedNodeId.startsWith(`${nodeId}.`))));
    setSelectedNodeId(`${nodeId}.1`);
    setSplitFeature("");
    setNodeTab("recommended");
    setSuggestionStatus(recommendationTarget ? "loading" : "idle");
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
    replaceTree({
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
    setToolbarFocusIndex(0);
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
    replaceTree(restoredTree);
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
    const restoredFingerprintDistribution = restoredDistribution;
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
      if (targetSettings.useForDistribution) setShowDistributionInPresentation(false);
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
    replaceTree(initialTree);
    setSelectedSplitId(splitCandidates[0].id);
    setSelectedNodeId("");
    setDistributionSettings(null);
    setShowDistributionInPresentation(false);
    setInspectorOpen(false);
    setViewport({ x: 0, y: 0, scale: 1 });
    setProjectFileName("Untitled tree");
    setSavedProjectFingerprint(null);
    setToolbarFocusIndex(1);
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
    setKeyboardNodeId(nodeId);
    if (inspectorOpen && (sidebarMode === "test" || sidebarMode === "metrics")) {
      setSelectedNodeId(nodeId);
      setHelpOpen(false);
      return;
    }
    const node = findTreeNode(tree, nodeId);
    if (!(inspectorOpen && sidebarMode === "node" && nodeTab === "distribution")) setNodeTab(node?.split?.kind === "manual" ? "manual" : node?.split?.kind === "random" ? "random" : node?.split?.kind === "percentile" ? "percentile" : "recommended");
    setSplitFeature(node?.split && node.split.kind !== "random" ? node.split.feature : "");
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

  function handleNodeTitleChange(title: string) {
    if (!selectedNodeId) return;
    if (!renameStartRef.current) renameStartRef.current = tree;
    setTreeState((current) => renameTreeNode(current, selectedNodeId, title));
  }

  function handleNodeTitleCommit(title: string) {
    if (!selectedNodeId) return;
    const finalTree = renameTreeNode(tree, selectedNodeId, title);
    const original = renameStartRef.current;
    if (original && findTreeNode(original, selectedNodeId)?.title !== title) {
      undoStackRef.current = [...undoStackRef.current.slice(-49), { tree: original, nodeNames: nodeNameHistory }];
      redoStackRef.current = [];
    }
    renameStartRef.current = null;
    setTreeState(finalTree);
    rememberNodeName(title);
  }

  function handleNodeTitleCancel() {
    if (renameStartRef.current) setTreeState(renameStartRef.current);
    renameStartRef.current = null;
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
      setSplitFeature(pastedNode?.split && pastedNode.split.kind !== "random" ? pastedNode.split.feature : "");
      setNodeTab(pastedNode?.split?.kind === "manual" ? "manual" : pastedNode?.split?.kind === "random" ? "random" : pastedNode?.split?.kind === "percentile" ? "percentile" : "recommended");
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
    setNodeTab(selectedNode?.split?.kind === "manual" ? "manual" : selectedNode?.split?.kind === "random" ? "random" : selectedNode?.split?.kind === "percentile" ? "percentile" : "recommended");
    setSplitFeature(selectedNode?.split && selectedNode.split.kind !== "random" ? selectedNode.split.feature : "");
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

  function toggleGuide() {
    const active = helpOpen;
    setHelpOpen(!active);
    setInspectorOpen(false);
    setSelectedNodeId("");
    if (!active) setHelpSection("guide");
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
        if (node.split && node.split.kind !== "random") requiredVariables.add(node.split.feature);
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
      replaceTree(replayedTree);
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
      modalReturnFocusRef.current = document.activeElement as HTMLElement | null;
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
        <a className="brand" href="#" tabIndex={-1} aria-label="Return to the ControlTree home screen" onClick={(event) => { event.preventDefault(); handleGoHome(); }}>
          <span className="brand__mark" aria-hidden="true">⌁</span>
          <span>ControlTree</span>
        </a>
        <span className="workspace-context__divider" />
        <button className={`workspace-project${isDirty ? " workspace-project--dirty" : ""}`} tabIndex={-1} type="button" onClick={handleSave} aria-label={`Save ${projectFileName}; ${isDirty ? "unsaved changes" : "currently saved"}`}>
          <span aria-hidden="true">●</span>
          <strong>{projectFileName}</strong>
          <small>{isDirty ? "Unsaved changes" : "Saved"}</small>
        </button>
      </div>

      <nav ref={toolbarRef} className="workspace-actions keyboard-region" data-keyboard-region="tools" role="toolbar" aria-label="ControlTree tools" onKeyDown={(event) => handleRovingKeys(event, ".toolbar-button", toolbarFocusIndex, setToolbarFocusIndex)}>
        <button data-toolbar-index="0" tabIndex={toolbarFocusIndex === 0 ? 0 : -1} onFocus={() => setToolbarFocusIndex(0)} className={`toolbar-button${inspectorOpen && sidebarMode === "target" ? " toolbar-button--selected" : ""}${uploadedDataset && !recommendationTarget && !targetSettings.dismissTargetReminder ? " toolbar-button--attention" : ""}`} type="button" disabled={!uploadedDataset} data-tooltip={uploadedDataset ? recommendationTarget ? "1 · Target variable" : targetSettings.dismissTargetReminder ? "1 · No target selected" : "1 · Choose a target variable" : "1 · Target is available with uploaded data"} aria-label={recommendationTarget ? "Target variable" : targetSettings.dismissTargetReminder ? "No target selected" : "Choose a target variable"} onClick={toggleTarget}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m15 9 6-6M17 3h4v4"/></svg>
        </button>
        <button data-toolbar-index="1" tabIndex={toolbarFocusIndex === 1 ? 0 : -1} onFocus={() => setToolbarFocusIndex(1)} className={`toolbar-button${inspectorOpen && sidebarMode === "metrics" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="2 · Metrics" aria-label="Metrics" onClick={toggleMetrics}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 5H8l6 7-6 7h10M4 5h1M4 12h1M4 19h1"/></svg>
        </button>
        <button data-toolbar-index="2" tabIndex={toolbarFocusIndex === 2 ? 0 : -1} onFocus={() => setToolbarFocusIndex(2)} className={`toolbar-button${inspectorOpen && sidebarMode === "node" && nodeTab !== "distribution" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="3 · Split" aria-label="Open split tools" onClick={toggleSplit}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="5" rx="1"/><rect x="2" y="16" width="8" height="5" rx="1"/><rect x="14" y="16" width="8" height="5" rx="1"/><path d="M12 8v4M6 12h12M6 12v4M18 12v4"/></svg>
        </button>
        <button data-toolbar-index="3" tabIndex={toolbarFocusIndex === 3 ? 0 : -1} onFocus={() => setToolbarFocusIndex(3)} className={`toolbar-button${inspectorOpen && sidebarMode === "node" && nodeTab === "distribution" ? " toolbar-button--selected" : ""}`} type="button" disabled={!uploadedDataset} data-tooltip={uploadedDataset ? "4 · Distribution" : "4 · Upload data to use Distribution"} aria-label="Open distribution" onClick={toggleDistribution}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20V10M9.3 20V5M14.7 20v-8M20 20V8M2 20h20"/></svg>
        </button>
        <button data-toolbar-index="4" tabIndex={toolbarFocusIndex === 4 ? 0 : -1} onFocus={() => setToolbarFocusIndex(4)} className={`toolbar-button${inspectorOpen && sidebarMode === "test" ? " toolbar-button--selected" : ""}`} type="button" disabled={!uploadedDataset} data-tooltip={uploadedDataset ? "5 · Test tree" : "5 · Upload data to test the tree"} aria-label="Test tree" onClick={toggleTest}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M8 15h8"/></svg>
        </button>
        <button data-toolbar-index="5" tabIndex={toolbarFocusIndex === 5 ? 0 : -1} onFocus={() => setToolbarFocusIndex(5)} className={`toolbar-button${inspectorOpen && sidebarMode === "variables" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="6 · Variable types" aria-label="Variable types" onClick={toggleVariableTypes}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 19 8 5l5 14M5 14h6M15 7h6M18 5v14"/></svg>
        </button>
        <button data-toolbar-index="6" tabIndex={toolbarFocusIndex === 6 ? 0 : -1} onFocus={() => setToolbarFocusIndex(6)} className={`toolbar-button${inspectorOpen && sidebarMode === "tree" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="7 · Tree settings" aria-label="Tree settings" onClick={toggleTreeSettings}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/><circle cx="14" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>
        </button>
        <button data-toolbar-index="7" tabIndex={toolbarFocusIndex === 7 ? 0 : -1} onFocus={() => setToolbarFocusIndex(7)} className={`toolbar-button${inspectorOpen && sidebarMode === "present" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="8 · Present tree" aria-label="Present tree" onClick={togglePresentActions}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M10 8l5 2.5-5 2.5z"/></svg>
        </button>
        <button data-toolbar-index="8" tabIndex={toolbarFocusIndex === 8 ? 0 : -1} onFocus={() => setToolbarFocusIndex(8)} className={`toolbar-button${helpOpen ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="9 · ControlTree guide" aria-label="Open the ControlTree guide" onClick={toggleGuide}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23zM20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23z"/></svg>
        </button>
        <button data-toolbar-index="9" tabIndex={toolbarFocusIndex === 9 ? 0 : -1} onFocus={() => setToolbarFocusIndex(9)} className={`toolbar-button${inspectorOpen && sidebarMode === "more" ? " toolbar-button--selected" : ""}`} type="button" data-tooltip="0 · More actions" aria-label="More actions" onClick={toggleMoreActions}>
          <svg className="toolbar-dots-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
        </button>
      </nav>

      <input ref={dataSourceInputRef} tabIndex={-1} className="file-input" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleDataSourceInput} />

      <main id="workspace" className="workspace">
        {findOpen && <div className="node-find" role="search" aria-label="Find a tree node">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
          <input ref={findInputRef} tabIndex={-1} value={findQuery} onChange={(event) => { setFindQuery(event.target.value); setFindIndex(-1); }} onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); chooseFindResult(event.shiftKey ? -1 : 1); }
          }} placeholder="Find node name, ID, or branch…" aria-label="Find node" />
          <span>{findMatches.length ? findIndex >= 0 ? `${findIndex + 1} / ${findMatches.length}` : `${findMatches.length} matches` : "No matches"}</span>
          <button tabIndex={-1} type="button" onClick={() => chooseFindResult(-1)} disabled={!findMatches.length} aria-label="Previous matching node">↑</button>
          <button tabIndex={-1} type="button" onClick={() => chooseFindResult(1)} disabled={!findMatches.length} aria-label="Next matching node">↓</button>
          <button tabIndex={-1} type="button" onClick={() => { setFindOpen(false); focusNodeCard(keyboardNodeId); }} aria-label="Close node search">×</button>
        </div>}
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
            onKeyDown={handleTreeKeys}
          >
            <div className="canvas__grid" />
            <div className="canvas__camera" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
              <div className="canvas__tree-origin">
                <TreeCanvas
                  node={canvasTree}
                  selectedNodeId={selectedNodeId}
                  keyboardFocusedNodeId={keyboardNodeId}
                  onSelectNode={selectNode}
                  onKeyboardFocusNode={setKeyboardNodeId}
                  onNodeContextMenu={openNodeContextMenu}
                  summaries={nodeSummaries}
                  nodeFields={nodeFields}
                  rootSamples={tree.samples}
                />
              </div>
            </div>
            <div ref={viewControlsRef} className="canvas-controls keyboard-region" data-keyboard-region="view" role="toolbar" aria-label="Canvas view controls" onKeyDown={(event) => handleRovingKeys(event, "button", viewFocusIndex, setViewFocusIndex)}>
              <button data-view-index="0" tabIndex={viewFocusIndex === 0 ? 0 : -1} onFocus={() => setViewFocusIndex(0)} type="button" onClick={() => zoomAt(viewport.scale / 1.2)} aria-label="Zoom out">−</button>
              <span>{Math.round(viewport.scale * 100)}%</span>
              <button data-view-index="1" tabIndex={viewFocusIndex === 1 ? 0 : -1} onFocus={() => setViewFocusIndex(1)} type="button" onClick={() => zoomAt(viewport.scale * 1.2)} aria-label="Zoom in">+</button>
              <button data-view-index="2" tabIndex={viewFocusIndex === 2 ? 0 : -1} onFocus={() => setViewFocusIndex(2)} type="button" onClick={fitTreeToView}>Fit tree</button>
              <button data-view-index="3" tabIndex={viewFocusIndex === 3 ? 0 : -1} onFocus={() => setViewFocusIndex(3)} type="button" onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}>Reset view</button>
            </div>
          </div>
        </section>

        <aside ref={inspectorRef} tabIndex={inspectorOpen ? 0 : -1} data-keyboard-region="inspector" className={`inspector keyboard-region${inspectorOpen ? " inspector--open" : ""}`} style={{ "--pane-width": `${paneWidth}px` } as CSSProperties} aria-label="Tool pane" aria-hidden={!inspectorOpen} onKeyDown={(event) => {
          if (isEditableTarget(event.target)) return;
          if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); focusInspectorControl(1); }
          if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); focusInspectorControl(-1); }
          if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); focusInspectorControl(1); }
        }}>
          <div className="pane-resize-handle" role="separator" aria-label="Resize tool pane" aria-orientation="vertical" onPointerDown={startPaneResize} onPointerMove={movePaneResize} onPointerUp={finishPaneResize} onPointerCancel={finishPaneResize} />
          <div className="inspector__toolbar">
            <div>
              <strong>{inspectorCopy.title}</strong>
              <p>{inspectorCopy.description}</p>
            </div>
            <button className="inspector__close" type="button" onClick={() => { setInspectorOpen(false); if (sidebarMode === "node" || sidebarMode === "test" || sidebarMode === "metrics") setSelectedNodeId(""); setNodeTab("recommended"); window.requestAnimationFrame(() => toolbarRef.current?.querySelector<HTMLElement>(`[data-toolbar-index="${toolbarFocusIndex}"]`)?.focus()); }} aria-label="Close inspector">×</button>
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
              onNodeTitleChange={handleNodeTitleChange}
              onNodeTitleCommit={handleNodeTitleCommit}
              onNodeTitleCancel={handleNodeTitleCancel}
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
                    target={targetSettings.useForDistribution ? recommendationTarget : null}
                    settings={activeDistributionSettings}
                    showInPresentation={showDistributionInPresentation}
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
                    feature={splitFeature || (selectedNode.split && selectedNode.split.kind !== "random" ? selectedNode.split.feature : "") || uploadedDataset.columns[0] || ""}
                    onBack={() => { setNodeTab("recommended"); setSplitFeature(""); }}
                    onApply={handleManualApply}
                    onRemoveSplit={handleRemoveSelectedSplit}
                  />
                ) : (
                  <div className="empty-state">Upload a dataset to create manual multiway splits.</div>
                )
              ) : nodeTab === "random" || nodeTab === "percentile" ? (
                uploadedDataset && selectedNode?.rowIndices ? (
                  <SpecialSplitPane
                    key={`${selectedNode.id}:${nodeTab}:${splitFeature}`}
                    dataset={uploadedDataset}
                    node={selectedNode}
                    mode={nodeTab}
                    feature={splitFeature}
                    onBack={() => { setNodeTab("recommended"); if (nodeTab === "random") setSplitFeature(""); }}
                    onApply={handleSpecialApply}
                    onRemoveSplit={handleRemoveSelectedSplit}
                  />
                ) : <div className="empty-state">Upload a dataset to create this split.</div>
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
                    onRandom={() => setNodeTab("random")}
                    onPercentile={() => setNodeTab("percentile")}
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
          <div ref={contextMenuRef} className="node-context-menu" role="menu" aria-label={`Actions for ${contextNode.title}`} style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={(event) => event.preventDefault()} onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
            const current = items.findIndex((item) => item === document.activeElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
            items[next]?.focus();
          }}>
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

        <aside ref={helpRef} tabIndex={helpOpen ? 0 : -1} data-keyboard-region="inspector" className={`help-drawer keyboard-region${helpOpen ? " help-drawer--open" : ""}`} style={{ "--pane-width": `${paneWidth}px` } as CSSProperties} aria-label="ControlTree guide" aria-hidden={!helpOpen} onKeyDown={(event) => {
          if (isEditableTarget(event.target)) return;
          if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); focusInspectorControl(1); }
          if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); focusInspectorControl(-1); }
          if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); focusInspectorControl(1); }
        }}>
          <div className="pane-resize-handle" role="separator" aria-label="Resize guide pane" aria-orientation="vertical" onPointerDown={startPaneResize} onPointerMove={movePaneResize} onPointerUp={finishPaneResize} onPointerCancel={finishPaneResize} />
          <div className="inspector__toolbar help-drawer__heading">
            <div><strong>{helpSection === "shortcuts" ? "Keyboard shortcuts" : "ControlTree guide"}</strong><p>{helpSection === "shortcuts" ? "Use ControlTree quickly without losing normal typing behavior." : "Learn the essential controls for building, exploring, saving, and presenting a tree."}</p></div>
            <button className="inspector__close" type="button" onClick={() => { setHelpOpen(false); setToolbarFocusIndex(8); window.requestAnimationFrame(() => toolbarRef.current?.querySelector<HTMLElement>("[data-toolbar-index='8']")?.focus()); }} aria-label="Close guide">×</button>
          </div>
          <div className="guide-options" role="toolbar" aria-label="Guide sections">
            <button className={helpSection === "guide" ? "active" : ""} type="button" onClick={() => setHelpSection("guide")}>Guide</button>
            <button className={helpSection === "shortcuts" ? "active" : ""} type="button" onClick={() => setHelpSection("shortcuts")}>Keyboard shortcuts</button>
          </div>
          {helpSection === "guide" ? <>
            <section><h3>1. Navigate the workspace</h3><p>Scroll to zoom. Drag empty space to move around the tree. Tab moves between major regions; arrow keys move within them. Click a node to inspect it. Right-click a node to rename it, focus or collapse branches, copy and paste splits, or trim descendants.</p></section>
            <section><h3>2. Choose the target role</h3><p>The first toolbar tool defines the project target and where ControlTree should reuse it automatically.</p></section>
            <section><h3>3. Split, explore, and format</h3><p>The Split tool offers a searchable ranked variable list, recommended or manual rules, random samples, and percentile groups. Existing splits can be replaced, removed, or moved below a newly inserted split. Distribution provides profiles, target comparisons, bucket examples, and scatter plots.</p></section>
            <section><h3>4. Save, present, or export</h3><p>Save creates a reusable project configuration without source rows. The Present tool supports fullscreen, a synchronized second screen, a clean tree PNG, and a CSV enriched with each row's node and optional target prediction.</p></section>
            <section><h3>Privacy</h3><p>CSV and Excel data is processed locally in the browser. Presentation state and tree images do not contain uploaded rows. The enriched CSV contains your source rows because it is created for you as a local download; it is not uploaded anywhere.</p></section>
            <a className="help-github-link" href="https://github.com/daniel-vital-de-alcantara/ControlTree" target="_blank" rel="noreferrer">More documentation on GitHub ↗</a>
          </> : <div className="shortcut-reference">
            <p className="shortcut-reference__note">Shortcuts pause while you type in a text, number, search, or selection field. Press Escape to leave an edit.</p>
            {shortcutsByGroup("editor").map((section) => <section key={section.group}><h3>{section.group}</h3><div>{section.shortcuts.map((shortcut) => <div className="shortcut-row" key={shortcut.id}><span>{shortcut.title}</span><kbd>{shortcutLabel(shortcut)}</kbd></div>)}</div></section>)}
          </div>}
        </aside>

        {homeWarningOpen && (
          <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHomeWarningOpen(false); }}>
            <section className="warning-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title" aria-describedby="unsaved-dialog-description" onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
              const index = buttons.findIndex((button) => button === document.activeElement);
              event.preventDefault();
              buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
            }}>
              <div className="warning-dialog__icon" aria-hidden="true">!</div>
              <div>
                <p className="kicker">ControlTree project</p>
                <h2 id="unsaved-dialog-title">Unsaved changes</h2>
                <p id="unsaved-dialog-description">Your latest changes have not been saved. Returning home now will permanently delete this progress.</p>
              </div>
              <div className="warning-dialog__actions">
                <button className="danger-button" type="button" onClick={leaveWorkspace}>Delete progress</button>
                <button className="safe-button" type="button" autoFocus onClick={() => { setHomeWarningOpen(false); window.requestAnimationFrame(() => modalReturnFocusRef.current?.focus()); }}>Go back to tree</button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
