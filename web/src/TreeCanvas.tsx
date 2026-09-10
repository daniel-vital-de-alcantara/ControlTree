import type { MouseEvent as ReactMouseEvent } from "react";

import type { TreeNode } from "./domain";
import { defaultNodeFields, type NodeFieldVisibility, type NodeSummaryMap } from "./tree-settings";

type Props = {
  node: TreeNode;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onNodeContextMenu?: (nodeId: string, x: number, y: number) => void;
  summaries?: NodeSummaryMap;
  nodeFields?: NodeFieldVisibility;
  rootSamples?: number;
  parentSamples?: number;
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

function NodeCard({ node, selected, onSelect, onContextMenu, summaries, nodeFields, rootSamples, parentSamples }: {
  node: TreeNode;
  selected: boolean;
  onSelect: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  summaries?: NodeSummaryMap;
  nodeFields: NodeFieldVisibility;
  rootSamples: number;
  parentSamples: number;
}) {
  return (
    <button
      className={`node-card${selected ? " node-card--selected" : ""}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
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

export function TreeCanvas({ node, selectedNodeId, onSelectNode, onNodeContextMenu, summaries, nodeFields = defaultNodeFields, rootSamples = node.samples, parentSamples = node.samples }: Props) {
  return (
    <div className="tree" aria-label="Decision tree">
      <NodeCard
        node={node}
        selected={node.id === selectedNodeId}
        onSelect={() => onSelectNode(node.id)}
        onContextMenu={onNodeContextMenu ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          onNodeContextMenu(node.id, event.clientX, event.clientY);
        } : undefined}
        summaries={summaries}
        nodeFields={nodeFields}
        rootSamples={rootSamples}
        parentSamples={parentSamples}
      />
      {node.children.length > 0 && (
        <div className="tree__split">
          <span className="tree__split-label">{node.split?.feature ?? "Split"}</span>
          <div className="tree__children">
            {node.children.map((child) => (
              <div className="tree__branch" key={child.id}>
                <span className="tree__branch-label">{child.branchLabel}</span>
                <TreeCanvas
                  node={child}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={onSelectNode}
                  onNodeContextMenu={onNodeContextMenu}
                  summaries={summaries}
                  nodeFields={nodeFields}
                  rootSamples={rootSamples}
                  parentSamples={node.samples}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
