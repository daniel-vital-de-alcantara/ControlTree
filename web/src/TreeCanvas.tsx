import type { MouseEvent as ReactMouseEvent } from "react";

import type { TreeNode } from "./domain";
import { defaultNodeFields, type NodeFieldVisibility, type NodeSummaryMap } from "./tree-settings";

type Props = {
  node: TreeNode;
  selectedNodeId: string;
  keyboardFocusedNodeId?: string;
  onSelectNode: (nodeId: string) => void;
  onKeyboardFocusNode?: (nodeId: string) => void;
  onNodeContextMenu?: (nodeId: string, x: number, y: number) => void;
  summaries?: NodeSummaryMap;
  nodeFields?: NodeFieldVisibility;
  rootSamples?: number;
  parentSamples?: number;
  depth?: number;
};

export function rowCountLabel(node: TreeNode, nodeFields: NodeFieldVisibility, rootSamples: number, parentSamples: number): string {
  if (nodeFields.rowCountFormat === "percent_root") {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(rootSamples ? node.samples / rootSamples * 100 : 0)}% of root rows`;
  }
  if (nodeFields.rowCountFormat === "percent_parent") {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(parentSamples ? node.samples / parentSamples * 100 : 0)}% of parent rows`;
  }
  return `${node.samples.toLocaleString()} rows`;
}

function NodeCard({ node, selected, keyboardFocused, onSelect, onFocus, onContextMenu, summaries, nodeFields, rootSamples, parentSamples, depth }: {
  node: TreeNode;
  selected: boolean;
  keyboardFocused: boolean;
  onSelect: () => void;
  onFocus?: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  summaries?: NodeSummaryMap;
  nodeFields: NodeFieldVisibility;
  rootSamples: number;
  parentSamples: number;
  depth: number;
}) {
  return (
    <button
      className={`node-card${selected ? " node-card--selected" : ""}${keyboardFocused ? " node-card--keyboard-focused" : ""}`}
      data-node-id={node.id}
      onClick={onSelect}
      onFocus={onFocus}
      onContextMenu={onContextMenu}
      tabIndex={keyboardFocused ? 0 : -1}
      role="treeitem"
      aria-level={depth}
      aria-selected={selected}
      aria-expanded={node.children.length ? true : undefined}
      type="button"
    >
      {nodeFields.nodeName && <span className="node-card__eyebrow">{node.id === "root" ? "Root node" : `Node ${node.id}`}</span>}
      {nodeFields.nodeTitle && <strong>{node.title}</strong>}
      {nodeFields.rowCount && <span>{rowCountLabel(node, nodeFields, rootSamples, parentSamples)}</span>}
      {summaries?.[node.id]?.map((summary) => (
        <span className={`node-card__summary${summary.highlighted ? " node-card__summary--highlighted" : ""}`} key={summary.id ?? summary.label} title={summary.label}>
          <small>{summary.label}</small>
          <b>{summary.value}</b>
        </span>
      ))}
    </button>
  );
}

export function TreeCanvas({ node, selectedNodeId, keyboardFocusedNodeId, onSelectNode, onKeyboardFocusNode, onNodeContextMenu, summaries, nodeFields = defaultNodeFields, rootSamples = node.samples, parentSamples = node.samples, depth = 1 }: Props) {
  return (
    <div className="tree" role={depth === 1 ? "tree" : "group"} aria-label={depth === 1 ? "Decision tree" : undefined} data-keyboard-region={depth === 1 ? "tree" : undefined}>
      <NodeCard
        node={node}
        selected={node.id === selectedNodeId}
        keyboardFocused={node.id === (keyboardFocusedNodeId ?? (depth === 1 ? node.id : ""))}
        onSelect={() => onSelectNode(node.id)}
        onFocus={onKeyboardFocusNode ? () => onKeyboardFocusNode(node.id) : undefined}
        onContextMenu={onNodeContextMenu ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          onNodeContextMenu(node.id, event.clientX, event.clientY);
        } : undefined}
        summaries={summaries}
        nodeFields={nodeFields}
        rootSamples={rootSamples}
        parentSamples={parentSamples}
        depth={depth}
      />
      {node.children.length > 0 && (
        <div className="tree__split">
          <span className="tree__split-label">{node.split?.kind === "random" ? "Random sample" : node.split?.feature ?? "Split"}</span>
          <div className="tree__children">
            {node.children.map((child) => (
              <div className="tree__branch" key={child.id}>
                <span className="tree__branch-label">{child.branchLabel}</span>
                <TreeCanvas
                  node={child}
                  selectedNodeId={selectedNodeId}
                  keyboardFocusedNodeId={keyboardFocusedNodeId}
                  onSelectNode={onSelectNode}
                  onKeyboardFocusNode={onKeyboardFocusNode}
                  onNodeContextMenu={onNodeContextMenu}
                  summaries={summaries}
                  nodeFields={nodeFields}
                  rootSamples={rootSamples}
                  parentSamples={node.samples}
                  depth={depth + 1}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
