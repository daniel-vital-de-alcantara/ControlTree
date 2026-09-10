import type { ParsedDataset } from "./dataset";
import { allRowIndices, materializeSplit } from "./data-engine";
import type { TreeNode } from "./domain";
import type { ControlTreeProject, SavedTreeNode } from "./project-file";

function materializeNode(
  dataset: ParsedDataset,
  saved: SavedTreeNode,
  rowIndices: number[],
  id: string,
  title: string,
  branchLabel?: string,
): TreeNode {
  const node: TreeNode = {
    id,
    title: saved.title ?? title,
    samples: rowIndices.length,
    ...(branchLabel ? { branchLabel } : {}),
    rowIndices,
    ...(saved.split ? { split: saved.split } : {}),
    children: [],
  };
  if (!saved.split) return node;
  const branches = materializeSplit(dataset, rowIndices, saved.split);
  if (branches.length !== saved.children.length || branches.some((branch) => branch.rowIndices.length === 0)) {
    throw new Error(
      `The saved split on '${saved.split.feature}' does not produce the same branches with this dataset. ` +
      "Check that this is a compatible data version.",
    );
  }
  node.children = branches.map((branch, index) => materializeNode(
    dataset,
    saved.children[index],
    branch.rowIndices,
    `${id}.${index + 1}`,
    saved.split?.kind === "binary"
      ? index === 0 ? "Matching rows" : "Remaining rows"
      : `Branch ${index + 1}`,
    branch.label,
  ));
  return node;
}

export async function replayProject(
  dataset: ParsedDataset,
  project: ControlTreeProject,
): Promise<TreeNode> {
  return materializeNode(dataset, project.tree, allRowIndices(dataset), "root", "All rows");
}
