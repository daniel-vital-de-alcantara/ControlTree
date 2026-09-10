import type { TreeNode, TreeSplitDefinition } from "./domain";
import type { VariableTypeOverrides } from "./dataset";
import type { DistributionSettings } from "./distribution";
import { defaultTargetSettings, type TargetSettings } from "./target-settings";
import { defaultAppearance, defaultNodeFields, type MetricFormat, type NodeFieldVisibility, type SummaryAggregation, type SummaryMetric, type TreeAppearance } from "./tree-settings";

export const CONTROLTREE_FORMAT = "controltree";
export const CONTROLTREE_VERSION = 1;

export type SavedTreeNode = {
  title?: string;
  split?: TreeSplitDefinition;
  children: SavedTreeNode[];
};

export type ControlTreeProject = {
  format: typeof CONTROLTREE_FORMAT;
  version: typeof CONTROLTREE_VERSION;
  recommendationTarget?: string;
  targetSettings?: TargetSettings;
  appearance: TreeAppearance;
  nodeFields: NodeFieldVisibility;
  summaries: Array<{ variable: string; aggregation: SummaryAggregation; highlighted: boolean; label?: string; format?: MetricFormat; target?: boolean }>;
  distribution?: DistributionSettings;
  variableTypes?: VariableTypeOverrides;
  sourceFileName?: string;
  sourceFileSize?: number;
  sourceFileLastModified?: number;
  nodeNameHistory?: string[];
  tree: SavedTreeNode;
};

const aggregations = new Set<SummaryAggregation>([
  "average", "sum", "min", "max", "count", "distinct", "missing", "mode",
]);

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function normalizedNodeNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((name) => name.trim()).filter((name) => {
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

export function projectFingerprint(project: ControlTreeProject): string {
  return JSON.stringify(canonicalValue(project));
}

function savedNode(node: TreeNode): SavedTreeNode {
  return {
    title: node.title,
    ...(node.split ? { split: node.split } : {}),
    children: node.children.map(savedNode),
  };
}

export function createProject(
  tree: TreeNode,
  recommendationTarget: string | null,
  appearance: TreeAppearance,
  nodeFields: NodeFieldVisibility,
  summaries: SummaryMetric[],
  distribution: DistributionSettings | null = null,
  variableTypes: VariableTypeOverrides = {},
  sourceFileName?: string,
  sourceFileSize?: number,
  sourceFileLastModified?: number,
  targetSettings: TargetSettings = defaultTargetSettings,
  nodeNameHistory: string[] = [],
): ControlTreeProject {
  return {
    format: CONTROLTREE_FORMAT,
    version: CONTROLTREE_VERSION,
    ...(recommendationTarget ? { recommendationTarget } : {}),
    targetSettings: { ...targetSettings },
    appearance: { ...appearance },
    nodeFields: { ...nodeFields },
    summaries: summaries.map(({ variable, aggregation, highlighted, label, format, target }) => ({
      variable,
      aggregation,
      highlighted,
      ...(label?.trim() ? { label: label.trim() } : {}),
      ...(format && format !== "number" ? { format } : {}),
      ...(target ? { target: true } : {}),
    })),
    ...(distribution ? { distribution: { ...distribution } } : {}),
    ...(Object.keys(variableTypes).length ? { variableTypes: { ...variableTypes } } : {}),
    ...(sourceFileName ? { sourceFileName } : {}),
    ...(typeof sourceFileSize === "number" ? { sourceFileSize } : {}),
    ...(typeof sourceFileLastModified === "number" ? { sourceFileLastModified } : {}),
    ...(nodeNameHistory.length ? { nodeNameHistory: normalizedNodeNames(nodeNameHistory) } : {}),
    tree: savedNode(tree),
  };
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function parseSplit(value: unknown): TreeSplitDefinition {
  if (!value || typeof value !== "object") throw new Error("A saved split is invalid.");
  const split = value as Record<string, unknown>;
  if (split.kind === "random") {
    if (!Array.isArray(split.percentages) || split.percentages.length < 2 || !split.percentages.every((item) => typeof item === "number" && Number.isFinite(item) && item > 0) || typeof split.seed !== "number" || !Number.isFinite(split.seed)) {
      throw new Error("A saved random split is invalid.");
    }
    return { kind: "random", percentages: split.percentages as number[], seed: Math.trunc(split.seed) };
  }
  if (typeof split.feature !== "string" || !split.feature) {
    throw new Error("A saved split is missing its variable.");
  }
  if (split.kind === "percentile") {
    if (typeof split.buckets !== "number" || !Number.isInteger(split.buckets) || split.buckets < 2 || split.buckets > 10) {
      throw new Error("A saved percentile split is invalid.");
    }
    return { kind: "percentile", feature: split.feature, buckets: split.buckets };
  }
  if (split.kind === "binary") {
    if ((split.operator !== "<=" && split.operator !== "==") || !isPrimitive(split.value)) {
      throw new Error("A saved binary split is invalid.");
    }
    return { kind: "binary", feature: split.feature, operator: split.operator, value: split.value };
  }
  if (split.kind === "manual") {
    if (!Array.isArray(split.values) || split.values.length === 0 || !split.values.every(isPrimitive)) {
      throw new Error("A saved manual split is invalid.");
    }
    return {
      kind: "manual",
      feature: split.feature,
      values: split.values,
      forceCategorical: split.forceCategorical === true,
      includeOther: split.includeOther !== false,
    };
  }
  throw new Error("This file contains an unsupported split type.");
}

function parseNode(value: unknown): SavedTreeNode {
  if (!value || typeof value !== "object") throw new Error("The saved tree is invalid.");
  const node = value as Record<string, unknown>;
  if (!Array.isArray(node.children)) throw new Error("A saved tree node is invalid.");
  const parsed: SavedTreeNode = { children: node.children.map(parseNode) };
  if (node.title !== undefined) {
    if (typeof node.title !== "string") throw new Error("A saved node name is invalid.");
    parsed.title = node.title;
  }
  if (node.split !== undefined) parsed.split = parseSplit(node.split);
  if (parsed.split && parsed.children.length < 2) {
    throw new Error("A saved split must contain at least two branches.");
  }
  if (!parsed.split && parsed.children.length > 0) {
    throw new Error("A saved tree node has branches but no split rule.");
  }
  return parsed;
}

export function parseProjectText(text: string): ControlTreeProject {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("This is not a valid ControlTree JSON file.");
  }
  if (!value || typeof value !== "object") throw new Error("This project file is invalid.");
  const project = value as Record<string, unknown>;
  if (project.format !== CONTROLTREE_FORMAT) throw new Error("This is not a ControlTree project file.");
  if (project.version !== CONTROLTREE_VERSION) {
    throw new Error(`This ControlTree file version is not supported (expected version ${CONTROLTREE_VERSION}).`);
  }
  const legacyTarget = typeof project.target === "string" && project.target ? project.target : undefined;
  const recommendationTarget = typeof project.recommendationTarget === "string" && project.recommendationTarget
    ? project.recommendationTarget
    : legacyTarget;
  const savedTargetSettings = project.targetSettings && typeof project.targetSettings === "object"
    ? project.targetSettings as Record<string, unknown>
    : {};
  const targetSettings: TargetSettings = {
    dismissTargetReminder: typeof savedTargetSettings.dismissTargetReminder === "boolean"
      ? savedTargetSettings.dismissTargetReminder
      : defaultTargetSettings.dismissTargetReminder,
    useForRecommendations: typeof savedTargetSettings.useForRecommendations === "boolean"
      ? savedTargetSettings.useForRecommendations
      : defaultTargetSettings.useForRecommendations,
    useForTests: typeof savedTargetSettings.useForTests === "boolean"
      ? savedTargetSettings.useForTests
      : defaultTargetSettings.useForTests,
    useForDistribution: typeof savedTargetSettings.useForDistribution === "boolean"
      ? savedTargetSettings.useForDistribution
      : defaultTargetSettings.useForDistribution,
    showHighlightedMetric: typeof savedTargetSettings.showHighlightedMetric === "boolean"
      ? savedTargetSettings.showHighlightedMetric
      : defaultTargetSettings.showHighlightedMetric,
  };
  if (!project.appearance || typeof project.appearance !== "object") throw new Error("The saved appearance is invalid.");
  const appearance = project.appearance as Record<string, unknown>;
  for (const key of ["nodeColor", "accentColor", "connectorColor"]) {
    if (typeof appearance[key] !== "string") throw new Error("The saved appearance is invalid.");
  }
  const fontScale = typeof appearance.fontScale === "number" && Number.isFinite(appearance.fontScale)
    ? Math.min(1.5, Math.max(.8, appearance.fontScale))
    : defaultAppearance.fontScale;
  const nodeSpacing = typeof appearance.nodeSpacing === "number" && Number.isFinite(appearance.nodeSpacing)
    ? Math.min(1.6, Math.max(.6, appearance.nodeSpacing))
    : defaultAppearance.nodeSpacing;
  if (!Array.isArray(project.summaries)) throw new Error("The saved summaries are invalid.");
  const summaries = project.summaries.map((item) => {
    if (!item || typeof item !== "object") throw new Error("A saved summary is invalid.");
    const metric = item as Record<string, unknown>;
    if (typeof metric.variable !== "string" || !aggregations.has(metric.aggregation as SummaryAggregation)) {
      throw new Error("A saved summary is invalid.");
    }
    return {
      variable: metric.variable,
      aggregation: metric.aggregation as SummaryAggregation,
      highlighted: metric.highlighted === true,
      ...(typeof metric.label === "string" && metric.label.trim() ? { label: metric.label.trim() } : {}),
      ...(metric.format === "percentage" || metric.format === "compact" || metric.format === "percent_root" || metric.format === "percent_parent"
        ? { format: metric.format as MetricFormat }
        : {}),
      ...(metric.target === true ? { target: true } : {}),
    };
  });
  const savedFields = project.nodeFields && typeof project.nodeFields === "object"
    ? project.nodeFields as Record<string, unknown>
    : {};
  const nodeFields: NodeFieldVisibility = {
    nodeName: typeof savedFields.nodeName === "boolean" ? savedFields.nodeName : defaultNodeFields.nodeName,
    nodeTitle: typeof savedFields.nodeTitle === "boolean" ? savedFields.nodeTitle : defaultNodeFields.nodeTitle,
    rowCount: typeof savedFields.rowCount === "boolean" ? savedFields.rowCount : defaultNodeFields.rowCount,
    rowCountFormat: savedFields.rowCountFormat === "percent_root" || savedFields.rowCountFormat === "percent_parent"
      ? savedFields.rowCountFormat
      : "count",
  };
  let distribution: DistributionSettings | undefined;
  if (project.distribution !== undefined) {
    if (!project.distribution || typeof project.distribution !== "object") {
      throw new Error("The saved distribution settings are invalid.");
    }
    const savedDistribution = project.distribution as Record<string, unknown>;
    const validWidth = savedDistribution.binWidth === null || (
      typeof savedDistribution.binWidth === "number" &&
      Number.isFinite(savedDistribution.binWidth) &&
      savedDistribution.binWidth > 0
    );
    if (
      typeof savedDistribution.variable !== "string" ||
      !validWidth ||
      (savedDistribution.scale !== "count" && savedDistribution.scale !== "percentage")
    ) {
      throw new Error("The saved distribution settings are invalid.");
    }
    distribution = {
      variable: savedDistribution.variable,
      binWidth: savedDistribution.binWidth as number | null,
      scale: savedDistribution.scale,
    };
  }
  let variableTypes: VariableTypeOverrides | undefined;
  if (project.variableTypes !== undefined) {
    if (!project.variableTypes || typeof project.variableTypes !== "object" || Array.isArray(project.variableTypes)) {
      throw new Error("The saved variable types are invalid.");
    }
    variableTypes = {};
    for (const [variable, type] of Object.entries(project.variableTypes as Record<string, unknown>)) {
      if (!variable || (type !== "numeric" && type !== "categorical")) {
        throw new Error("The saved variable types are invalid.");
      }
      variableTypes[variable] = type;
    }
  }
  let nodeNameHistory: string[] | undefined;
  if (project.nodeNameHistory !== undefined) {
    if (!Array.isArray(project.nodeNameHistory) || !project.nodeNameHistory.every((name) => typeof name === "string")) {
      throw new Error("The saved node name history is invalid.");
    }
    nodeNameHistory = normalizedNodeNames(project.nodeNameHistory);
  }
  return {
    format: CONTROLTREE_FORMAT,
    version: CONTROLTREE_VERSION,
    ...(recommendationTarget ? { recommendationTarget } : {}),
    targetSettings,
    appearance: {
      nodeColor: appearance.nodeColor as string,
      accentColor: appearance.accentColor as string,
      connectorColor: appearance.connectorColor as string,
      backgroundColor: typeof appearance.backgroundColor === "string"
        ? appearance.backgroundColor
        : defaultAppearance.backgroundColor,
      showGrid: typeof appearance.showGrid === "boolean" ? appearance.showGrid : defaultAppearance.showGrid,
      fontScale,
      nodeSpacing,
    },
    nodeFields,
    summaries,
    tree: parseNode(project.tree),
    ...(distribution ? { distribution } : {}),
    ...(variableTypes && Object.keys(variableTypes).length ? { variableTypes } : {}),
    ...(typeof project.sourceFileName === "string" && project.sourceFileName ? { sourceFileName: project.sourceFileName } : {}),
    ...(typeof project.sourceFileSize === "number" && Number.isFinite(project.sourceFileSize) ? { sourceFileSize: project.sourceFileSize } : {}),
    ...(typeof project.sourceFileLastModified === "number" && Number.isFinite(project.sourceFileLastModified) ? { sourceFileLastModified: project.sourceFileLastModified } : {}),
    ...(nodeNameHistory?.length ? { nodeNameHistory } : {}),
  };
}

export async function readProjectFile(file: File): Promise<ControlTreeProject> {
  return parseProjectText(await file.text());
}

export function downloadProject(project: ControlTreeProject, datasetName: string) {
  const stem = datasetName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "tree";
  const fileName = `${stem}.controltree.json`;
  const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return fileName;
}

type WritableFileHandle = FileSystemFileHandle & {
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    id?: string;
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<WritableFileHandle>;
  controlTreeDesktop?: {
    saveProject: (contents: string, suggestedName: string) => Promise<string | null>;
  };
};

export async function saveProjectAs(project: ControlTreeProject, datasetName: string): Promise<string | null> {
  const stem = datasetName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "tree";
  const suggestedName = `${stem}.controltree.json`;
  const contents = `${JSON.stringify(project, null, 2)}\n`;
  const saveWindow = window as SavePickerWindow;
  if (saveWindow.controlTreeDesktop) {
    return saveWindow.controlTreeDesktop.saveProject(contents, suggestedName);
  }
  const picker = saveWindow.showSaveFilePicker;
  if (!picker) return downloadProject(project, datasetName);
  try {
    const handle = await picker.call(window, {
      id: "controltree-projects",
      suggestedName,
      types: [{
        description: "ControlTree project",
        accept: { "application/json": [".json"] },
      }],
    });
    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
    return handle.name;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") return null;
    throw reason;
  }
}
