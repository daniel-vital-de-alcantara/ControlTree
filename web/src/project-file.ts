import type { TreeNode, TreeSplitDefinition } from "./domain";
import type { DistributionSettings } from "./distribution";
import { defaultAppearance, defaultNodeFields, type NodeFieldVisibility, type SummaryAggregation, type SummaryMetric, type TreeAppearance } from "./tree-settings";

export const CONTROLTREE_FORMAT = "controltree";
export const CONTROLTREE_VERSION = 1;

export type SavedTreeNode = {
  split?: TreeSplitDefinition;
  children: SavedTreeNode[];
};

export type ControlTreeProject = {
  format: typeof CONTROLTREE_FORMAT;
  version: typeof CONTROLTREE_VERSION;
  recommendationTarget?: string;
  appearance: TreeAppearance;
  nodeFields: NodeFieldVisibility;
  summaries: Array<{ variable: string; aggregation: SummaryAggregation; highlighted: boolean }>;
  distribution?: DistributionSettings;
  tree: SavedTreeNode;
};

const aggregations = new Set<SummaryAggregation>([
  "average", "sum", "min", "max", "count", "distinct", "missing",
]);

function savedNode(node: TreeNode): SavedTreeNode {
  return {
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
): ControlTreeProject {
  return {
    format: CONTROLTREE_FORMAT,
    version: CONTROLTREE_VERSION,
    ...(recommendationTarget ? { recommendationTarget } : {}),
    appearance: { ...appearance },
    nodeFields: { ...nodeFields },
    summaries: summaries.map(({ variable, aggregation, highlighted }) => ({ variable, aggregation, highlighted })),
    ...(distribution ? { distribution: { ...distribution } } : {}),
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
  if (typeof split.feature !== "string" || !split.feature) {
    throw new Error("A saved split is missing its variable.");
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
  if (!project.appearance || typeof project.appearance !== "object") throw new Error("The saved appearance is invalid.");
  const appearance = project.appearance as Record<string, unknown>;
  for (const key of ["nodeColor", "accentColor", "connectorColor"]) {
    if (typeof appearance[key] !== "string") throw new Error("The saved appearance is invalid.");
  }
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
    };
  });
  const savedFields = project.nodeFields && typeof project.nodeFields === "object"
    ? project.nodeFields as Record<string, unknown>
    : {};
  const nodeFields: NodeFieldVisibility = {
    nodeName: typeof savedFields.nodeName === "boolean" ? savedFields.nodeName : defaultNodeFields.nodeName,
    nodeTitle: typeof savedFields.nodeTitle === "boolean" ? savedFields.nodeTitle : defaultNodeFields.nodeTitle,
    rowCount: typeof savedFields.rowCount === "boolean" ? savedFields.rowCount : defaultNodeFields.rowCount,
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
  return {
    format: CONTROLTREE_FORMAT,
    version: CONTROLTREE_VERSION,
    ...(recommendationTarget ? { recommendationTarget } : {}),
    appearance: {
      nodeColor: appearance.nodeColor as string,
      accentColor: appearance.accentColor as string,
      connectorColor: appearance.connectorColor as string,
      backgroundColor: typeof appearance.backgroundColor === "string"
        ? appearance.backgroundColor
        : defaultAppearance.backgroundColor,
      showGrid: typeof appearance.showGrid === "boolean" ? appearance.showGrid : defaultAppearance.showGrid,
    },
    nodeFields,
    summaries,
    tree: parseNode(project.tree),
    ...(distribution ? { distribution } : {}),
  };
}

export async function readProjectFile(file: File): Promise<ControlTreeProject> {
  return parseProjectText(await file.text());
}

export function downloadProject(project: ControlTreeProject, datasetName: string) {
  const stem = datasetName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "tree";
  const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${stem}.controltree.json`;
  link.click();
  URL.revokeObjectURL(url);
}
