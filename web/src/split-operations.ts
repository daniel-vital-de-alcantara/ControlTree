import type { ParsedDataset } from "./dataset";
import { materializeSplit } from "./data-engine";
import type { ManualSplitResult, SplitCandidate, TreeNode, TreeSplitDefinition } from "./domain";

export type SplitApplication = "replace" | "insert";

type PreparedSplit = {
  definition: TreeSplitDefinition;
  branches: Array<{ label: string; count: number; rowIndices: number[] }>;
};

export function preparedRecommendedSplit(candidate: SplitCandidate): PreparedSplit {
  return {
    definition: { kind: "binary", feature: candidate.feature, operator: candidate.operator, value: candidate.value },
    branches: [
      { label: `${candidate.feature} ${candidate.operator} ${typeof candidate.value === "string" ? `“${candidate.value}”` : String(candidate.value)}`, count: candidate.leftCount, rowIndices: candidate.leftRowIndices ?? [] },
      { label: `not (${candidate.feature} ${candidate.operator} ${typeof candidate.value === "string" ? `“${candidate.value}”` : String(candidate.value)})`, count: candidate.rightCount, rowIndices: candidate.rightRowIndices ?? [] },
    ],
  };
}

export function preparedManualSplit(split: ManualSplitResult): PreparedSplit {
  return { definition: split.definition, branches: split.branches };
}

function reapplyTemplate(dataset: ParsedDataset, template: TreeNode, rowIndices: number[], id: string, title: string, branchLabel: string): TreeNode {
  const base: TreeNode = { id, title, branchLabel, samples: rowIndices.length, rowIndices, children: [] };
  if (!template.split) return base;
  const branches = materializeSplit(dataset, rowIndices, template.split);
  if (branches.length !== template.children.length || branches.some((branch) => branch.rowIndices.length === 0)) return base;
  return {
    ...base,
    split: template.split,
    children: branches.map((branch, index) => reapplyTemplate(
      dataset,
      template.children[index],
      branch.rowIndices,
      `${id}.${index + 1}`,
      template.children[index].title,
      branch.label,
    )),
  };
}

export function applyPreparedSplit(root: TreeNode, nodeId: string, split: PreparedSplit, mode: SplitApplication, dataset?: ParsedDataset): TreeNode {
  if (root.id !== nodeId) {
    return { ...root, children: root.children.map((child) => applyPreparedSplit(child, nodeId, split, mode, dataset)) };
  }
  const insert = mode === "insert" && root.children.length > 0 && root.split && dataset;
  return {
    ...root,
    split: split.definition,
    children: split.branches.map((branch, index) => insert
      ? reapplyTemplate(
          dataset,
          root,
          branch.rowIndices,
          `${root.id}.${index + 1}`,
          split.definition.kind === "binary" ? index === 0 ? "Matching rows" : "Remaining rows" : `Branch ${index + 1}`,
          branch.label,
        )
      : {
          id: `${root.id}.${index + 1}`,
          title: split.definition.kind === "binary" ? index === 0 ? "Matching rows" : "Remaining rows" : `Branch ${index + 1}`,
          samples: branch.count,
          branchLabel: branch.label,
          rowIndices: branch.rowIndices,
          children: [],
        }),
  };
}

export function removeNodeSplit(root: TreeNode, nodeId: string): TreeNode {
  if (root.id === nodeId) {
    const { split: _split, ...node } = root;
    return { ...node, children: [] };
  }
  return { ...root, children: root.children.map((child) => removeNodeSplit(child, nodeId)) };
}
