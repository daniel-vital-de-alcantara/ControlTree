export type SplitCandidate = {
  id: string;
  feature: string;
  operator: "<=" | "==";
  value: number | string | boolean;
  gain: number;
  criterion?: string;
  leftCount: number;
  rightCount: number;
  leftRowIndices?: number[];
  rightRowIndices?: number[];
};

export type TreeSplitDefinition =
  | {
      kind: "binary";
      feature: string;
      operator: "<=" | "==";
      value: number | string | boolean;
    }
  | {
      kind: "manual";
      feature: string;
      values: Array<number | string | boolean>;
      forceCategorical: boolean;
      includeOther: boolean;
    };

export type TreeNode = {
  id: string;
  title: string;
  samples: number;
  branchLabel?: string;
  split?: TreeSplitDefinition;
  rowIndices?: number[];
  children: TreeNode[];
};

export type ManualSplitResult = {
  feature: string;
  definition: TreeSplitDefinition;
  branches: Array<{
    label: string;
    count: number;
    rowIndices: number[];
  }>;
};

export function findTreeNode(root: TreeNode, nodeId: string): TreeNode | undefined {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const match = findTreeNode(child, nodeId);
    if (match) return match;
  }
  return undefined;
}

export function renameTreeNode(root: TreeNode, nodeId: string, title: string): TreeNode {
  if (root.id === nodeId) return { ...root, title };
  return { ...root, children: root.children.map((child) => renameTreeNode(child, nodeId, title)) };
}

export function describeRule(split: SplitCandidate): string {
  const value = typeof split.value === "string" ? `“${split.value}”` : String(split.value);
  return `${split.feature} ${split.operator} ${value}`;
}

export function describeTreeSplit(split: TreeSplitDefinition): string {
  if (split.kind === "binary") {
    const value = typeof split.value === "string" ? `“${split.value}”` : String(split.value);
    return `${split.feature} ${split.operator} ${value}`;
  }
  const values = split.values.map((value) => typeof value === "string" ? `“${value}”` : String(value)).join(", ");
  return `${split.feature}: ${values}`;
}

export function applySplit(
  root: TreeNode,
  nodeId: string,
  split: SplitCandidate,
): TreeNode {
  if (root.id !== nodeId) {
    return {
      ...root,
      children: root.children.map((child) => applySplit(child, nodeId, split)),
    };
  }

  const rule = describeRule(split);
  return {
    ...root,
    split: {
      kind: "binary",
      feature: split.feature,
      operator: split.operator,
      value: split.value,
    },
    children: [
      {
        id: `${root.id}.1`,
        title: "Matching rows",
        samples: split.leftCount,
        branchLabel: rule,
        rowIndices: split.leftRowIndices,
        children: [],
      },
      {
        id: `${root.id}.2`,
        title: "Remaining rows",
        samples: split.rightCount,
        branchLabel: `not (${rule})`,
        rowIndices: split.rightRowIndices,
        children: [],
      },
    ],
  };
}

export function applyManualSplit(
  root: TreeNode,
  nodeId: string,
  split: ManualSplitResult,
): TreeNode {
  if (root.id !== nodeId) {
    return {
      ...root,
      children: root.children.map((child) => applyManualSplit(child, nodeId, split)),
    };
  }

  return {
    ...root,
    split: split.definition,
    children: split.branches.map((branch, index) => ({
      id: `${root.id}.${index + 1}`,
      title: `Branch ${index + 1}`,
      samples: branch.count,
      branchLabel: branch.label,
      rowIndices: branch.rowIndices,
      children: [],
    })),
  };
}
