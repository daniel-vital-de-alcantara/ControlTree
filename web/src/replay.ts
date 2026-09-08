import type { ParsedDataset } from "./dataset";
import type { TreeNode, TreeSplitDefinition } from "./domain";
import type { ControlTreeProject, SavedTreeNode } from "./project-file";

type ApiNode = {
  id: string;
  title: string;
  samples: number;
  branch_label?: string;
  row_indices: number[];
  split?: {
    kind: "binary" | "manual";
    feature: string;
    operator?: "<=" | "==";
    value?: string | number | boolean;
    values?: Array<string | number | boolean>;
    force_categorical?: boolean;
    include_other?: boolean;
  };
  children: ApiNode[];
};

function requestNode(node: SavedTreeNode): object {
  const split = node.split?.kind === "manual"
    ? {
        kind: node.split.kind,
        feature: node.split.feature,
        values: node.split.values,
        force_categorical: node.split.forceCategorical,
        include_other: node.split.includeOther,
      }
    : node.split;
  return { ...(split ? { split } : {}), children: node.children.map(requestNode) };
}

function splitDefinition(split: NonNullable<ApiNode["split"]>): TreeSplitDefinition {
  if (split.kind === "binary") {
    return {
      kind: "binary",
      feature: split.feature,
      operator: split.operator ?? "==",
      value: split.value ?? "",
    };
  }
  return {
    kind: "manual",
    feature: split.feature,
    values: split.values ?? [],
    forceCategorical: split.force_categorical ?? false,
    includeOther: split.include_other ?? true,
  };
}

function treeNode(node: ApiNode): TreeNode {
  return {
    id: node.id,
    title: node.title,
    samples: node.samples,
    branchLabel: node.branch_label,
    rowIndices: node.row_indices,
    ...(node.split ? { split: splitDefinition(node.split) } : {}),
    children: node.children.map(treeNode),
  };
}

export async function replayProject(
  dataset: ParsedDataset,
  project: ControlTreeProject,
): Promise<TreeNode> {
  const response = await fetch("/api/replay-tree", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      columns: dataset.columns,
      rows: dataset.rows,
      tree: requestNode(project.tree),
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "The saved tree could not be applied to this dataset.");
  }
  return treeNode(await response.json() as ApiNode);
}
