import type { TreeNode } from "./domain";
import { defaultNodeFields, type NodeFieldVisibility, type NodeSummaryMap } from "./tree-settings";

type Props = {
  node: TreeNode;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  summaries?: NodeSummaryMap;
  nodeFields?: NodeFieldVisibility;
};

function NodeCard({ node, selected, onSelect, summaries, nodeFields }: {
  node: TreeNode;
  selected: boolean;
  onSelect: () => void;
  summaries?: NodeSummaryMap;
  nodeFields: NodeFieldVisibility;
}) {
  return (
    <button
      className={`node-card${selected ? " node-card--selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      {nodeFields.nodeName && <span className="node-card__eyebrow">{node.id === "root" ? "Root node" : `Node ${node.id}`}</span>}
      {nodeFields.nodeTitle && <strong>{node.title}</strong>}
      {nodeFields.rowCount && <span>{node.samples.toLocaleString()} rows</span>}
      {summaries?.[node.id]?.map((summary) => (
        <span className={`node-card__summary${summary.highlighted ? " node-card__summary--highlighted" : ""}`} key={summary.id ?? summary.label} title={summary.label}>
          <small>{summary.label}</small>
          <b>{summary.value}</b>
        </span>
      ))}
    </button>
  );
}

export function TreeCanvas({ node, selectedNodeId, onSelectNode, summaries, nodeFields = defaultNodeFields }: Props) {
  return (
    <div className="tree" aria-label="Decision tree">
      <NodeCard
        node={node}
        selected={node.id === selectedNodeId}
        onSelect={() => onSelectNode(node.id)}
        summaries={summaries}
        nodeFields={nodeFields}
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
                  summaries={summaries}
                  nodeFields={nodeFields}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
