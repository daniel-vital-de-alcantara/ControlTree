import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

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
  layout?: "tidy" | "compact";
};

export function rowCountLabel(node: TreeNode, nodeFields: NodeFieldVisibility, rootSamples: number, parentSamples: number): string {
  const share = (format: "percent_root" | "percent_parent") => {
    const denominator = format === "percent_root" ? rootSamples : parentSamples;
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(denominator ? node.samples / denominator * 100 : 0)}%`;
  };
  if (nodeFields.rowCountFormat === "percent_root") {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(rootSamples ? node.samples / rootSamples * 100 : 0)}% of root rows`;
  }
  if (nodeFields.rowCountFormat === "percent_parent") {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(parentSamples ? node.samples / parentSamples * 100 : 0)}% of parent rows`;
  }
  const secondary = nodeFields.rowCountSecondaryFormat ? ` (${share(nodeFields.rowCountSecondaryFormat)})` : "";
  return `${node.samples.toLocaleString()}${secondary} rows`;
}

function NodeCard({ node, selected, keyboardFocused, onSelect, onFocus, onContextMenu, summaries, nodeFields, rootSamples, parentSamples, depth, buttonRef }: {
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
  buttonRef?: (element: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      className={`node-card${node.samples === 0 ? " node-card--empty" : ""}${selected ? " node-card--selected" : ""}${keyboardFocused ? " node-card--keyboard-focused" : ""}`}
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
      ref={buttonRef}
    >
      {nodeFields.nodeName && <span className="node-card__eyebrow">{node.id === "root" ? "Root node" : `Node ${node.id}`}</span>}
      {nodeFields.nodeTitle && <strong>{node.title}</strong>}
      {nodeFields.rowCount && <span className="node-card__row-count">{rowCountLabel(node, nodeFields, rootSamples, parentSamples)}</span>}
      {node.samples === 0 && <span className="node-card__empty-label">Empty branch</span>}
      {summaries?.[node.id]?.map((summary) => (
        <span className={`node-card__summary${summary.highlighted ? " node-card__summary--highlighted" : ""}`} key={summary.id ?? summary.label} title={summary.label}>
          <small>{summary.label}</small>
          <b>{summary.value}</b>
        </span>
      ))}
    </button>
  );
}

type CompactItem = { node: TreeNode; depth: number; parentId?: string; parentSamples: number };

function compactItems(root: TreeNode): CompactItem[][] {
  const levels: CompactItem[][] = [];
  function visit(node: TreeNode, depth: number, parent?: TreeNode) {
    (levels[depth] ??= []).push({ node, depth: depth + 1, parentId: parent?.id, parentSamples: parent?.samples ?? node.samples });
    node.children.forEach((child) => visit(child, depth + 1, node));
  }
  visit(root, 0);
  return levels;
}

function CompactTreeCanvas({ node, selectedNodeId, keyboardFocusedNodeId, onSelectNode, onKeyboardFocusNode, onNodeContextMenu, summaries, nodeFields, rootSamples }: Required<Pick<Props, "node" | "selectedNodeId" | "onSelectNode">> & Pick<Props, "keyboardFocusedNodeId" | "onKeyboardFocusNode" | "onNodeContextMenu" | "summaries"> & { nodeFields: NodeFieldVisibility; rootSamples: number }) {
  const levels = useMemo(() => compactItems(node), [node]);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [paths, setPaths] = useState<Array<{ id: string; path: string }>>([]);

  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      const origin = container.getBoundingClientRect();
      const next: Array<{ id: string; path: string }> = [];
      levels.flat().forEach(({ node: child, parentId }) => {
        if (!parentId) return;
        const parentElement = buttonRefs.current.get(parentId);
        const childElement = buttonRefs.current.get(child.id);
        if (!parentElement || !childElement) return;
        const parent = parentElement.getBoundingClientRect();
        const target = childElement.getBoundingClientRect();
        const startX = parent.left + parent.width / 2 - origin.left;
        const startY = parent.bottom - origin.top;
        const endX = target.left + target.width / 2 - origin.left;
        const endY = target.top - origin.top;
        const middleY = startY + (endY - startY) / 2;
        next.push({ id: `${parentId}-${child.id}`, path: `M${startX},${startY} V${middleY} H${endX} V${endY}` });
      });
      setPaths(next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    if (containerRef.current) observer?.observe(containerRef.current);
    buttonRefs.current.forEach((element) => observer?.observe(element));
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [levels, summaries, nodeFields]);

  return (
    <div className="tree compact-tree" ref={containerRef} role="tree" aria-label="Decision tree" data-keyboard-region="tree">
      <svg className="compact-tree__connectors" aria-hidden="true"><g>{paths.map((edge) => <path d={edge.path} key={edge.id} />)}</g></svg>
      {levels.map((level, levelIndex) => (
        <div className="compact-tree__level" role="group" key={levelIndex}>
          {level.map(({ node: item, depth, parentSamples }) => (
            <div className="compact-tree__item" key={item.id}>
              {levelIndex > 0 && <span className="compact-tree__branch-label" title={item.branchLabel}>{item.branchLabel}</span>}
              <NodeCard
                node={item}
                selected={item.id === selectedNodeId}
                keyboardFocused={item.id === (keyboardFocusedNodeId ?? node.id)}
                onSelect={() => onSelectNode(item.id)}
                onFocus={onKeyboardFocusNode ? () => onKeyboardFocusNode(item.id) : undefined}
                onContextMenu={onNodeContextMenu ? (event) => { event.preventDefault(); event.stopPropagation(); onNodeContextMenu(item.id, event.clientX, event.clientY); } : undefined}
                summaries={summaries}
                nodeFields={nodeFields}
                rootSamples={rootSamples}
                parentSamples={parentSamples}
                depth={depth}
                buttonRef={(element) => { if (element) buttonRefs.current.set(item.id, element); else buttonRefs.current.delete(item.id); }}
              />
              {item.split && <span className="compact-tree__split-label" title={item.split.kind === "random" ? "Random sample" : item.split.feature}>{item.split.kind === "random" ? "Random sample" : item.split.feature}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TreeCanvas({ node, selectedNodeId, keyboardFocusedNodeId, onSelectNode, onKeyboardFocusNode, onNodeContextMenu, summaries, nodeFields = defaultNodeFields, rootSamples = node.samples, parentSamples = node.samples, depth = 1, layout = "tidy" }: Props) {
  if (depth === 1 && layout === "compact") return <CompactTreeCanvas node={node} selectedNodeId={selectedNodeId} keyboardFocusedNodeId={keyboardFocusedNodeId} onSelectNode={onSelectNode} onKeyboardFocusNode={onKeyboardFocusNode} onNodeContextMenu={onNodeContextMenu} summaries={summaries} nodeFields={nodeFields} rootSamples={rootSamples} />;
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
                  layout={layout}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
