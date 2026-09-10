import type { ParsedDataset } from "./dataset";
import { materializeSplit } from "./data-engine";
import { findTreeNode, type TreeNode, type TreeSplitDefinition } from "./domain";

const CLIPBOARD_FORMAT = "controltree-splits";
const FALLBACK_KEY = "controltree:split-clipboard";

type ClipboardNode = {
  title?: string;
  split?: TreeSplitDefinition;
  children: ClipboardNode[];
};

type SplitClipboardPayload = {
  format: typeof CLIPBOARD_FORMAT;
  version: 1;
  mode: "single" | "subtree";
  tree: ClipboardNode;
};

function copiedNode(node: TreeNode, deep: boolean): ClipboardNode {
  return {
    ...(deep ? { title: node.title } : {}),
    ...(node.split ? { split: node.split } : {}),
    children: node.split
      ? node.children.map((child) => deep ? copiedNode(child, true) : { children: [] })
      : [],
  };
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
}

function parsedSplit(value: unknown): TreeSplitDefinition | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error("The copied split is invalid.");
  const split = value as Record<string, unknown>;
  if (typeof split.feature !== "string" || !split.feature) throw new Error("The copied split has no variable.");
  if (split.kind === "binary" && (split.operator === "<=" || split.operator === "==") && isPrimitive(split.value)) {
    return { kind: "binary", feature: split.feature, operator: split.operator, value: split.value };
  }
  if (split.kind === "manual" && Array.isArray(split.values) && split.values.length && split.values.every(isPrimitive)) {
    return { kind: "manual", feature: split.feature, values: split.values, forceCategorical: split.forceCategorical === true, includeOther: split.includeOther !== false };
  }
  throw new Error("The copied split is invalid.");
}

function parsedNode(value: unknown): ClipboardNode {
  if (!value || typeof value !== "object") throw new Error("The copied subtree is invalid.");
  const node = value as Record<string, unknown>;
  if (!Array.isArray(node.children)) throw new Error("The copied subtree is invalid.");
  const split = parsedSplit(node.split);
  const children = node.children.map(parsedNode);
  if (split && children.length < 2) throw new Error("The copied split has too few branches.");
  if (!split && children.length) throw new Error("The copied subtree is invalid.");
  return { ...(typeof node.title === "string" ? { title: node.title } : {}), ...(split ? { split } : {}), children };
}

export function serializeCopiedSplits(node: TreeNode, mode: "single" | "subtree"): string {
  if (!node.split) throw new Error("This node does not have a split to copy.");
  return JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, mode, tree: copiedNode(node, mode === "subtree") } satisfies SplitClipboardPayload, null, 2);
}

export function parseCopiedSplits(text: string): SplitClipboardPayload {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("The clipboard does not contain a ControlTree split."); }
  if (!value || typeof value !== "object") throw new Error("The clipboard does not contain a ControlTree split.");
  const payload = value as Record<string, unknown>;
  if (payload.format !== CLIPBOARD_FORMAT || payload.version !== 1 || (payload.mode !== "single" && payload.mode !== "subtree")) {
    throw new Error("The clipboard does not contain a compatible ControlTree split.");
  }
  return { format: CLIPBOARD_FORMAT, version: 1, mode: payload.mode, tree: parsedNode(payload.tree) };
}

export async function copySplitsToClipboard(node: TreeNode, mode: "single" | "subtree"): Promise<boolean> {
  const text = serializeCopiedSplits(node, mode);
  localStorage.setItem(FALLBACK_KEY, text);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* the same-origin fallback still works */ }
  return false;
}

export async function readSplitsFromClipboard(): Promise<SplitClipboardPayload> {
  let text = "";
  try { text = await navigator.clipboard?.readText?.() ?? ""; } catch { /* use same-origin fallback */ }
  if (!text) text = localStorage.getItem(FALLBACK_KEY) ?? "";
  return parseCopiedSplits(text);
}

function materializeCopiedNode(dataset: ParsedDataset, copied: ClipboardNode, rowIndices: number[], id: string, title: string, branchLabel?: string): TreeNode {
  const base: TreeNode = { id, title, samples: rowIndices.length, rowIndices, ...(branchLabel ? { branchLabel } : {}), children: [] };
  if (!copied.split) return base;
  const branches = materializeSplit(dataset, rowIndices, copied.split);
  if (branches.length !== copied.children.length || branches.some((branch) => branch.rowIndices.length === 0)) {
    throw new Error(`The copied split on “${copied.split.feature}” does not produce the same branches in this node.`);
  }
  return {
    ...base,
    split: copied.split,
    children: branches.map((branch, index) => materializeCopiedNode(
      dataset,
      copied.children[index],
      branch.rowIndices,
      `${id}.${index + 1}`,
      copied.children[index].title ?? (copied.split?.kind === "binary" ? index === 0 ? "Matching rows" : "Remaining rows" : `Branch ${index + 1}`),
      branch.label,
    )),
  };
}

export function pasteCopiedSplits(dataset: ParsedDataset, root: TreeNode, nodeId: string, payload: SplitClipboardPayload): TreeNode {
  const destination = findTreeNode(root, nodeId);
  if (!destination?.rowIndices) throw new Error("Select a node with uploaded data before pasting a split.");
  const replacement = materializeCopiedNode(dataset, payload.tree, destination.rowIndices, destination.id, destination.title, destination.branchLabel);
  function replace(node: TreeNode): TreeNode {
    return node.id === nodeId ? replacement : { ...node, children: node.children.map(replace) };
  }
  return replace(root);
}
