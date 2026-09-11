import type { ParsedDataset } from "./dataset";
import { materializeSplit } from "./data-engine";
import type { ManualSplitResult, SplitCandidate, TreeNode, TreeSplitDefinition } from "./domain";

export type SplitApplication = "replace" | "insert";

export type PreparedSplit = {
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
  let branches;
  try {
    branches = materializeSplit(dataset, rowIndices, template.split);
  } catch {
    return base;
  }
  if (branches.length !== template.children.length) return base;
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

function applyTemplateToLeaves(dataset: ParsedDataset, node: TreeNode, template: TreeNode): TreeNode {
  if (node.children.length === 0) {
    return reapplyTemplate(dataset, template, node.rowIndices ?? [], node.id, node.title, node.branchLabel ?? "");
  }
  return { ...node, children: node.children.map((child) => applyTemplateToLeaves(dataset, child, template)) };
}

function preservedReplacementChildren(dataset: ParsedDataset, previous: TreeNode, split: PreparedSplit): TreeNode[] {
  const bases = split.branches.map((branch, index): TreeNode => ({
    id: `${previous.id}.${index + 1}`,
    title: split.definition.kind === "binary" ? index === 0 ? "Matching rows" : "Remaining rows" : split.definition.kind === "random" ? `Sample ${index + 1}` : split.definition.kind === "percentile" ? `Percentile ${index + 1}` : `Branch ${index + 1}`,
    samples: branch.count,
    branchLabel: branch.label,
    rowIndices: branch.rowIndices,
    children: [],
  }));
  const templatesByBranch = bases.map(() => [] as TreeNode[]);
  for (const template of previous.children.filter((child) => child.split)) {
    const originalRows = new Set(template.rowIndices ?? []);
    let bestIndex = -1;
    let bestOverlap = 0;
    split.branches.forEach((branch, index) => {
      const overlap = branch.rowIndices.reduce((count, rowIndex) => count + (originalRows.has(rowIndex) ? 1 : 0), 0);
      if (overlap > bestOverlap) { bestOverlap = overlap; bestIndex = index; }
    });
    if (bestIndex >= 0) templatesByBranch[bestIndex].push(template);
  }
  return bases.map((base, index) => templatesByBranch[index].reduce(
    (current, template) => applyTemplateToLeaves(dataset, current, template),
    base,
  ));
}

export function applyPreparedSplit(root: TreeNode, nodeId: string, split: PreparedSplit, mode: SplitApplication, dataset?: ParsedDataset): TreeNode {
  if (root.id !== nodeId) {
    return { ...root, children: root.children.map((child) => applyPreparedSplit(child, nodeId, split, mode, dataset)) };
  }
  const insert = mode === "insert" && root.children.length > 0 && root.split && dataset;
  const preserve = mode === "replace" && root.children.some((child) => child.split) && dataset;
  return {
    ...root,
    split: split.definition,
    children: preserve ? preservedReplacementChildren(dataset, root, split) : split.branches.map((branch, index) => insert
      ? reapplyTemplate(
          dataset,
          root,
          branch.rowIndices,
          `${root.id}.${index + 1}`,
          split.definition.kind === "binary" ? index === 0 ? "Matching rows" : "Remaining rows" : split.definition.kind === "random" ? `Sample ${index + 1}` : split.definition.kind === "percentile" ? `Percentile ${index + 1}` : `Branch ${index + 1}`,
          branch.label,
        )
      : {
          id: `${root.id}.${index + 1}`,
          title: split.definition.kind === "binary" ? index === 0 ? "Matching rows" : "Remaining rows" : split.definition.kind === "random" ? `Sample ${index + 1}` : split.definition.kind === "percentile" ? `Percentile ${index + 1}` : `Branch ${index + 1}`,
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
