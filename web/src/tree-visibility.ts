import { findTreeNode, type TreeNode } from "./domain";

export function visibleTree(root: TreeNode, focusNodeId: string | null, collapsedNodeIds: string[]): TreeNode {
  const focused = focusNodeId ? findTreeNode(root, focusNodeId) ?? root : root;
  const collapsed = new Set(collapsedNodeIds);
  function copy(node: TreeNode): TreeNode {
    return { ...node, children: collapsed.has(node.id) ? [] : node.children.map(copy) };
  }
  return copy(focused);
}
