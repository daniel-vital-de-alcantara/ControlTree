import type { ParsedDataset } from "./dataset";
import { findTreeNode, type TreeNode } from "./domain";
import { metricSortValue, type SummaryMetric, type TreeAppearance } from "./tree-settings";

function automaticOrder(children: TreeNode[], appearance: TreeAppearance, dataset?: ParsedDataset, targetMetric?: SummaryMetric): TreeNode[] {
  if (appearance.branchOrder === "split" || !dataset || !targetMetric) return children;
  const direction = appearance.branchOrder === "target-high-left" ? -1 : 1;
  return children
    .map((node, index) => ({ node, index, score: metricSortValue(dataset, node.rowIndices, targetMetric) }))
    .sort((left, right) => {
      if (left.score === null && right.score === null) return left.index - right.index;
      if (left.score === null) return 1;
      if (right.score === null) return -1;
      return (left.score - right.score) * direction || left.index - right.index;
    })
    .map(({ node }) => node);
}

export function orderTreeForDisplay(root: TreeNode, appearance: TreeAppearance, dataset?: ParsedDataset, targetMetric?: SummaryMetric): TreeNode {
  function visit(node: TreeNode): TreeNode {
    const customOrder = appearance.customBranchOrders[node.id];
    let children = automaticOrder(node.children, appearance, dataset, targetMetric);
    if (customOrder?.length) {
      const position = new Map(customOrder.map((id, index) => [id, index]));
      children = [...children].sort((left, right) =>
        (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    return { ...node, children: children.map(visit) };
  }
  return visit(root);
}

function parentId(nodeId: string): string | null {
  const separator = nodeId.lastIndexOf(".");
  return separator < 0 ? null : nodeId.slice(0, separator);
}

export function moveDisplayedSibling(root: TreeNode, appearance: TreeAppearance, sourceId: string, targetId: string): TreeAppearance {
  const sourceParent = parentId(sourceId);
  if (!sourceParent || sourceParent !== parentId(targetId) || sourceId === targetId) return appearance;
  const parent = findTreeNode(root, sourceParent);
  if (!parent) return appearance;
  const order = parent.children.map((child) => child.id);
  const sourceIndex = order.indexOf(sourceId);
  const targetIndex = order.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return appearance;
  [order[sourceIndex], order[targetIndex]] = [order[targetIndex], order[sourceIndex]];
  return { ...appearance, customBranchOrders: { ...appearance.customBranchOrders, [sourceParent]: order } };
}
