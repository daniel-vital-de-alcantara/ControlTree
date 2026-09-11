import type { DataValue, ParsedDataset } from "./dataset";
import { asNumber, columnPosition, isMissing, isNumericColumn } from "./data-engine";
import type { TreeNode } from "./domain";

export type SplitQuality = {
  nodeId: string;
  nodeTitle: string;
  score: number | null;
  childCount: number;
  smallestBranchPercent: number;
  warning?: string;
};

export type TreeQuality = {
  kind: "numeric" | "categorical";
  score: number | null;
  observed: number;
  missing: number;
  leafCount: number;
  splitCount: number;
  splits: SplitQuality[];
};

type Impurity = { value: number; count: number };

function categoryKey(value: DataValue): string {
  if (value instanceof Date) return `date:${value.toISOString()}`;
  return `${typeof value}:${String(value)}`;
}

function impurity(dataset: ParsedDataset, variable: string, indices: number[], numeric: boolean): Impurity {
  const position = columnPosition(dataset, variable);
  if (numeric) {
    const values = indices
      .map((index) => asNumber(dataset.rows[index]?.[position], dataset, variable))
      .filter((value): value is number => value !== null);
    if (!values.length) return { value: 0, count: 0 };
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      value: values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length,
      count: values.length,
    };
  }

  const counts = new Map<string, number>();
  for (const index of indices) {
    const value = dataset.rows[index]?.[position];
    if (isMissing(value)) continue;
    const key = categoryKey(value!);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const count = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (!count) return { value: 0, count: 0 };
  const gini = 1 - [...counts.values()].reduce((sum, value) => sum + (value / count) ** 2, 0);
  return { value: gini, count };
}

function reduction(parent: Impurity, children: Impurity[]): number | null {
  const observed = children.reduce((sum, child) => sum + child.count, 0);
  if (parent.count === 0 || observed === 0 || parent.value <= Number.EPSILON) return null;
  const within = children.reduce((sum, child) => sum + (child.count / observed) * child.value, 0);
  return Math.max(0, Math.min(100, (1 - within / parent.value) * 100));
}

function leaves(node: TreeNode): TreeNode[] {
  return node.children.length ? node.children.flatMap(leaves) : [node];
}

function splitNodes(node: TreeNode): TreeNode[] {
  return node.children.length ? [node, ...node.children.flatMap(splitNodes)] : [];
}

function indicesFor(dataset: ParsedDataset, node: TreeNode): number[] {
  return node.rowIndices ?? dataset.rows.map((_, index) => index);
}

export function qualityLabel(score: number | null): string {
  if (score === null) return "Not available";
  if (score >= 40) return "Strong";
  if (score >= 15) return "Moderate";
  if (score >= 2) return "Weak";
  return "Minimal";
}

export function evaluateTree(dataset: ParsedDataset, tree: TreeNode, variable: string): TreeQuality {
  const numeric = isNumericColumn(dataset, variable);
  const rootIndices = indicesFor(dataset, tree);
  const parent = impurity(dataset, variable, rootIndices, numeric);
  const terminalNodes = leaves(tree).filter((node) => indicesFor(dataset, node).length > 0);
  const internalNodes = splitNodes(tree);
  const terminalImpurities = terminalNodes.map((node) => impurity(dataset, variable, indicesFor(dataset, node), numeric));

  const splits = internalNodes.map((node): SplitQuality => {
    const nonEmptyChildren = node.children.filter((child) => indicesFor(dataset, child).length > 0);
    const childSizes = nonEmptyChildren.map((child) => indicesFor(dataset, child).length);
    const total = childSizes.reduce((sum, size) => sum + size, 0);
    const smallest = total ? Math.min(...childSizes) / total * 100 : 0;
    const warning = childSizes.some((size) => size < 20)
      ? "At least one branch has fewer than 20 rows."
      : smallest < 5
        ? "The split is highly unbalanced."
        : undefined;
    return {
      nodeId: node.id,
      nodeTitle: node.title,
      score: reduction(
        impurity(dataset, variable, indicesFor(dataset, node), numeric),
        nonEmptyChildren.map((child) => impurity(dataset, variable, indicesFor(dataset, child), numeric)),
      ),
      childCount: nonEmptyChildren.length,
      smallestBranchPercent: smallest,
      ...(warning ? { warning } : {}),
    };
  });

  return {
    kind: numeric ? "numeric" : "categorical",
    score: reduction(parent, terminalImpurities),
    observed: parent.count,
    missing: rootIndices.length - parent.count,
    leafCount: terminalNodes.length,
    splitCount: internalNodes.length,
    splits,
  };
}
